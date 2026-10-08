import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const manifest = JSON.parse(await readFile(new URL('../standalone/runtime-assets.json', import.meta.url), 'utf8'));
const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
for (const asset of manifest.assets) {
  if (!/^public\/workspace\/(?:wonderland|vendor\/damage)\/[A-Za-z0-9_.\/-]+$/.test(asset.path) || asset.path.split('/').includes('..')) throw new Error('Invalid runtime path.');
  const destination = path.resolve(root, asset.path);
  if (!destination.startsWith(root + path.sep)) throw new Error('Runtime path escapes project.');
  let current; try { current = await readFile(destination); } catch {}
  if (current && digest(current) === asset.sha256) continue;
  const url = new URL(asset.path.replace(/^public\//, ''), manifest.baseUrl);
  const response = await fetch(url, {signal: AbortSignal.timeout(60000)});
  if (!response.ok) throw new Error(`Runtime download failed (${response.status}): ${asset.path}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length !== asset.bytes || digest(bytes) !== asset.sha256) throw new Error(`Runtime checksum failed: ${asset.path}. The public distribution may have changed; update the manifest from a verified build.`);
  await mkdir(path.dirname(destination), {recursive: true});
  await writeFile(destination, bytes);
  console.log(`Verified ${asset.path}`);
}
await mkdir(path.join(root, 'public/workspace/wonderland'), {recursive: true});
await writeFile(path.join(root, 'public/workspace/wonderland/index.html'), await readFile(path.join(root, 'wonderland/index.html')));
console.log('Wonderland runtime and experimental damage model prepared. No credentials downloaded.');
