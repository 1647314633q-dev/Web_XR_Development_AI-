// Receive existing TURN credentials via a single JSON line on a non-echoing stdin.
// No provider credential is written to a file or emitted to the terminal.
import {createInterface} from 'node:readline';
import {once} from 'node:events';
import {spawn} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {mkdir, readFile, writeFile, unlink} from 'node:fs/promises';

let line;
if (process.argv.includes('--temporary-file')) {
  const filename = '.local-data/turn-runtime-input.json';
  line = await readFile(filename, 'utf8'); await unlink(filename);
} else {
  const input = createInterface({input: process.stdin, terminal: false});
  [line] = await once(input, 'line'); input.close();
}
let turn;
try { turn = JSON.parse(line); } catch { throw new Error('Invalid secret input.'); }
if (!/^[a-zA-Z0-9_-]{1,128}$/.test(turn.keyId || '') || typeof turn.token !== 'string' || turn.token.length < 30) throw new Error('Existing TURN credentials are required.');
await mkdir('.local-data', {recursive: true});
const filename = '.local-data/production-bootstrap.txt';
let setup;
try { setup = (await readFile(filename, 'utf8')).trim(); }
catch { setup = randomBytes(32).toString('hex'); await writeFile(filename, setup, {mode: 0o600, flag: 'wx'}); }
const secrets = {AUTH_BOOTSTRAP_KEY: setup, CLOUDFLARE_TURN_KEY_ID: turn.keyId, CLOUDFLARE_TURN_API_TOKEN: turn.token};
const cli = spawn(process.execPath, ['node_modules/wrangler/bin/wrangler.js', 'secret', 'bulk', '--config', 'standalone/wrangler.local.jsonc'], {stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true});
let output = '';
cli.stdout.on('data', data => output += data); cli.stderr.on('data', data => output += data);
cli.stdin.end(JSON.stringify(secrets));
const [code] = await once(cli, 'exit');
for (const secret of Object.values(secrets)) output = output.replaceAll(secret, '[redacted]');
console.log(output);
if (code !== 0) throw new Error('Cloudflare secret configuration failed.');
console.log(`Runtime secrets saved. Administrator setup key: ${filename}`);
