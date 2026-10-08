var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// ../lib/session-service.mjs
var HOUR = 36e5;
var HttpError = class extends Error {
  static {
    __name(this, "HttpError");
  }
  constructor(status, message) {
    super(message);
    this.status = status;
  }
};
var fail = /* @__PURE__ */ __name((status, message) => {
  throw new HttpError(status, message);
}, "fail");
var cleanCode = /* @__PURE__ */ __name((value) => {
  if (typeof value !== "string" || !/^[A-Z2-9]{8}$/.test(value)) fail(400, "\u623F\u9593\u78BC\u683C\u5F0F\u4E0D\u6B63\u78BA\u3002");
  return value;
}, "cleanCode");
var token = /* @__PURE__ */ __name(() => Array.from(crypto.getRandomValues(new Uint8Array(24)), (b) => b.toString(16).padStart(2, "0")).join(""), "token");
async function digest(value) {
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))), (b) => b.toString(16).padStart(2, "0")).join("");
}
__name(digest, "digest");
var json = /* @__PURE__ */ __name((value, status = 200) => Response.json(value, { status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } }), "json");
async function bodyOf(request) {
  const text = await request.text();
  if (text.length > 15e4) fail(413, "\u8CC7\u6599\u904E\u5927\u3002");
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    fail(400, "\u8CC7\u6599\u683C\u5F0F\u4E0D\u6B63\u78BA\u3002");
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) fail(400, "\u8CC7\u6599\u683C\u5F0F\u4E0D\u6B63\u78BA\u3002");
  return body;
}
__name(bodyOf, "bodyOf");
function createSessionService({ db, env = {}, now = /* @__PURE__ */ __name(() => Date.now(), "now"), fetcher = fetch }) {
  const first = /* @__PURE__ */ __name((sql, ...args) => db.prepare(sql).bind(...args).first(), "first");
  const run = /* @__PURE__ */ __name((sql, ...args) => db.prepare(sql).bind(...args).run(), "run");
  const all = /* @__PURE__ */ __name(async (sql, ...args) => (await db.prepare(sql).bind(...args).all()).results, "all");
  async function authorize(request, code) {
    const authorization = request.headers.get("Authorization") || "";
    if (!/^Bearer [a-f0-9]{48}$/.test(authorization)) fail(401, "\u8ACB\u91CD\u65B0\u958B\u555F\u6709\u6548\u7684\u9080\u8ACB\u6216\u5EFA\u7ACB\u623F\u9593\u3002");
    const hash2 = await digest(authorization.slice(7));
    const room = await first("SELECT * FROM rooms WHERE code = ?", cleanCode(code));
    if (!room || room.expires_at < now() || room.closed) fail(410, "\u623F\u9593\u5DF2\u7D50\u675F\u6216\u904E\u671F\uFF0C\u8ACB\u5EFA\u7ACB\u65B0\u623F\u9593\u3002");
    const role = hash2 === room.host_hash ? "host" : hash2 === room.guest_hash ? "guest" : null;
    if (!role) fail(403, "\u4F60\u6C92\u6709\u9019\u500B\u623F\u9593\u7684\u5B58\u53D6\u6B0A\u9650\u3002");
    return { room, role };
  }
  __name(authorize, "authorize");
  async function sessions(request, userId) {
    if (request.method === "GET") {
      const url = new URL(request.url);
      const { room: room2, role: role2 } = await authorize(request, url.searchParams.get("code"));
      const cursor = Number(url.searchParams.get("after") || 0);
      if (!Number.isSafeInteger(cursor) || cursor < 0) fail(400, "\u8B80\u53D6\u4F4D\u7F6E\u4E0D\u6B63\u78BA\u3002");
      await run(`UPDATE rooms SET ${role2 === "host" ? "host_seen" : "guest_seen"} = ? WHERE code = ?`, now(), room2.code);
      const messages = await all("SELECT id, sender, payload FROM signals WHERE room_code = ? AND id > ? AND sender != ? ORDER BY id LIMIT 100", room2.code, cursor, role2);
      return json({ messages: messages.map((row) => ({ id: row.id, ...JSON.parse(row.payload) })), peerOnline: (role2 === "host" ? room2.guest_seen : room2.host_seen) > now() - 18e3, expiresAt: room2.expires_at });
    }
    if (request.method !== "POST") fail(405, "\u4E0D\u652F\u63F4\u9019\u500B\u64CD\u4F5C\u3002");
    const body = await bodyOf(request);
    if (body.action === "create") {
      const count = await first("SELECT COUNT(*) AS n FROM rooms WHERE owner_id = ? AND created_at > ?", userId, now() - 6e4);
      if (count.n >= 10) fail(429, "\u5EFA\u7ACB\u623F\u9593\u592A\u983B\u5BC6\uFF0C\u8ACB\u7A0D\u5F8C\u91CD\u8A66\u3002");
      await run("DELETE FROM signals WHERE created_at < ?", now() - HOUR);
      await run("DELETE FROM rooms WHERE expires_at < ?", now());
      const invite = token(), member = token();
      let code;
      for (let i = 0; i < 5; i++) {
        const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
        code = Array.from(crypto.getRandomValues(new Uint8Array(8)), (x) => alphabet[x % alphabet.length]).join("");
        try {
          await run("INSERT INTO rooms (code, owner_id, invite_hash, host_hash, created_at, expires_at, host_seen) VALUES (?, ?, ?, ?, ?, ?, ?)", code, userId, await digest(invite), await digest(member), now(), now() + HOUR, now());
          break;
        } catch (e) {
          if (i === 4) throw e;
        }
      }
      return json({ code, invite, member, role: "host", expiresAt: now() + HOUR }, 201);
    }
    if (body.action === "join") {
      const code = cleanCode(body.code);
      if (typeof body.invite !== "string" || !/^[a-f0-9]{48}$/.test(body.invite)) fail(403, "\u9080\u8ACB\u9023\u7D50\u4E0D\u5B8C\u6574\u3002");
      const room2 = await first("SELECT * FROM rooms WHERE code = ?", code);
      if (!room2 || room2.closed || room2.expires_at < now()) fail(410, "\u623F\u9593\u5DF2\u7D50\u675F\u6216\u904E\u671F\u3002");
      if (await digest(body.invite) !== room2.invite_hash) fail(403, "\u9080\u8ACB\u9023\u7D50\u4E0D\u6B63\u78BA\u3002");
      const member = token(), hash2 = await digest(member);
      const joined = await run("UPDATE rooms SET guest_hash = ?, guest_seen = ? WHERE code = ? AND (guest_hash IS NULL OR guest_seen < ?) AND closed = 0", hash2, now(), code, now() - 6e4);
      if (!joined.meta?.changes) fail(409, "\u623F\u9593\u5DF2\u6709\u4E00\u4F4D\u5925\u4F34\uFF0C\u8ACB\u7531\u767C\u8D77\u65B9\u5EFA\u7ACB\u65B0\u623F\u9593\u3002");
      const baseline = await first("SELECT COALESCE(MAX(id),0) AS cursor FROM signals WHERE room_code = ?", code);
      await run("INSERT INTO signals (room_code, sender, payload, created_at) VALUES (?, ?, ?, ?)", code, "guest", JSON.stringify({ type: "peer-ready" }), now());
      return json({ code, member, role: "guest", cursor: baseline.cursor, expiresAt: room2.expires_at });
    }
    const { room, role } = await authorize(request, body.code);
    if (body.action === "send") {
      const message = body.message;
      if (!message || !["description", "candidate", "peer-ready", "restart", "bye", "media-state"].includes(message.type)) fail(400, "\u9023\u7DDA\u8A0A\u606F\u4E0D\u6B63\u78BA\u3002");
      const payload = JSON.stringify(message);
      if (payload.length > 11e4) fail(413, "\u9023\u7DDA\u8A0A\u606F\u904E\u5927\u3002");
      const count = await first("SELECT COUNT(*) AS n FROM signals WHERE room_code = ? AND sender = ? AND created_at > ?", room.code, role, now() - 6e4);
      if (count.n > 200) fail(429, "\u9023\u7DDA\u8A0A\u606F\u592A\u983B\u5BC6\uFF0C\u8ACB\u7A0D\u5F8C\u518D\u8A66\u3002");
      await run("INSERT INTO signals (room_code, sender, payload, created_at) VALUES (?, ?, ?, ?)", room.code, role, payload, now());
      return json({ ok: true });
    }
    if (body.action === "leave") {
      if (role === "host") await run("UPDATE rooms SET closed = 1 WHERE code = ?", room.code);
      else {
        await run("UPDATE rooms SET guest_hash = NULL, guest_seen = 0 WHERE code = ?", room.code);
        await run("INSERT INTO signals (room_code, sender, payload, created_at) VALUES (?, ?, ?, ?)", room.code, "guest", JSON.stringify({ type: "bye" }), now());
      }
      return json({ ok: true });
    }
    fail(400, "\u64CD\u4F5C\u4E0D\u6B63\u78BA\u3002");
  }
  __name(sessions, "sessions");
  async function records(request, userId) {
    if (request.method === "GET") {
      const id2 = new URL(request.url).searchParams.get("id");
      if (id2) {
        if (!/^[a-f0-9-]{36}$/.test(id2)) fail(400, "\u7D00\u9304\u7DE8\u865F\u4E0D\u6B63\u78BA\u3002");
        const item = await first("SELECT id, payload, updated_at FROM records WHERE id = ? AND owner_id = ?", id2, userId);
        if (!item) fail(404, "\u627E\u4E0D\u5230\u9019\u4EFD\u5DE1\u6AA2\u7D00\u9304\u3002");
        return json({ id: item.id, record: JSON.parse(item.payload), updatedAt: item.updated_at });
      }
      return json({ records: await all("SELECT id, title, updated_at, checks_done FROM records WHERE owner_id = ? ORDER BY updated_at DESC LIMIT 30", userId) });
    }
    if (request.method !== "POST") fail(405, "\u4E0D\u652F\u63F4\u9019\u500B\u64CD\u4F5C\u3002");
    const body = await bodyOf(request);
    const id = body.id;
    if (typeof id !== "string" || !/^[a-f0-9-]{36}$/.test(id)) fail(400, "\u7D00\u9304\u7DE8\u865F\u4E0D\u6B63\u78BA\u3002");
    const record = body.record;
    if (!record || !Array.isArray(record.checks) || record.checks.length !== 3 || record.checks.some((x) => typeof x !== "boolean") || !Array.isArray(record.notes) || record.notes.length > 500 || !Array.isArray(record.pins) || record.pins.length > 100 || !Array.isArray(record.worldPins) || record.worldPins.length > 100) fail(400, "\u5DE1\u6AA2\u7D00\u9304\u683C\u5F0F\u4E0D\u6B63\u78BA\u3002");
    const payload = JSON.stringify(record);
    if (payload.length > 12e4) fail(413, "\u5DE1\u6AA2\u7D00\u9304\u904E\u5927\uFF0C\u8ACB\u5148\u532F\u51FA\u5099\u4EFD\u3002");
    const old = await first("SELECT owner_id FROM records WHERE id = ?", id);
    if (old && old.owner_id !== userId) fail(403, "\u9019\u4EFD\u7D00\u9304\u4E0D\u5C6C\u65BC\u4F60\u3002");
    const title = typeof record.title === "string" ? record.title.slice(0, 80) : "\u5165\u5EAB\u8CA8\u54C1\u9A57\u6536";
    const saved = await run("INSERT INTO records (id, owner_id, title, payload, checks_done, updated_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET title=excluded.title, payload=excluded.payload, checks_done=excluded.checks_done, updated_at=excluded.updated_at WHERE records.owner_id=excluded.owner_id", id, userId, title, payload, record.checks.filter(Boolean).length, now());
    if (!saved.meta?.changes) fail(403, "\u9019\u4EFD\u7D00\u9304\u4E0D\u5C6C\u65BC\u4F60\u3002");
    return json({ id, savedAt: now() });
  }
  __name(records, "records");
  async function config() {
    const iceServers = [{ urls: "stun:stun.cloudflare.com:3478" }];
    let relayConfigured = false;
    if (env.CLOUDFLARE_TURN_KEY_ID && env.CLOUDFLARE_TURN_API_TOKEN) {
      if (!/^[a-zA-Z0-9_-]{1,128}$/.test(env.CLOUDFLARE_TURN_KEY_ID)) fail(503, "TURN Key ID \u8A2D\u5B9A\u4E0D\u6B63\u78BA\u3002");
      const response = await fetcher(`https://rtc.live.cloudflare.com/v1/turn/keys/${env.CLOUDFLARE_TURN_KEY_ID}/credentials/generate-ice-servers`, { method: "POST", headers: { Authorization: `Bearer ${env.CLOUDFLARE_TURN_API_TOKEN}`, "Content-Type": "application/json" }, body: JSON.stringify({ ttl: 3600 }), signal: AbortSignal.timeout(8e3) });
      if (!response.ok) fail(503, "Cloudflare TURN \u66AB\u6642\u672A\u80FD\u7522\u751F\u6191\u8B49\uFF0C\u8ACB\u6AA2\u67E5\u4F3A\u670D\u5668\u8A2D\u5B9A\u3002");
      const result = await response.json();
      const servers = (Array.isArray(result.iceServers) ? result.iceServers : [result.iceServers]).filter((s) => s && typeof s === "object" && (typeof s.urls === "string" || Array.isArray(s.urls)));
      if (!servers.some((s) => (Array.isArray(s.urls) ? s.urls : [s.urls]).some((u) => /^turns?:/.test(u)))) fail(503, "Cloudflare TURN \u672A\u56DE\u50B3\u53EF\u7528\u7684\u4E2D\u7E7C\u8A2D\u5B9A\u3002");
      return json({ iceServers: servers, relayConfigured: true, provider: "cloudflare", expiresAt: now() + HOUR, sessionTtlSeconds: 3600 });
    }
    if (env.TURN_URLS && env.TURN_SHARED_SECRET) {
      const urls = env.TURN_URLS.split(",").map((x) => x.trim()).filter((x) => /^turns?:/.test(x));
      if (urls.length) {
        const username = `${Math.floor(now() / 1e3) + 3600}:visionlink`;
        const key2 = await crypto.subtle.importKey("raw", new TextEncoder().encode(env.TURN_SHARED_SECRET), { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
        const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key2, new TextEncoder().encode(username)));
        iceServers.push({ urls, username, credential: btoa(String.fromCharCode(...signature)) });
        relayConfigured = true;
      }
    }
    return json({ iceServers, relayConfigured, provider: relayConfigured ? "coturn" : "none", expiresAt: now() + HOUR, sessionTtlSeconds: 3600 });
  }
  __name(config, "config");
  return /* @__PURE__ */ __name(async function handle(request, userId) {
    try {
      if (!userId) fail(401, "\u8ACB\u767B\u5165\u5F8C\u518D\u4F7F\u7528\u5354\u4F5C\u670D\u52D9\u3002");
      const url = new URL(request.url), origin = request.headers.get("Origin");
      if (request.method !== "GET" && origin && origin !== url.origin) fail(403, "\u4E0D\u5141\u8A31\u8DE8\u7DB2\u7AD9\u64CD\u4F5C\u3002");
      if (url.pathname === "/api/session") return await sessions(request, userId);
      if (url.pathname === "/api/records") return await records(request, userId);
      if (url.pathname === "/api/config" && request.method === "GET") return await config();
      fail(404, "\u627E\u4E0D\u5230\u670D\u52D9\u3002");
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.message }, e.status);
      console.error("Session service operation failed");
      return json({ error: "\u670D\u52D9\u66AB\u6642\u7121\u6CD5\u4F7F\u7528\uFF0C\u8ACB\u7A0D\u5F8C\u91CD\u8A66\u3002" }, 503);
    }
  }, "handle");
}
__name(createSessionService, "createSessionService");

// ../lib/independent-auth.mjs
var SESSION_MS = 8 * 36e5;
var INVITE_MS = 72 * 36e5;
var fail2 = /* @__PURE__ */ __name((status, message) => {
  throw new HttpError(status, message);
}, "fail");
var key = /* @__PURE__ */ __name(() => Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) => b.toString(16).padStart(2, "0")).join(""), "key");
var hash = /* @__PURE__ */ __name(async (value) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))), (b) => b.toString(16).padStart(2, "0")).join(""), "hash");
var json2 = /* @__PURE__ */ __name((value, status = 200, headers = {}) => Response.json(value, { status, headers: { "Cache-Control": "no-store", ...headers } }), "json");
var profile = /* @__PURE__ */ __name((row) => ({ id: row.id, displayName: row.display_name, role: row.role }), "profile");
var name = /* @__PURE__ */ __name((value) => {
  if (typeof value !== "string" || !value.trim() || value.trim().length > 40) fail2(400, "\u8ACB\u8F38\u5165 1 \u81F3 40 \u5B57\u7684\u986F\u793A\u540D\u7A31\u3002");
  return value.trim();
}, "name");
async function bodyOf2(request) {
  const raw = await request.text();
  if (raw.length > 6e3) fail2(413, "\u767B\u5165\u8CC7\u6599\u904E\u5927\u3002");
  try {
    const body = JSON.parse(raw);
    if (body && typeof body === "object" && !Array.isArray(body)) return body;
  } catch {
  }
  fail2(400, "\u8CC7\u6599\u683C\u5F0F\u4E0D\u6B63\u78BA\u3002");
}
__name(bodyOf2, "bodyOf");
function cookieName(request) {
  return new URL(request.url).protocol === "https:" ? "__Host-visionlink" : "visionlink-dev";
}
__name(cookieName, "cookieName");
function sessionCookie(request, value, age = SESSION_MS / 1e3) {
  return `${cookieName(request)}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${age}${new URL(request.url).protocol === "https:" ? "; Secure" : ""}`;
}
__name(sessionCookie, "sessionCookie");
function cookieToken(request) {
  const part = (request.headers.get("Cookie") || "").split(";").map((x) => x.trim()).find((x) => x.startsWith(cookieName(request) + "="));
  const value = part?.slice(part.indexOf("=") + 1);
  return /^[a-f0-9]{64}$/.test(value || "") ? value : null;
}
__name(cookieToken, "cookieToken");
function createIndependentAuth({ db, env = {}, now = /* @__PURE__ */ __name(() => Date.now(), "now") }) {
  const first = /* @__PURE__ */ __name((sql, ...args) => db.prepare(sql).bind(...args).first(), "first");
  const run = /* @__PURE__ */ __name((sql, ...args) => db.prepare(sql).bind(...args).run(), "run");
  const all = /* @__PURE__ */ __name(async (sql, ...args) => (await db.prepare(sql).bind(...args).all()).results, "all");
  async function identify(request) {
    const token2 = cookieToken(request);
    if (!token2) return null;
    const row = await first("SELECT u.* FROM auth_sessions s JOIN auth_users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>? AND u.disabled=0", await hash(token2), now());
    return row ? profile(row) : null;
  }
  __name(identify, "identify");
  async function issue(request, user, accessKey) {
    const session = key();
    await run("INSERT INTO auth_sessions (token_hash,user_id,expires_at) VALUES (?,?,?)", await hash(session), user.id, now() + SESSION_MS);
    await run("DELETE FROM auth_sessions WHERE expires_at<=?", now());
    return json2({ user: profile(user), ...accessKey ? { accessKey } : {} }, 200, { "Set-Cookie": sessionCookie(request, session) });
  }
  __name(issue, "issue");
  async function throttle(request) {
    const window = Math.floor(now() / 3e5);
    const bucket = await hash(`${request.headers.get("CF-Connecting-IP") || "local"}:${window}`);
    await run("DELETE FROM auth_attempts WHERE expires_at<=?", now());
    await run("INSERT INTO auth_attempts (bucket,attempts,expires_at) VALUES (?,1,?) ON CONFLICT(bucket) DO UPDATE SET attempts=attempts+1", bucket, (window + 1) * 3e5);
    const entry = await first("SELECT attempts FROM auth_attempts WHERE bucket=?", bucket);
    if (entry.attempts > 8) fail2(429, "\u767B\u5165\u5617\u8A66\u904E\u591A\uFF0C\u8ACB\u4E94\u5206\u9418\u5F8C\u91CD\u8A66\u3002");
  }
  __name(throttle, "throttle");
  async function handle(request) {
    try {
      const path = new URL(request.url).pathname;
      if (request.method !== "GET") {
        const origin = request.headers.get("Origin");
        if (!origin || origin !== new URL(request.url).origin || request.headers.get("Content-Type")?.split(";")[0] !== "application/json") fail2(403, "\u4E0D\u5141\u8A31\u8DE8\u7DB2\u7AD9\u767B\u5165\u6216\u64CD\u4F5C\u3002");
      }
      if (path === "/api/auth/status" && request.method === "GET") return json2({ mode: "independent", setupRequired: !await first("SELECT id FROM auth_users WHERE role='owner'") });
      const user = await identify(request);
      if (path === "/api/auth/me" && request.method === "GET") return user ? json2({ user }) : json2({ error: "\u8ACB\u4F7F\u7528 VisionLink \u5B58\u53D6\u91D1\u9470\u767B\u5165\u3002" }, 401);
      if (path === "/api/auth/logout" && request.method === "POST") {
        const token2 = cookieToken(request);
        if (token2) await run("DELETE FROM auth_sessions WHERE token_hash=?", await hash(token2));
        return json2({ ok: true }, 200, { "Set-Cookie": sessionCookie(request, "", 0) });
      }
      if (path === "/api/auth/bootstrap" && request.method === "POST") {
        await throttle(request);
        const body = await bodyOf2(request);
        if (!env.AUTH_BOOTSTRAP_KEY || typeof body.bootstrapKey !== "string" || await hash(body.bootstrapKey) !== await hash(env.AUTH_BOOTSTRAP_KEY)) fail2(403, "\u8A2D\u5B9A\u78BC\u4E0D\u6B63\u78BA\u3002");
        const accessKey = key();
        const owner = { id: "owner", display_name: name(body.displayName), role: "owner" };
        const result = await run("INSERT OR IGNORE INTO auth_users (id,display_name,role,access_hash,created_at) VALUES (?,?,'owner',?,?)", owner.id, owner.display_name, await hash(accessKey), now());
        if (!result.meta?.changes) fail2(409, "\u7BA1\u7406\u54E1\u5DF2\u8A2D\u5B9A\uFF0C\u8ACB\u4F7F\u7528\u5B58\u53D6\u91D1\u9470\u767B\u5165\u3002");
        return issue(request, owner, accessKey);
      }
      if (path === "/api/auth/login" && request.method === "POST") {
        await throttle(request);
        const body = await bodyOf2(request);
        if (typeof body.accessKey !== "string" || !/^[a-f0-9]{64}$/.test(body.accessKey)) fail2(401, "\u5B58\u53D6\u91D1\u9470\u4E0D\u6B63\u78BA\u6216\u5E33\u6236\u5DF2\u505C\u7528\u3002");
        const row = await first("SELECT * FROM auth_users WHERE access_hash=? AND disabled=0", await hash(body.accessKey));
        if (!row) fail2(401, "\u5B58\u53D6\u91D1\u9470\u4E0D\u6B63\u78BA\u6216\u5E33\u6236\u5DF2\u505C\u7528\u3002");
        return issue(request, row);
      }
      if (path === "/api/auth/redeem" && request.method === "POST") {
        await throttle(request);
        const body = await bodyOf2(request);
        if (typeof body.invite !== "string" || !/^[a-f0-9]{64}$/.test(body.invite)) fail2(403, "\u9080\u8ACB\u7121\u6548\u6216\u5DF2\u4F7F\u7528\u3002");
        const inviteHash = await hash(body.invite), accessKey = key(), id = crypto.randomUUID();
        const displayName = name(body.displayName);
        const result = await run("INSERT OR IGNORE INTO auth_users (id,display_name,role,access_hash,invite_id,created_at) SELECT ?,?,'member',?,id,? FROM auth_invites WHERE token_hash=? AND expires_at>? AND revoked=0", id, displayName, await hash(accessKey), now(), inviteHash, now());
        if (!result.meta?.changes) fail2(403, "\u9080\u8ACB\u7121\u6548\u6216\u5DF2\u4F7F\u7528\u3002");
        return issue(request, { id, display_name: displayName, role: "member" }, accessKey);
      }
      if (!user) fail2(401, "\u8ACB\u5148\u767B\u5165 VisionLink\u3002");
      if (user.role !== "owner") fail2(403, "\u53EA\u6709\u7BA1\u7406\u54E1\u53EF\u4EE5\u7BA1\u7406\u5925\u4F34\u3002");
      if (path === "/api/auth/invites" && request.method === "POST") {
        const invite = key(), id = crypto.randomUUID();
        await run("INSERT INTO auth_invites (id,token_hash,expires_at,created_at) VALUES (?,?,?,?)", id, await hash(invite), now() + INVITE_MS, now());
        return json2({ id, invite, expiresAt: now() + INVITE_MS });
      }
      if (path === "/api/auth/users" && request.method === "GET") {
        const users = await all("SELECT id,display_name,role,disabled,created_at FROM auth_users ORDER BY created_at");
        return json2({ users: users.map((row) => ({ ...profile(row), disabled: !!row.disabled, createdAt: row.created_at })) });
      }
      if (path === "/api/auth/users" && request.method === "POST") {
        const body = await bodyOf2(request);
        if (typeof body.id !== "string" || body.id === "owner" || typeof body.disabled !== "boolean") fail2(400, "\u5925\u4F34\u8A2D\u5B9A\u4E0D\u6B63\u78BA\u3002");
        const result = await run("UPDATE auth_users SET disabled=? WHERE id=? AND role='member'", Number(body.disabled), body.id);
        if (!result.meta?.changes) fail2(404, "\u627E\u4E0D\u5230\u5925\u4F34\u3002");
        if (body.disabled) await run("DELETE FROM auth_sessions WHERE user_id=?", body.id);
        return json2({ ok: true });
      }
      fail2(404, "\u627E\u4E0D\u5230\u670D\u52D9\u3002");
    } catch (error) {
      if (error instanceof HttpError) return json2({ error: error.message }, error.status);
      console.error("Independent authentication operation failed");
      return json2({ error: "\u767B\u5165\u670D\u52D9\u66AB\u6642\u7121\u6CD5\u4F7F\u7528\u3002" }, 503);
    }
  }
  __name(handle, "handle");
  return { identify, handle };
}
__name(createIndependentAuth, "createIndependentAuth");

// worker.mjs
async function boundedRequest(request, limit) {
  if (Number(request.headers.get("Content-Length") || 0) > limit) return null;
  if (!request.body) return request;
  const reader = request.body.getReader(), chunks = [];
  let size = 0;
  for (; ; ) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const headers = new Headers(request.headers);
  headers.delete("Content-Length");
  return new Request(request.url, { method: request.method, headers, body });
}
__name(boundedRequest, "boundedRequest");
var worker_default = {
  async fetch(request, env) {
    try {
      const url = new URL(request.url);
      if (url.pathname === "/health") return Response.json({ ok: true, mode: "independent" });
      if (url.pathname.startsWith("/api/")) {
        if (!env.DB) return Response.json({ error: "\u8CC7\u6599\u5EAB\u5C1A\u672A\u8A2D\u5B9A\u3002" }, { status: 503 });
        if (request.method !== "GET" && (request.headers.get("Origin") !== url.origin || request.headers.get("Content-Type")?.split(";")[0] !== "application/json")) return Response.json({ error: "\u4E0D\u5141\u8A31\u8DE8\u7DB2\u7AD9\u64CD\u4F5C\u3002" }, { status: 403 });
        if (request.method === "POST") {
          request = await boundedRequest(request, url.pathname.startsWith("/api/auth/") ? 6e3 : 15e4);
          if (!request) return Response.json({ error: "\u8CC7\u6599\u904E\u5927\u3002" }, { status: 413 });
        }
        const auth = createIndependentAuth({ db: env.DB, env });
        if (url.pathname.startsWith("/api/auth/")) return auth.handle(request);
        const user = await auth.identify(request);
        return createSessionService({ db: env.DB, env })(request, user?.id);
      }
      return env.ASSETS.fetch(request);
    } catch {
      return Response.json({ error: "\u670D\u52D9\u66AB\u6642\u7121\u6CD5\u4F7F\u7528\uFF0C\u8ACB\u7A0D\u5F8C\u91CD\u8A66\u3002" }, { status: 503, headers: { "Cache-Control": "no-store" } });
    }
  }
};
export {
  worker_default as default
};
//# sourceMappingURL=worker.js.map
