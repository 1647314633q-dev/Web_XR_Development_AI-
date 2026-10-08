import {createIndependentAuth} from '../lib/independent-auth.mjs';
import {createSessionService,HttpError} from '../lib/session-service.mjs';

async function boundedRequest(request, limit) {
  if (Number(request.headers.get('Content-Length') || 0) > limit) return null;
  if (!request.body) return request;
  const reader = request.body.getReader(), chunks = []; let size = 0;
  for (;;) {
    const {done, value} = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) { await reader.cancel(); return null; }
    chunks.push(value);
  }
  const body = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
  const headers = new Headers(request.headers); headers.delete('Content-Length');
  return new Request(request.url, {method: request.method, headers, body});
}

export default {
  async fetch(request, env) {
    try {
    const url = new URL(request.url);
    if (url.pathname === '/health') return Response.json({ok: true, mode: 'independent'});
    if (url.pathname.startsWith('/api/')) {
      if (!env.DB) return Response.json({error: '資料庫尚未設定。'}, {status: 503});
      if (request.method !== 'GET' && (request.headers.get('Origin') !== url.origin || request.headers.get('Content-Type')?.split(';')[0] !== 'application/json')) return Response.json({error: '不允許跨網站操作。'}, {status: 403});
      if (request.method === 'POST') {
        request = await boundedRequest(request, url.pathname.startsWith('/api/auth/') ? 6000 : 150000);
        if (!request) return Response.json({error: '資料過大。'}, {status: 413});
      }
      const auth = createIndependentAuth({db: env.DB, env});
      if (url.pathname.startsWith('/api/auth/')) return auth.handle(request);
      const user = await auth.identify(request);
      return createSessionService({db: env.DB, env, allowInvitedGuests: true, beforeGuestConfig: async room => {
        const result = await env.DB.prepare('INSERT INTO auth_attempts (bucket,attempts,expires_at) VALUES (?,1,?) ON CONFLICT(bucket) DO UPDATE SET attempts=attempts+1 WHERE auth_attempts.attempts<12').bind('room-relay:' + room.code, room.expires_at).run();
        if (!result.meta?.changes) throw new HttpError(429, '這個房間已達中繼測試次數上限，請由發起方建立新房間。');
      }})(request, user?.id);
    }
    return await env.ASSETS.fetch(request);
    } catch {
      return Response.json({error: '服務暫時無法使用，請稍後重試。'}, {status: 503, headers: {'Cache-Control': 'no-store'}});
    }
  }
};
