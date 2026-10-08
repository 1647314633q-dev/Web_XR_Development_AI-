import {createHash} from 'node:crypto';

export function staticHeaders(wonderlandHtml) {
  const importMap = wonderlandHtml.match(/<script type="importmap">([\s\S]*?)<\/script>/)?.[1];
  if (!importMap) throw new Error('Wonderland import map is missing.');
  const hash = createHash('sha256').update(importMap).digest('base64');
  return {
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'same-origin',
    'Permissions-Policy': 'camera=(self), microphone=(self), xr-spatial-tracking=(self)',
    // Permit only the generated import map, local scripts and WebAssembly compilation.
    'Content-Security-Policy': `default-src 'self'; script-src 'self' 'wasm-unsafe-eval' 'sha256-${hash}'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self'; worker-src 'self' blob:; frame-src 'self'; frame-ancestors 'self'; object-src 'none'; base-uri 'self'; form-action 'self'`
  };
}
