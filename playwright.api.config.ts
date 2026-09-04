import { defineConfig } from '@playwright/test';
import base from './playwright.config';

export default defineConfig({
  ...base,
  testIgnore: [],
  testMatch: '**/mutation-retry.spec.ts',
  webServer: { ...base.webServer, env: { VITE_USE_MOCK_API: 'false' } },
});
