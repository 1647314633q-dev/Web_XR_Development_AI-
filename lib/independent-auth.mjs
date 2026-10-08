import {HttpError} from './session-service.mjs';

const SESSION_MS = 8 * 3600000;
const INVITE_MS = 72 * 3600000;
const fail = (status, message) => { throw new HttpError(status, message); };
const key = () => Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, '0')).join('');
const hash = async value => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))), b => b.toString(16).padStart(2, '0')).join('');
const json = (value, status = 200, headers = {}) => Response.json(value, {status, headers: {'Cache-Control': 'no-store', ...headers}});
const profile = row => ({id: row.id, displayName: row.display_name, role: row.role});
const name = value => { if (typeof value !== 'string' || !value.trim() || value.trim().length > 40) fail(400, '請輸入 1 至 40 字的顯示名稱。'); return value.trim(); };
async function bodyOf(request) {
  const raw = await request.text();
  if (raw.length > 6000) fail(413, '登入資料過大。');
  try { const body = JSON.parse(raw); if (body && typeof body === 'object' && !Array.isArray(body)) return body; } catch {}
  fail(400, '資料格式不正確。');
}
function cookieName(request) { return new URL(request.url).protocol === 'https:' ? '__Host-visionlink' : 'visionlink-dev'; }
function sessionCookie(request, value, age = SESSION_MS / 1000) {
  return `${cookieName(request)}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${age}${new URL(request.url).protocol === 'https:' ? '; Secure' : ''}`;
}
function cookieToken(request) {
  const part = (request.headers.get('Cookie') || '').split(';').map(x => x.trim()).find(x => x.startsWith(cookieName(request) + '='));
  const value = part?.slice(part.indexOf('=') + 1);
  return /^[a-f0-9]{64}$/.test(value || '') ? value : null;
}
export function createIndependentAuth({db, env = {}, now = () => Date.now()}) {
  const first = (sql, ...args) => db.prepare(sql).bind(...args).first();
  const run = (sql, ...args) => db.prepare(sql).bind(...args).run();
  const all = async (sql, ...args) => (await db.prepare(sql).bind(...args).all()).results;

  async function identify(request) {
    const token = cookieToken(request);
    if (!token) return null;
    const row = await first('SELECT u.* FROM auth_sessions s JOIN auth_users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>? AND u.disabled=0', await hash(token), now());
    return row ? profile(row) : null;
  }
  async function issue(request, user, accessKey) {
    const session = key();
    await run('INSERT INTO auth_sessions (token_hash,user_id,expires_at) VALUES (?,?,?)', await hash(session), user.id, now() + SESSION_MS);
    await run('DELETE FROM auth_sessions WHERE expires_at<=?', now());
    return json({user: profile(user), ...(accessKey ? {accessKey} : {})}, 200, {'Set-Cookie': sessionCookie(request, session)});
  }
  async function throttle(request) {
    const window = Math.floor(now() / 300000);
    const bucket = await hash(`${request.headers.get('CF-Connecting-IP') || 'local'}:${window}`);
    await run('DELETE FROM auth_attempts WHERE expires_at<=?', now());
    await run('INSERT INTO auth_attempts (bucket,attempts,expires_at) VALUES (?,1,?) ON CONFLICT(bucket) DO UPDATE SET attempts=attempts+1', bucket, (window + 1) * 300000);
    const entry = await first('SELECT attempts FROM auth_attempts WHERE bucket=?', bucket);
    if (entry.attempts > 8) fail(429, '登入嘗試過多，請五分鐘後重試。');
  }
  async function handle(request) {
    try {
      const path = new URL(request.url).pathname;
      if (request.method !== 'GET') {
        const origin = request.headers.get('Origin');
        if (!origin || origin !== new URL(request.url).origin || request.headers.get('Content-Type')?.split(';')[0] !== 'application/json') fail(403, '不允許跨網站登入或操作。');
      }
      if (path === '/api/auth/status' && request.method === 'GET') {
        const setupRequired = !await first("SELECT id FROM auth_users WHERE role='owner'");
        return json({mode: 'independent', setupRequired, registrationEnabled: env.PUBLIC_REGISTRATION === 'true' && !setupRequired});
      }
      const user = await identify(request);
      if (path === '/api/auth/me' && request.method === 'GET') return user ? json({user}) : json({error: '請使用 VisionLink 存取金鑰登入。'}, 401);
      if (path === '/api/auth/logout' && request.method === 'POST') {
        const token = cookieToken(request);
        if (token) await run('DELETE FROM auth_sessions WHERE token_hash=?', await hash(token));
        return json({ok: true}, 200, {'Set-Cookie': sessionCookie(request, '', 0)});
      }
      if (path === '/api/auth/bootstrap' && request.method === 'POST') {
        await throttle(request);
        const body = await bodyOf(request);
        if (!env.AUTH_BOOTSTRAP_KEY || typeof body.bootstrapKey !== 'string' || await hash(body.bootstrapKey) !== await hash(env.AUTH_BOOTSTRAP_KEY)) fail(403, '設定碼不正確。');
        const accessKey = key();
        const owner = {id: 'owner', display_name: name(body.displayName), role: 'owner'};
        const result = await run("INSERT OR IGNORE INTO auth_users (id,display_name,role,access_hash,created_at) VALUES (?,?,'owner',?,?)", owner.id, owner.display_name, await hash(accessKey), now());
        if (!result.meta?.changes) fail(409, '管理員已設定，請使用存取金鑰登入。');
        return issue(request, owner, accessKey);
      }
      if (path === '/api/auth/register' && request.method === 'POST') {
        if (env.PUBLIC_REGISTRATION !== 'true' || !await first("SELECT id FROM auth_users WHERE role='owner'")) fail(403, '目前未開放自行註冊。');
        await throttle(request);
        const body = await bodyOf(request), displayName = name(body.displayName);
        const day = Math.floor(now() / 86400000), expiry = (day + 1) * 86400000;
        const bucket = 'registration:' + await hash(`${request.headers.get('CF-Connecting-IP') || 'local'}:${day}`);
        // Atomic quotas protect the free trial even when registrations arrive together.
        const quota = await run('INSERT INTO auth_attempts (bucket,attempts,expires_at) VALUES (?,1,?) ON CONFLICT(bucket) DO UPDATE SET attempts=attempts+1 WHERE auth_attempts.attempts<3', bucket, expiry);
        if (!quota.meta?.changes) fail(429, '這個網絡今天已達註冊上限，請稍後再試或接受房間邀請。');
        const globalQuota = await run('INSERT INTO auth_attempts (bucket,attempts,expires_at) VALUES (?,1,?) ON CONFLICT(bucket) DO UPDATE SET attempts=attempts+1 WHERE auth_attempts.attempts<100', 'registration-global:' + day, expiry);
        if (!globalQuota.meta?.changes) fail(429, '今天的免費試用註冊名額已滿，請明天再試。');
        const accessKey = key(), member = {id: crypto.randomUUID(), display_name: displayName, role: 'member'};
        await run("INSERT INTO auth_users (id,display_name,role,access_hash,created_at) VALUES (?,?,'member',?,?)", member.id, displayName, await hash(accessKey), now());
        return issue(request, member, accessKey);
      }
      if (path === '/api/auth/login' && request.method === 'POST') {
        await throttle(request);
        const body = await bodyOf(request);
        if (typeof body.accessKey !== 'string' || !/^[a-f0-9]{64}$/.test(body.accessKey)) fail(401, '存取金鑰不正確或帳戶已停用。');
        const row = await first('SELECT * FROM auth_users WHERE access_hash=? AND disabled=0', await hash(body.accessKey));
        if (!row) fail(401, '存取金鑰不正確或帳戶已停用。');
        return issue(request, row);
      }
      if (path === '/api/auth/redeem' && request.method === 'POST') {
        await throttle(request);
        const body = await bodyOf(request);
        if (typeof body.invite !== 'string' || !/^[a-f0-9]{64}$/.test(body.invite)) fail(403, '邀請無效或已使用。');
        const inviteHash = await hash(body.invite), accessKey = key(), id = crypto.randomUUID();
        const displayName = name(body.displayName);
        const result = await run("INSERT OR IGNORE INTO auth_users (id,display_name,role,access_hash,invite_id,created_at) SELECT ?,?,'member',?,id,? FROM auth_invites WHERE token_hash=? AND expires_at>? AND revoked=0", id, displayName, await hash(accessKey), now(), inviteHash, now());
        if (!result.meta?.changes) fail(403, '邀請無效或已使用。');
        return issue(request, {id, display_name: displayName, role: 'member'}, accessKey);
      }
      if (!user) fail(401, '請先登入 VisionLink。');
      if (user.role !== 'owner') fail(403, '只有管理員可以管理夥伴。');
      if (path === '/api/auth/invites' && request.method === 'POST') {
        const invite = key(), id = crypto.randomUUID();
        await run('INSERT INTO auth_invites (id,token_hash,expires_at,created_at) VALUES (?,?,?,?)', id, await hash(invite), now() + INVITE_MS, now());
        return json({id, invite, expiresAt: now() + INVITE_MS});
      }
      if (path === '/api/auth/users' && request.method === 'GET') {
        const users = await all('SELECT id,display_name,role,disabled,created_at FROM auth_users ORDER BY created_at');
        return json({users: users.map(row => ({...profile(row), disabled: !!row.disabled, createdAt: row.created_at}))});
      }
      if (path === '/api/auth/users' && request.method === 'POST') {
        const body = await bodyOf(request);
        if (typeof body.id !== 'string' || body.id === 'owner' || typeof body.disabled !== 'boolean') fail(400, '夥伴設定不正確。');
        const result = await run("UPDATE auth_users SET disabled=? WHERE id=? AND role='member'", Number(body.disabled), body.id);
        if (!result.meta?.changes) fail(404, '找不到夥伴。');
        if (body.disabled) await run('DELETE FROM auth_sessions WHERE user_id=?', body.id);
        return json({ok: true});
      }
      fail(404, '找不到服務。');
    } catch (error) {
      if (error instanceof HttpError) return json({error: error.message}, error.status);
      console.error('Independent authentication operation failed');
      return json({error: '登入服務暫時無法使用。'}, 503);
    }
  }
  return {identify, handle};
}
