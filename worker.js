// Chore Buddies server on Cloudflare: serves the app, and keeps family accounts so a family
// can sign in on any device. Passwords never reach the server: the app sends a strong hash of
// the password, and the server stores a salted hash of that.
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
const sha = async s => hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));
const rand = (n = 32) => hex(crypto.getRandomValues(new Uint8Array(n)));
const CHUNK = 900000, DAY = 864e5;

export class Accounts {
  constructor(ctx, env){
    this.ctx = ctx; this.sql = ctx.storage.sql;
    this.sql.exec('CREATE TABLE IF NOT EXISTS users (email TEXT PRIMARY KEY, salt TEXT NOT NULL, hash TEXT NOT NULL, fam TEXT NOT NULL, created INTEGER NOT NULL, fails INTEGER NOT NULL DEFAULT 0, locked INTEGER NOT NULL DEFAULT 0)');
    this.sql.exec('CREATE TABLE IF NOT EXISTS sessions (tok TEXT PRIMARY KEY, email TEXT NOT NULL, exp INTEGER NOT NULL)');
    this.sql.exec('CREATE TABLE IF NOT EXISTS fams (fam TEXT PRIMARY KEY, ver INTEGER NOT NULL, n INTEGER NOT NULL, updated INTEGER NOT NULL)');
    this.sql.exec('CREATE TABLE IF NOT EXISTS chunks (fam TEXT NOT NULL, i INTEGER NOT NULL, part TEXT NOT NULL, PRIMARY KEY (fam, i))');
  }
  one(q, ...a){ const r = this.sql.exec(q, ...a).toArray(); return r[0] || null; }
  async session(req){
    const m = (req.headers.get('authorization') || '').match(/^Bearer ([0-9a-f]{64})$/); if (!m) return null;
    const s = this.one('SELECT email, exp FROM sessions WHERE tok = ?', await sha(m[1]));
    if (!s || s.exp < Date.now()) return null;
    return this.one('SELECT email, fam FROM users WHERE email = ?', s.email);
  }
  async newSession(email){ const tok = rand(); this.sql.exec('INSERT INTO sessions (tok, email, exp) VALUES (?, ?, ?)', await sha(tok), email, Date.now() + 180 * DAY); return tok; }
  read(fam){ const f = this.one('SELECT ver, n FROM fams WHERE fam = ?', fam); if (!f || !f.n) return { data: null, ver: f ? f.ver : 0 };
    const parts = this.sql.exec('SELECT part FROM chunks WHERE fam = ? ORDER BY i', fam).toArray().map(r => r.part); return { data: parts.join(''), ver: f.ver }; }
  write(fam, data){
    const f = this.one('SELECT ver FROM fams WHERE fam = ?', fam), ver = (f ? f.ver : 0) + 1, n = Math.ceil(data.length / CHUNK);
    this.ctx.storage.transactionSync(() => {
      this.sql.exec('DELETE FROM chunks WHERE fam = ?', fam);
      for (let i = 0; i < n; i++) this.sql.exec('INSERT INTO chunks (fam, i, part) VALUES (?, ?, ?)', fam, i, data.slice(i * CHUNK, (i + 1) * CHUNK));
      this.sql.exec('INSERT INTO fams (fam, ver, n, updated) VALUES (?, ?, ?, ?) ON CONFLICT(fam) DO UPDATE SET ver = excluded.ver, n = excluded.n, updated = excluded.updated', fam, ver, n, Date.now());
    });
    return ver;
  }
  async fetch(req){
    const url = new URL(req.url), path = url.pathname.replace(/^\/api/, ''), method = req.method;
    let body = {}; if (method === 'POST' || method === 'PUT'){ try { body = await req.json(); } catch (e) { return json({ error: 'bad_request' }, 400); } }
    const email = String(body.email || '').trim().toLowerCase(), hash = String(body.hash || '');
    const okCreds = /^\S+@\S+\.\S+$/.test(email) && email.length <= 200 && /^[0-9a-f]{64}$/.test(hash);
    if (path === '/ping') return json({ ok: true });
    if (path === '/signup' && method === 'POST'){
      if (!okCreds) return json({ error: 'bad_request' }, 400);
      if (this.one('SELECT email FROM users WHERE email = ?', email)) return json({ error: 'exists' }, 409);
      const salt = rand(16), fam = rand(16);
      this.sql.exec('INSERT INTO users (email, salt, hash, fam, created) VALUES (?, ?, ?, ?, ?)', email, salt, await sha(salt + hash), fam, Date.now());
      this.sql.exec('INSERT INTO fams (fam, ver, n, updated) VALUES (?, 0, 0, ?)', fam, Date.now());
      return json({ token: await this.newSession(email), ver: 0 });
    }
    if (path === '/login' && method === 'POST'){
      if (!okCreds) return json({ error: 'bad_request' }, 400);
      const u = this.one('SELECT * FROM users WHERE email = ?', email);
      if (!u) return json({ error: 'nouser' }, 404);
      if (u.locked > Date.now()) return json({ error: 'locked', minutes: Math.ceil((u.locked - Date.now()) / 6e4) }, 429);
      if ((await sha(u.salt + hash)) !== u.hash){ const fails = u.fails + 1; this.sql.exec('UPDATE users SET fails = ?, locked = ? WHERE email = ?', fails >= 8 ? 0 : fails, fails >= 8 ? Date.now() + 15 * 6e4 : 0, email); return json({ error: 'wrong' }, 401); }
      this.sql.exec('UPDATE users SET fails = 0, locked = 0 WHERE email = ?', email);
      this.sql.exec('DELETE FROM sessions WHERE exp < ?', Date.now());
      return json({ token: await this.newSession(email), ver: this.read(u.fam).ver });
    }
    const me = await this.session(req); if (!me) return json({ error: 'signin' }, 401);
    if (path === '/ver' && method === 'GET'){ const f = this.one('SELECT ver FROM fams WHERE fam = ?', me.fam); return json({ ver: f ? f.ver : 0 }); }
    if (path === '/data' && method === 'GET') return json(this.read(me.fam));
    if (path === '/data' && method === 'PUT'){ const data = String(body.data || ''); if (!data || data.length > 60e6) return json({ error: 'bad_request' }, 400); try { JSON.parse(data); } catch (e) { return json({ error: 'bad_request' }, 400); } return json({ ver: this.write(me.fam, data) }); }
    if (path === '/logout' && method === 'POST'){ const m = (req.headers.get('authorization') || '').match(/^Bearer ([0-9a-f]{64})$/); if (m) this.sql.exec('DELETE FROM sessions WHERE tok = ?', await sha(m[1])); return json({ ok: true }); }
    if (path === '/account' && method === 'DELETE'){ this.ctx.storage.transactionSync(() => { this.sql.exec('DELETE FROM chunks WHERE fam = ?', me.fam); this.sql.exec('DELETE FROM fams WHERE fam = ?', me.fam); this.sql.exec('DELETE FROM sessions WHERE email = ?', me.email); this.sql.exec('DELETE FROM users WHERE email = ?', me.email); }); return json({ ok: true }); }
    return json({ error: 'not_found' }, 404);
  }
}

export default {
  async fetch(req, env){
    const url = new URL(req.url);
    if (url.pathname.startsWith('/api/')){
      if (req.method === 'OPTIONS') return new Response(null, { status: 204 });
      const stub = env.ACCOUNTS.get(env.ACCOUNTS.idFromName('families'));
      return stub.fetch(req);
    }
    return env.ASSETS.fetch(req);
  }
};
