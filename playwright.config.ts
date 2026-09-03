import { defineConfig } from '@playwright/test';

const port = Number(process.env.PLAYWRIGHT_PORT ?? 4173);

export default defineConfig({
  testDir: './tests/webapp',
  workers: 1,
  use: { baseURL: `http://127.0.0.1:${port}` },
  webServer: { command: `pnpm exec vite --host 127.0.0.1 --port ${port} --strictPort`, url: `http://127.0.0.1:${port}`, env: { VITE_USE_MOCK_API: 'true' }, reuseExistingServer: false },
});
