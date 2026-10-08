import {cp, mkdir, readFile, writeFile, readdir, stat} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {staticHeaders} from '../standalone/security.mjs';

const target = path.resolve('artifacts/independent');
const assets = path.join(target, 'assets');
const workspace = path.join(assets, 'workspace');
// The source HTML replaces the Editor's template; keep its precompressed copy consistent.
await writeFile('public/workspace/wonderland/index.html.gz',gzipSync(await readFile('public/workspace/wonderland/index.html')));
await mkdir(workspace, {recursive: true});
await cp('public/workspace', workspace, {recursive: true});
const html = (await readFile('public/workspace/index.html', 'utf8')).replace('src="app.js"', 'src="independent-app.js"');
if (!html.includes('src="independent-app.js"')) throw new Error('Independent entrypoint not installed.');
await writeFile(path.join(workspace, 'index.html'), html);
await mkdir(path.join(assets, 'login'), {recursive: true});
await cp('standalone/login.html', path.join(assets, 'login/index.html'));
await writeFile(path.join(assets, 'index.html'), '<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=/workspace/"><title>VisionLink</title></head><body><a href="/workspace/">開啟 VisionLink 工作空間</a></body></html>');
await writeFile(path.join(assets, '_redirects'), '/ /workspace/ 302\n');
const security = staticHeaders(await readFile(path.join(workspace, 'wonderland/index.html'), 'utf8'));
await writeFile(path.join(assets, '_headers'), `/*
${Object.entries(security).map(([name, value]) => `  ${name}: ${value}`).join('\n')}
/workspace/index.html
  Cache-Control: no-store
/login/*
  Cache-Control: no-store
`);
await mkdir(path.join(target, 'migrations'), {recursive: true});
await cp('drizzle/0000_fearless_human_torch.sql', path.join(target, 'migrations/0001_workspace.sql'));
await cp('standalone/auth-schema.sql', path.join(target, 'migrations/0002_independent_auth.sql'));
const manifest = JSON.parse(await readFile('public/workspace/vendor/mediapipe/models/manifest.json', 'utf8'));
for (const [filename, info] of Object.entries(manifest)) {
  const file = await readFile(path.join(workspace, 'vendor/mediapipe/models', filename));
  if (createHash('sha256').update(file).digest('hex') !== info.sha256) throw new Error(`Model checksum failed: ${filename}`);
}
async function inspect(folder) {
  for (const entry of await readdir(folder, {withFileTypes: true})) {
    const file = path.join(folder, entry.name);
    if (entry.isDirectory()) await inspect(file);
    else if ((await stat(file)).size > 25 * 1024 * 1024) throw new Error(`Asset exceeds Cloudflare Free upload limit: ${entry.name}`);
  }
}
await inspect(assets);
const damageCard=JSON.parse(await readFile(path.join(workspace,'vendor/damage/model-card.json'),'utf8'));
const damageModel=await readFile(path.join(workspace,'vendor/damage/model.onnx'));
if(createHash('sha256').update(damageModel).digest('hex')!==damageCard.sha256)throw new Error('Damage model checksum failed.');
console.log('Independent Cloudflare assets and D1 migrations prepared. No ChatGPT login required.');
