import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { createServer } from 'node:net';

const packageManager = process.env.npm_execpath;
const packageCommand = packageManager ? process.execPath : 'pnpm';
const packageArgs = (args) => packageManager ? [packageManager, ...args] : args;
const python = process.platform === 'win32' && existsSync('backend/.venv/Scripts/python.exe')
  ? 'backend/.venv/Scripts/python.exe'
  : 'python';
const aiTests = readdirSync('ai/tests').filter((name) => name.endsWith('.test.mjs')).sort().map((name) => `ai/tests/${name}`);
const browserPort = await new Promise((resolve, reject) => {
  const server = createServer();
  server.once('error', reject);
  server.listen(0, '127.0.0.1', () => {
    const address = server.address();
    server.close(() => resolve(String(typeof address === 'object' && address ? address.port : 4173)));
  });
});

const suites = [
  ['AI unit', 'node', ['--test', ...aiTests]],
  ['AI manifests', 'node', ['ai/scripts/validate-manifests.mjs']],
  ['AI transcript dataset', 'node', ['ai/scripts/validate-transcript-dataset.mjs', 'ai/evals/transcript-v2.jsonl']],
  ['Backend', python, ['-m', 'unittest', 'discover', '-s', 'backend', '-p', 'test_*.py', '-v'], { PYTHONPATH: 'backend' }],
  ['Frontend contract fixture', 'node', ['--test', 'tests/webapp/worker-briefing-v2.fixture.test.mjs']],
  ['Deployment proxy config', 'node', ['scripts/check-vercel-proxy.mjs']],
  ['Frontend contract', packageCommand, packageArgs(['run', 'check:contracts'])],
  ['Frontend build', packageCommand, packageArgs(['run', 'build'])],
  ['Browser E2E', packageCommand, packageArgs(['run', 'test:web']), { PLAYWRIGHT_PORT: browserPort }],
];

if (process.env.LIVE_E2E === '1') {
  suites.push(['Paid live E2E', python, ['backend/live_e2e.py']]);
}

const failed = [];
for (const [name, command, args, extraEnv = {}] of suites) {
  console.log(`\n=== ${name} ===`);
  const result = spawnSync(command, args, { stdio: 'inherit', env: { ...process.env, ...extraEnv } });
  if (result.status !== 0) failed.push(`${name} (${result.status ?? result.error?.message ?? 'failed'})`);
}

console.log(`\n=== Summary: ${suites.length - failed.length}/${suites.length} suites passed ===`);
if (failed.length) {
  console.error(`Failed: ${failed.join(', ')}`);
  process.exitCode = 1;
}
