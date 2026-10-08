import {readdir, readFile, mkdir, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const destination = path.join(root, 'artifacts/public-source');
const entries = [];
const roots = ['.env.example','.gitignore','README.md','SECURITY.md','package.json','package-lock.json','cloudflare-env.d.ts','drizzle.config.ts','next-env.d.ts','next.config.ts','postcss.config.mjs','server.mjs','tsconfig.json','vite.config.ts','app','build','db','docs','drizzle','lib','licenses','scripts','tests','vendor','wonderland','standalone','public/workspace'];
const extensions = new Set(['.js','.mjs','.mts','.ts','.tsx','.css','.html','.md','.sql','.json','.jsonc','.wlp','.txt','.py','.ps1','.sh','.LICENSE','.svg']);
const skip = relative => /(?:^|\/)(?:node_modules|deploy|cache|\.cache|\.git|\.local-data|\.openai|\.wrangler|\.sites-runtime)(?:\/|$)/.test(relative)
  || /\.local\.|\.map(?:\.gz)?$|\.tsbuildinfo$|\.log$/.test(relative)
  || ['scripts/refine.py','scripts/finalize.py'].includes(relative)
  || (relative.startsWith('public/workspace/wonderland/') && relative !== 'public/workspace/wonderland/index.html')
  || (relative.startsWith('public/workspace/vendor/') && !['public/workspace/vendor/damage','public/workspace/vendor/mediapipe','public/workspace/vendor/mediapipe/models'].includes(relative) && !/^public\/workspace\/vendor\/(?:damage\/(?:model-card\.json|ATTRIBUTION\.txt|TORCHVISION-LICENSE\.txt)|mediapipe\/models\/manifest\.json|APACHE-2\.0\.txt)$/.test(relative));
const secretPatterns = [/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/, /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})/, /\bAKIA[A-Z0-9]{16}\b/, /#invite=[A-Z2-9]{8}\.[a-f0-9]{48}/, /(?:API_TOKEN|AUTH_BOOTSTRAP_KEY|TURN_SHARED_SECRET)\s*[:=]\s*["'][A-Za-z0-9_\/-]{24,}["']/];
async function include(relative) {
  if (skip(relative)) return;
  const filename = path.join(root, relative);
  let children;
  try { children = await readdir(filename, {withFileTypes: true}); } catch (error) { if (error.code !== 'ENOTDIR') throw error; }
  if (children) { for (const child of children) await include(relative + '/' + child.name); return; }
  if (!extensions.has(path.extname(relative)) && !['.gitignore','.env.example','README.md','SECURITY.md'].includes(relative)) return;
  const content = await readFile(filename, 'utf8');
  if (secretPatterns.some(pattern => pattern.test(content))) throw new Error(`Potential credential in public source: ${relative}`);
  if (/[A-Z]:[\\/]+Users[\\/]+[^"'\\/\s]+/.test(content)) throw new Error(`Personal filesystem path in public source: ${relative}`);
  entries.push({path: relative, mode: '100644', type: 'blob', content});
  const output = path.join(destination, relative);
  await mkdir(path.dirname(output), {recursive: true}); await writeFile(output, content);
}
for (const item of roots) await include(item);
await mkdir(path.join(root, 'artifacts'), {recursive: true});
await writeFile(path.join(root, 'artifacts/public-source-entries.json'), JSON.stringify(entries));
console.log(`Exported ${entries.length} reviewed text/source files. Private configuration, data, credentials and binaries were excluded.`);
