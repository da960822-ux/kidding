import { defineConfig } from '@playwright/test';

const port = Number(process.env.PLAYWRIGHT_PORT ?? 5173);

export default defineConfig({
  testDir: './tests/webapp',
  use: { baseURL: `http://127.0.0.1:${port}` },
  webServer: { command: `node ./node_modules/vite/bin/vite.js --host 127.0.0.1 --port ${port}`, url: `http://127.0.0.1:${port}`, env: { VITE_USE_MOCK_API: 'true' }, reuseExistingServer: !process.env.CI && port === 5173 },
});
