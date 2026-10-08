import http from 'node:http';
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import path from 'node:path';
import {openLocalDatabase} from '../lib/local-db.mjs';
import worker from './worker.mjs';
import {staticHeaders} from './security.mjs';

const root = path.resolve('artifacts/independent/assets');
const port = Number(process.env.PORT || 4174);
const securityHeaders = staticHeaders(await readFile(path.join(root, 'workspace/wonderland/index.html'), 'utf8'));
const db = openLocalDatabase(process.env.INDEPENDENT_DB || '.local-data/independent.sqlite');
db.sqlite.exec(await readFile('standalone/auth-schema.sql', 'utf8'));
let bootstrapKey = process.env.AUTH_BOOTSTRAP_KEY;
if (!bootstrapKey) {
  await mkdir('.local-data', {recursive: true});
  try { bootstrapKey = (await readFile('.local-data/independent-bootstrap.txt', 'utf8')).trim(); }
  catch { bootstrapKey = Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, '0')).join(''); await writeFile('.local-data/independent-bootstrap.txt', bootstrapKey, {mode: 0o600, flag: 'wx'}); }
}
const mime = {'.html': 'text/html;charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.wasm': 'application/wasm', '.bin': 'application/octet-stream', '.tflite': 'application/octet-stream', '.json': 'application/json'};
const env = {...process.env, AUTH_BOOTSTRAP_KEY: bootstrapKey, DB: db, ASSETS: {async fetch(request) {
  let relative = decodeURIComponent(new URL(request.url).pathname);
  if (relative === '/' || relative === '/workspace') return Response.redirect(new URL('/workspace/', request.url), 302);
  if (relative === '/workspace/') relative = '/workspace/index.html';
  if (relative === '/login' || relative === '/login/') relative = '/login/index.html';
  const filename = path.resolve(root, '.' + relative);
  if (!filename.startsWith(root + path.sep)) return new Response('Not found', {status: 404});
  try { return new Response(await readFile(filename), {headers: {'Content-Type': mime[path.extname(filename)] || 'application/octet-stream', ...securityHeaders, 'Cache-Control': 'no-store'}}); }
  catch { return new Response('Not found', {status: 404}); }
}}};
http.createServer(async (req, res) => {
  try {
    let bytes = 0; const chunks = [];
    for await (const chunk of req) { bytes += chunk.length; if (bytes > 150000) { res.writeHead(413); res.end(); return; } chunks.push(chunk); }
    const headers = new Headers(req.headers); headers.set('CF-Connecting-IP', req.socket.remoteAddress || 'local');
    const hostname = req.headers.host;
    if (![`localhost:${port}`, `127.0.0.1:${port}`].includes(hostname)) { res.writeHead(400); res.end(); return; }
    const request = new Request(`http://${hostname}${req.url}`, {method: req.method, headers, ...(!['GET', 'HEAD'].includes(req.method) ? {body: Buffer.concat(chunks)} : {})});
    const response = await worker.fetch(request, env); res.writeHead(response.status, Object.fromEntries(response.headers)); res.end(req.method === 'HEAD' ? undefined : Buffer.from(await response.arrayBuffer()));
  } catch { res.writeHead(500); res.end('Service unavailable'); }
}).listen(port, '127.0.0.1', () => console.log(`VisionLink independent preview: http://localhost:${port}\nLocal administrator setup key: .local-data/independent-bootstrap.txt`));
