var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// worker.js
var json = /* @__PURE__ */ __name((o, status = 200) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } }), "json");
var hex = /* @__PURE__ */ __name((buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join(""), "hex");
var sha = /* @__PURE__ */ __name(async (s) => hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s))), "sha");
var rand = /* @__PURE__ */ __name((n = 32) => hex(crypto.getRandomValues(new Uint8Array(n))), "rand");
var CHUNK = 9e5;
var DAY = 864e5;
var Accounts = class {
  static {
    __name(this, "Accounts");
  }
  constructor(ctx, env) {
    this.ctx = ctx;
    this.sql = ctx.storage.sql;
    this.sql.exec("CREATE TABLE IF NOT EXISTS users (email TEXT PRIMARY KEY, salt TEXT NOT NULL, hash TEXT NOT NULL, fam TEXT NOT NULL, created INTEGER NOT NULL, fails INTEGER NOT NULL DEFAULT 0, locked INTEGER NOT NULL DEFAULT 0)");
    this.sql.exec("CREATE TABLE IF NOT EXISTS sessions (tok TEXT PRIMARY KEY, email TEXT NOT NULL, exp INTEGER NOT NULL)");
    this.sql.exec("CREATE TABLE IF NOT EXISTS fams (fam TEXT PRIMARY KEY, ver INTEGER NOT NULL, n INTEGER NOT NULL, updated INTEGER NOT NULL)");
    this.sql.exec("CREATE TABLE IF NOT EXISTS chunks (fam TEXT NOT NULL, i INTEGER NOT NULL, part TEXT NOT NULL, PRIMARY KEY (fam, i))");
  }
  one(q, ...a) {
    const r = this.sql.exec(q, ...a).toArray();
    return r[0] || null;
  }
  async session(req) {
    const m = (req.headers.get("authorization") || "").match(/^Bearer ([0-9a-f]{64})$/);
    if (!m) return null;
    const s = this.one("SELECT email, exp FROM sessions WHERE tok = ?", await sha(m[1]));
    if (!s || s.exp < Date.now()) return null;
    return this.one("SELECT email, fam FROM users WHERE email = ?", s.email);
  }
  async newSession(email) {
    const tok = rand();
    this.sql.exec("INSERT INTO sessions (tok, email, exp) VALUES (?, ?, ?)", await sha(tok), email, Date.now() + 180 * DAY);
    return tok;
  }
  read(fam) {
    const f = this.one("SELECT ver, n FROM fams WHERE fam = ?", fam);
    if (!f || !f.n) return { data: null, ver: f ? f.ver : 0 };
    const parts = this.sql.exec("SELECT part FROM chunks WHERE fam = ? ORDER BY i", fam).toArray().map((r) => r.part);
    return { data: parts.join(""), ver: f.ver };
  }
  write(fam, data) {
    const f = this.one("SELECT ver FROM fams WHERE fam = ?", fam), ver = (f ? f.ver : 0) + 1, n = Math.ceil(data.length / CHUNK);
    this.ctx.storage.transactionSync(() => {
      this.sql.exec("DELETE FROM chunks WHERE fam = ?", fam);
      for (let i = 0; i < n; i++) this.sql.exec("INSERT INTO chunks (fam, i, part) VALUES (?, ?, ?)", fam, i, data.slice(i * CHUNK, (i + 1) * CHUNK));
      this.sql.exec("INSERT INTO fams (fam, ver, n, updated) VALUES (?, ?, ?, ?) ON CONFLICT(fam) DO UPDATE SET ver = excluded.ver, n = excluded.n, updated = excluded.updated", fam, ver, n, Date.now());
    });
    return ver;
  }
  async fetch(req) {
    const url = new URL(req.url), path = url.pathname.replace(/^\/api/, ""), method = req.method;
    let body = {};
    if (method === "POST" || method === "PUT") {
      try {
        body = await req.json();
      } catch (e) {
        return json({ error: "bad_request" }, 400);
      }
    }
    const email = String(body.email || "").trim().toLowerCase(), hash = String(body.hash || "");
    const okCreds = /^\S+@\S+\.\S+$/.test(email) && email.length <= 200 && /^[0-9a-f]{64}$/.test(hash);
    if (path === "/ping") return json({ ok: true });
    if (path === "/signup" && method === "POST") {
      if (!okCreds) return json({ error: "bad_request" }, 400);
      if (this.one("SELECT email FROM users WHERE email = ?", email)) return json({ error: "exists" }, 409);
      const salt = rand(16), fam = rand(16);
      this.sql.exec("INSERT INTO users (email, salt, hash, fam, created) VALUES (?, ?, ?, ?, ?)", email, salt, await sha(salt + hash), fam, Date.now());
      this.sql.exec("INSERT INTO fams (fam, ver, n, updated) VALUES (?, 0, 0, ?)", fam, Date.now());
      return json({ token: await this.newSession(email), ver: 0 });
    }
    if (path === "/login" && method === "POST") {
      if (!okCreds) return json({ error: "bad_request" }, 400);
      const u = this.one("SELECT * FROM users WHERE email = ?", email);
      if (!u) return json({ error: "nouser" }, 404);
      if (u.locked > Date.now()) return json({ error: "locked", minutes: Math.ceil((u.locked - Date.now()) / 6e4) }, 429);
      if (await sha(u.salt + hash) !== u.hash) {
        const fails = u.fails + 1;
        this.sql.exec("UPDATE users SET fails = ?, locked = ? WHERE email = ?", fails >= 8 ? 0 : fails, fails >= 8 ? Date.now() + 15 * 6e4 : 0, email);
        return json({ error: "wrong" }, 401);
      }
      this.sql.exec("UPDATE users SET fails = 0, locked = 0 WHERE email = ?", email);
      this.sql.exec("DELETE FROM sessions WHERE exp < ?", Date.now());
      return json({ token: await this.newSession(email), ver: this.read(u.fam).ver });
    }
    const me = await this.session(req);
    if (!me) return json({ error: "signin" }, 401);
    if (path === "/ver" && method === "GET") {
      const f = this.one("SELECT ver FROM fams WHERE fam = ?", me.fam);
      return json({ ver: f ? f.ver : 0 });
    }
    if (path === "/data" && method === "GET") return json(this.read(me.fam));
    if (path === "/data" && method === "PUT") {
      const data = String(body.data || "");
      if (!data || data.length > 6e7) return json({ error: "bad_request" }, 400);
      try {
        JSON.parse(data);
      } catch (e) {
        return json({ error: "bad_request" }, 400);
      }
      return json({ ver: this.write(me.fam, data) });
    }
    if (path === "/logout" && method === "POST") {
      const m = (req.headers.get("authorization") || "").match(/^Bearer ([0-9a-f]{64})$/);
      if (m) this.sql.exec("DELETE FROM sessions WHERE tok = ?", await sha(m[1]));
      return json({ ok: true });
    }
    if (path === "/account" && method === "DELETE") {
      this.ctx.storage.transactionSync(() => {
        this.sql.exec("DELETE FROM chunks WHERE fam = ?", me.fam);
        this.sql.exec("DELETE FROM fams WHERE fam = ?", me.fam);
        this.sql.exec("DELETE FROM sessions WHERE email = ?", me.email);
        this.sql.exec("DELETE FROM users WHERE email = ?", me.email);
      });
      return json({ ok: true });
    }
    return json({ error: "not_found" }, 404);
  }
};
var worker_default = {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname.startsWith("/api/")) {
      if (req.method === "OPTIONS") return new Response(null, { status: 204 });
      const stub = env.ACCOUNTS.get(env.ACCOUNTS.idFromName("families"));
      return stub.fetch(req);
    }
    return env.ASSETS.fetch(req);
  }
};

// ../../../root/.npm/_npx/c943b712072b77c4/node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
var drainBody = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default = drainBody;

// ../../../root/.npm/_npx/c943b712072b77c4/node_modules/wrangler/templates/middleware/middleware-miniflare3-json-error.ts
function reduceError(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError(e.cause)
  };
}
__name(reduceError, "reduceError");
var jsonError = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } catch (e) {
    const error = reduceError(e);
    const body = JSON.stringify(error);
    const headers = {
      "Content-Type": "application/json",
      "MF-Experimental-Error-Stack": "true"
    };
    const encoded = encodeURIComponent(body);
    if (encoded.length <= 8192) {
      headers["MF-Experimental-Error-Stack-Payload"] = encoded;
    }
    return new Response(body, { status: 500, headers });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default = jsonError;

// .wrangler/tmp/bundle-lAP8Cg/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default,
  middleware_miniflare3_json_error_default
];
var middleware_insertion_facade_default = worker_default;

// ../../../root/.npm/_npx/c943b712072b77c4/node_modules/wrangler/templates/middleware/common.ts
var __facade_middleware__ = [];
function __facade_register__(...args) {
  __facade_middleware__.push(...args.flat());
}
__name(__facade_register__, "__facade_register__");
function __facade_invokeChain__(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__, "__facade_invokeChain__");
function __facade_invoke__(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__(request, env, ctx, dispatch, [
    ...__facade_middleware__,
    finalMiddleware
  ]);
}
__name(__facade_invoke__, "__facade_invoke__");

// .wrangler/tmp/bundle-lAP8Cg/middleware-loader.entry.ts
var __Facade_ScheduledController__ = class ___Facade_ScheduledController__ {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  scheduledTime;
  cron;
  static {
    __name(this, "__Facade_ScheduledController__");
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof ___Facade_ScheduledController__)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
function wrapExportedHandler(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler, "wrapExportedHandler");
function wrapWorkerEntrypoint(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  return class extends klass {
    #fetchDispatcher = /* @__PURE__ */ __name((request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    }, "#fetchDispatcher");
    #dispatcher = /* @__PURE__ */ __name((type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    }, "#dispatcher");
    fetch(request) {
      return __facade_invoke__(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY;
if (typeof middleware_insertion_facade_default === "object") {
  WRAPPED_ENTRY = wrapExportedHandler(middleware_insertion_facade_default);
} else if (typeof middleware_insertion_facade_default === "function") {
  WRAPPED_ENTRY = wrapWorkerEntrypoint(middleware_insertion_facade_default);
}
var middleware_loader_entry_default = WRAPPED_ENTRY;
export {
  Accounts,
  __INTERNAL_WRANGLER_MIDDLEWARE__,
  middleware_loader_entry_default as default
};
//# sourceMappingURL=worker.js.map
