// Plays the pre-recorded Kokoro clips made by record_voices.py. Free: no API, works offline.
// Use: <script src="voice-kit/voice-player.js"></script>, then VoicePlayer.say('Jesus loves you!')
// If a sentence was not recorded, it stitches it from recorded words, and if that is not
// possible it uses the device's own voice. On iPhone/iPad sound only starts after a tap.
(function(){
  const V = { base: 'voice/', man: null, manP: null, packs: {}, packP: {}, bufs: {}, srcs: [], ctx: null };
  const norm = s => String(s).toLowerCase().replace(/[’‘]/g, "'").replace(/[^a-z0-9' ]+/g, ' ').replace(/\s+/g, ' ').trim();
  const split = t => String(t).replace(/<[^>]+>/g, '').split(/(?<=[.!?])\s+/).map(x => x.trim()).filter(Boolean);
  const manifest = () => V.man ? Promise.resolve(V.man) : (V.manP = V.manP || fetch(V.base + 'manifest.json').then(r => r.ok ? r.json() : null).then(m => (V.man = m)).catch(() => null));
  const pack = i => V.packs[i] ? Promise.resolve(V.packs[i]) : (V.packP[i] = V.packP[i] || fetch(V.man.packs[i].replace(/^[^/]*\//, V.base)).then(r => r.json()).then(p => (V.packs[i] = p)));
  function plan(text, keys){ const out = [];
    for (const s of split(text)){ const n = norm(s); if (!n) continue; if (keys[n] != null){ out.push({ k: n, gap: .2 }); continue; }
      const w = n.split(' '), L = w.length, best = Array(L + 1).fill(Infinity), back = Array(L + 1).fill(-1); best[0] = 0;   // fewest pieces
      for (let i = 0; i < L; i++){ if (best[i] === Infinity) continue; for (let j = Math.min(L, i + 16); j > i; j--){ if (keys[w.slice(i, j).join(' ')] != null && best[i] + 1 < best[j]){ best[j] = best[i] + 1; back[j] = i; } } }
      if (best[L] === Infinity) return null; const seg = []; for (let j = L; j > 0; j = back[j]) seg.unshift(w.slice(back[j], j).join(' '));
      seg.forEach(k => out.push({ k, gap: .05 })); out[out.length - 1].gap = .2; }
    return out.length ? out : null; }
  function unlock(){ if (!V.ctx){ const C = window.AudioContext || window.webkitAudioContext; if (C) V.ctx = new C(); } if (V.ctx && V.ctx.state === 'suspended') V.ctx.resume(); }
  ['pointerdown', 'touchend', 'keydown'].forEach(ev => document.addEventListener(ev, unlock, { capture: true, passive: true }));
  async function buffer(k){ if (V.bufs[k]) return V.bufs[k]; const p = await pack(V.man.keys[k]), bin = atob(p[k]), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    return (V.bufs[k] = await new Promise((res, rej) => V.ctx.decodeAudioData(u.buffer, res, rej))); }
  function stop(){ V.srcs.forEach(s => { try { s.stop(); } catch (e) {} }); V.srcs = []; try { speechSynthesis.cancel(); } catch (e) {} }
  function device(t){ try { const u = new SpeechSynthesisUtterance(t); u.rate = .9; speechSynthesis.speak(u); } catch (e) {} }
  async function say(text){ stop(); unlock(); const man = await manifest(), p = man && V.ctx && plan(text, man.keys); if (!p) return device(text);
    let bufs; try { bufs = await Promise.all(p.map(x => buffer(x.k))); } catch (e) { return device(text); }
    let at = V.ctx.currentTime + .03; bufs.forEach((b, i) => { const s = V.ctx.createBufferSource(); s.buffer = b; s.connect(V.ctx.destination); s.start(at); V.srcs.push(s); at += b.duration + p[i].gap; }); }
  window.VoicePlayer = { say, stop, setBase: b => { V.base = b.endsWith('/') ? b : b + '/'; } };
})();
