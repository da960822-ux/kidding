import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { execFileSync, spawnSync } from 'node:child_process';
import { loadConfigFromFile } from 'vite';

const config = await readFile(new URL('../vercel.ts', import.meta.url), 'utf8');
const apiRewrite = config.indexOf("routes.rewrite('/api/:path*'");
const spaFallback = config.indexOf("routes.rewrite('/(.*)'");

assert.match(config, /process\.env\.API_UPSTREAM_ORIGIN/);
assert.match(config, /url\.origin !== configuredUpstream/);
assert.match(config, /`\$\{upstream\}\/api\/:path\*`/);
assert.ok(apiRewrite >= 0 && apiRewrite < spaFallback, 'API rewrite must precede SPA fallback');
assert.doesNotMatch(config, /onrender\.com/);

const importConfig = `import { config } from './vercel.ts'; console.log(JSON.stringify(config));`;
const args = ['--experimental-strip-types', '--input-type=module', '-e', importConfig];
const actual = JSON.parse(execFileSync(process.execPath, args, {
  cwd: new URL('..', import.meta.url),
  env: { ...process.env, API_UPSTREAM_ORIGIN: 'https://api.example.com' },
  encoding: 'utf8',
}));
assert.equal(actual.framework, 'vite');
assert.equal(actual.rewrites[0].destination, 'https://api.example.com/api/:path*');
assert.equal(actual.rewrites[1].destination, '/index.html');
for (const upstream of ['', 'http://api.example.com', 'https://api.example.com/path', 'https://user:password@api.example.com']) {
  assert.notEqual(spawnSync(process.execPath, args, {
    cwd: new URL('..', import.meta.url),
    env: { ...process.env, API_UPSTREAM_ORIGIN: upstream },
  }).status, 0, `Reject invalid upstream: ${upstream}`);
}

process.env.API_UPSTREAM_ORIGIN = 'http://127.0.0.1:8000';
process.env.VITE_API_BASE_URL = ' ';
process.env.VITE_USE_MOCK_API = 'false';
process.env.VITE_APP_REVISION = 'proxy-check';
const development = await loadConfigFromFile({ command: 'serve', mode: 'development' });
assert.equal(development.config.server.proxy?.['/api']?.target, 'http://127.0.0.1:8000');
assert.equal(development.config.server.proxy['/api'].changeOrigin, false);
const production = await loadConfigFromFile({ command: 'build', mode: 'production' });
assert.equal(production.config.server.proxy, undefined, 'Development proxy must not enter production config');

console.log('Vercel same-origin API proxy configuration: PASS');
