import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { loadConfigFromFile } from 'vite';

const config = await readFile(new URL('../vercel.ts', import.meta.url), 'utf8');
const apiRewrite = config.indexOf("source: '/api/:path*'");
const spaFallback = config.indexOf("source: '/(.*)'");

assert.match(config, /process\.env\.API_UPSTREAM_ORIGIN/);
assert.match(config, /url\.origin !== configuredUpstream/);
assert.match(config, /destination: `\$\{upstream\}\/api\/:path\*`/);
assert.ok(apiRewrite >= 0 && apiRewrite < spaFallback, 'API rewrite must precede SPA fallback');
assert.doesNotMatch(config, /onrender\.com/);

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
