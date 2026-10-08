import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {openLocalDatabase} from '../lib/local-db.mjs';
import {createIndependentAuth} from '../lib/independent-auth.mjs';
import worker from '../standalone/worker.mjs';

function fixture() {
  const db = openLocalDatabase(); db.sqlite.exec(readFileSync('standalone/auth-schema.sql', 'utf8'));
  let clock = 1800000000000;
  const env = {DB: db, AUTH_BOOTSTRAP_KEY: 'test-bootstrap-key-' + '0'.repeat(64), ASSETS: {fetch: () => new Response('static assets')}};
  const auth = createIndependentAuth({db, env, now: () => clock});
  async function request(path, body, cookie, headers = {}) {
    const req = new Request('https://visionlink.test' + path, {method: body === undefined ? 'GET' : 'POST', headers: {...(body === undefined ? {} : {'Content-Type': 'application/json', Origin: 'https://visionlink.test'}), ...(cookie ? {Cookie: cookie} : {}), ...headers}, ...(body === undefined ? {} : {body: JSON.stringify(body)})});
    const response = await auth.handle(req);
    return {status: response.status, data: await response.json(), cookie: response.headers.get('Set-Cookie')?.split(';')[0], cookieHeader: response.headers.get('Set-Cookie')};
  }
  const bootstrap = () => request('/api/auth/bootstrap', {displayName: '測試管理員', bootstrapKey: env.AUTH_BOOTSTRAP_KEY});
  return {db, env, auth, request, bootstrap, advance: amount => clock += amount};
}

test('public registration is opt-in, issues private member keys and respects daily limits', async () => {
  const f = fixture(); try {
    assert.equal((await f.request('/api/auth/register', {displayName: 'A'})).status, 403);
    f.env.PUBLIC_REGISTRATION = 'true';
    assert.equal((await f.request('/api/auth/status')).data.registrationEnabled, false);
    assert.equal((await f.request('/api/auth/register', {displayName: 'A'})).status, 403);
    await f.bootstrap();
    assert.equal((await f.request('/api/auth/status')).data.registrationEnabled, true);
    assert.equal((await f.request('/api/auth/register', {displayName: 'A'}, undefined, {Origin: 'https://evil.test'})).status, 403);
    assert.equal((await f.request('/api/auth/register', {displayName: ' '})).status, 400);
    const members = await Promise.all(Array.from({length: 4}, (_, i) => f.request('/api/auth/register', {displayName: '公開夥伴 ' + i, role: 'owner'})));
    assert.deepEqual(members.map(r => r.status).sort(), [200,200,200,429]);
    const member = members[0];
    assert.equal(member.data.user.role, 'member');
    assert.match(member.data.accessKey, /^[a-f0-9]{64}$/);
    assert.notEqual(f.db.sqlite.prepare('SELECT access_hash FROM auth_users WHERE id=?').get(member.data.user.id).access_hash, member.data.accessKey);
    assert.equal((await f.request('/api/auth/users', undefined, member.cookie)).status, 403);
    assert.equal((await f.request('/api/auth/login', {accessKey: member.data.accessKey}, undefined, {'CF-Connecting-IP': 'login-test'})).status, 200);
    f.advance(86400001);
    assert.equal((await f.request('/api/auth/register', {displayName: '翌日'})).status, 200);
    const day = Math.floor(1800000000000 / 86400000 + 1);
    f.db.sqlite.prepare('UPDATE auth_attempts SET attempts=100 WHERE bucket=?').run('registration-global:' + day);
    assert.equal((await f.request('/api/auth/register', {displayName: '已滿'}, undefined, {'CF-Connecting-IP': 'other-network'})).status, 429);
  } finally { f.db.sqlite.close(); }
});

test('self-registered users create rooms, accept guests and keep inspection records isolated', async () => {
  const f = fixture(); try {
    f.env.PUBLIC_REGISTRATION = 'true'; await f.bootstrap();
    async function request(path, body, cookie) {
      const res = await worker.fetch(new Request('https://visionlink.test' + path, {method: body === undefined ? 'GET' : 'POST', headers: {...(body === undefined ? {} : {Origin: 'https://visionlink.test', 'Content-Type': 'application/json'}), ...(cookie ? {Cookie: cookie} : {})}, ...(body === undefined ? {} : {body: JSON.stringify(body)})}), f.env);
      return {status: res.status, data: await res.json(), cookie: res.headers.get('Set-Cookie')?.split(';')[0]};
    }
    const alice = await request('/api/auth/register', {displayName: 'Alice'}), bob = await request('/api/auth/register', {displayName: 'Bob'});
    assert.equal(alice.status, 200); assert.equal(bob.status, 200);
    const room = await request('/api/session', {action: 'create'}, alice.cookie); assert.equal(room.status, 201);
    assert.equal((await request('/api/session', {action: 'join', code: room.data.code, invite: room.data.invite})).status, 200);
    const id = crypto.randomUUID(), record = {title: 'Private', checks: [true,false,false], notes: [], pins: [], worldPins: []};
    assert.equal((await request('/api/records', {id, record}, alice.cookie)).status, 200);
    assert.equal((await request('/api/records?id=' + id, undefined, bob.cookie)).status, 404);
    assert.equal((await request('/api/records', {id, record}, bob.cookie)).status, 403);
    assert.equal((await request('/api/records?id=' + id)).status, 401);
    assert.equal((await request('/api/auth/users', undefined, bob.cookie)).status, 403);
  } finally { f.db.sqlite.close(); }
});

test('independent owner setup is guarded, single-use, and secrets are hashed', async () => {
  const f = fixture(); try {
    assert.equal((await f.request('/api/auth/bootstrap', {displayName: '非法管理員', bootstrapKey: 'wrong'})).status, 403);
    const owner = await f.bootstrap(); assert.equal(owner.status, 200); assert.equal(owner.data.user.role, 'owner');
    assert.match(owner.data.accessKey, /^[a-f0-9]{64}$/); assert.match(owner.cookieHeader, /__Host-visionlink=/); assert.match(owner.cookieHeader, /HttpOnly; SameSite=Strict/); assert.match(owner.cookieHeader, /; Secure/);
    assert.equal((await f.bootstrap()).status, 409);
    assert.notEqual(f.db.sqlite.prepare('SELECT access_hash FROM auth_users').get().access_hash, owner.data.accessKey);
    assert.equal((await f.request('/api/auth/me', undefined, owner.cookie)).data.user.id, 'owner');
    assert.equal((await f.request('/api/auth/me')).status, 401);
    assert.equal((await f.request('/api/auth/login', {accessKey: owner.data.accessKey}, undefined, {Origin: 'https://evil.test'})).status, 403);
    assert.equal((await f.request('/api/auth/login', {accessKey: owner.data.accessKey}, undefined, {Origin: ''})).status, 403);
  } finally { f.db.sqlite.close(); }
});

test('member invitation is atomic, expires, and never grants administrator access', async () => {
  const f = fixture(); try {
    const owner = await f.bootstrap(), invite = (await f.request('/api/auth/invites', {}, owner.cookie)).data;
    const results = await Promise.all([f.request('/api/auth/redeem', {invite: invite.invite, displayName: '夥伴 A'}), f.request('/api/auth/redeem', {invite: invite.invite, displayName: '夥伴 B'})]);
    assert.deepEqual(results.map(x => x.status).sort(), [200, 403]);
    const member = results.find(x => x.status === 200); assert.equal(member.data.user.role, 'member');
    assert.equal((await f.request('/api/auth/invites', {}, member.cookie)).status, 403);
    assert.equal((await f.request('/api/auth/users', undefined, member.cookie)).status, 403);
    const second = (await f.request('/api/auth/invites', {}, owner.cookie)).data;
    f.advance(72 * 3600000 + 1);
    assert.equal((await f.request('/api/auth/redeem', {invite: second.invite, displayName: '太遲'})).status, 403);
  } finally { f.db.sqlite.close(); }
});

test('logout, session expiry, and member suspension revoke existing access', async () => {
  const f = fixture(); try {
    const owner = await f.bootstrap(), invitation = (await f.request('/api/auth/invites', {}, owner.cookie)).data;
    const member = await f.request('/api/auth/redeem', {invite: invitation.invite, displayName: '現場'});
    assert.equal((await f.request('/api/auth/users', {id: member.data.user.id, disabled: true}, owner.cookie)).status, 200);
    assert.equal((await f.request('/api/auth/me', undefined, member.cookie)).status, 401);
    assert.equal((await f.request('/api/auth/login', {accessKey: member.data.accessKey})).status, 401);
    assert.equal((await f.request('/api/auth/users', {id: 'owner', disabled: true}, owner.cookie)).status, 400);
    await f.request('/api/auth/logout', {}, owner.cookie);
    assert.equal((await f.request('/api/auth/me', undefined, owner.cookie)).status, 401);
    const loggedIn = await f.request('/api/auth/login', {accessKey: owner.data.accessKey}); assert.equal(loggedIn.status, 200);
    f.advance(8 * 3600000 + 1);
    assert.equal((await f.request('/api/auth/me', undefined, loggedIn.cookie)).status, 401);
  } finally { f.db.sqlite.close(); }
});

test('invalid login attempts are limited and recover after the time window', async () => {
  const f = fixture(); try {
    for (let i = 0; i < 8; i++) assert.equal((await f.request('/api/auth/login', {accessKey: 'f'.repeat(64)})).status, 401);
    assert.equal((await f.request('/api/auth/login', {accessKey: 'f'.repeat(64)})).status, 429);
    f.advance(300001);
    assert.equal((await f.request('/api/auth/login', {accessKey: 'f'.repeat(64)})).status, 401);
  } finally { f.db.sqlite.close(); }
});

test('independent Worker ignores OpenAI identity headers and protects inspection APIs', async () => {
  const f = fixture(); try {
    const url = 'https://visionlink.test';
    const anonymous = await worker.fetch(new Request(url + '/api/records', {headers: {'oai-authenticated-user-id': 'owner', 'oai-authenticated-user-email': 'owner@example.test'}}), f.env);
    assert.equal(anonymous.status, 401);
    const owner = await worker.fetch(new Request(url + '/api/auth/bootstrap', {method: 'POST', headers: {Origin: url, 'Content-Type': 'application/json'}, body: JSON.stringify({bootstrapKey: f.env.AUTH_BOOTSTRAP_KEY, displayName: 'Owner'})}), f.env);
    assert.equal(owner.status, 200); const cookie = owner.headers.get('Set-Cookie').split(';')[0];
    assert.equal((await worker.fetch(new Request(url + '/api/records', {headers: {Cookie: cookie}}), f.env)).status, 200);
    const crossOrigin = await worker.fetch(new Request(url + '/api/session', {method: 'POST', headers: {Cookie: cookie, Origin: 'https://evil.test', 'Content-Type': 'application/json'}, body: '{"action":"create"}'}), f.env);
    assert.equal(crossOrigin.status, 403);
  } finally { f.db.sqlite.close(); }
});

test('Worker caps chunked bodies before parsing and returns a safe database failure', async () => {
  const f = fixture(); try {
    const headers = {Origin: 'https://visionlink.test', 'Content-Type': 'application/json'};
    const stream = new ReadableStream({start(controller) { controller.enqueue(new Uint8Array(4000)); controller.enqueue(new Uint8Array(4000)); controller.close(); }});
    const request = new Request('https://visionlink.test/api/auth/login', {method: 'POST', headers, body: stream, duplex: 'half'});
    assert.equal((await worker.fetch(request, f.env)).status, 413);
    const broken = {...f.env, DB: {prepare() { throw new Error('private database detail'); }}};
    const response = await worker.fetch(new Request('https://visionlink.test/api/records', {headers: {Cookie: '__Host-visionlink=' + 'a'.repeat(64)}}), broken);
    assert.equal(response.status, 503);
    assert.doesNotMatch(await response.text(), /private database detail/);
  } finally { f.db.sqlite.close(); }
});

test('independent guest room access needs no account and relay issuance is bounded', async () => {
  const f = fixture(); try {
    async function request(path, body, headers = {}) {
      const res = await worker.fetch(new Request('https://visionlink.test' + path, {method: body === undefined ? 'GET' : 'POST', headers: {...(body === undefined ? {} : {Origin: 'https://visionlink.test', 'Content-Type': 'application/json'}), ...headers}, ...(body === undefined ? {} : {body: JSON.stringify(body)})}), f.env);
      return {status: res.status, data: await res.json(), cookie: res.headers.get('Set-Cookie')?.split(';')[0]};
    }
    const owner = await request('/api/auth/bootstrap', {bootstrapKey: f.env.AUTH_BOOTSTRAP_KEY, displayName: 'Owner'});
    const room = (await request('/api/session', {action: 'create'}, {Cookie: owner.cookie})).data;
    const guest = await request('/api/session', {action: 'join', code: room.code, invite: room.invite}); assert.equal(guest.status, 200);
    const authorization = {Authorization: 'Bearer ' + guest.data.member};
    assert.equal((await request('/api/auth/me')).status, 401);
    assert.equal((await request('/api/auth/users', undefined, authorization)).status, 401);
    assert.equal((await request('/api/records', undefined, authorization)).status, 401);
    for (let i = 0; i < 12; i++) assert.equal((await request('/api/config?code=' + room.code, undefined, authorization)).status, 200);
    assert.equal((await request('/api/config?code=' + room.code, undefined, authorization)).status, 429);
    assert.equal(f.db.sqlite.prepare('SELECT COUNT(*) AS n FROM auth_users').get().n, 1);
  } finally { f.db.sqlite.close(); }
});
