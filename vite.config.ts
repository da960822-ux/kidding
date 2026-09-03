import { execFileSync } from 'node:child_process';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

function gitRevision() {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
}

export default defineConfig(({ command, mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), ''), ...process.env };
  const apiBase = env.VITE_API_BASE_URL?.trim();
  const revision = env.VITE_APP_REVISION?.trim() || env.VERCEL_GIT_COMMIT_SHA?.trim() || gitRevision();

  if (command === 'build') {
    if (env.VITE_USE_MOCK_API === 'true') throw new Error('Production build cannot enable VITE_USE_MOCK_API.');
    if (apiBase) {
      const apiUrl = new URL(apiBase);
      if (!['http:', 'https:'].includes(apiUrl.protocol)) throw new Error('VITE_API_BASE_URL must use http or https.');
      if ((env.CI === 'true' || env.VERCEL === '1') && ['localhost', '127.0.0.1', '::1'].includes(apiUrl.hostname)) {
        throw new Error('Deployment build cannot use a local VITE_API_BASE_URL.');
      }
    }
    if (!revision) throw new Error('Production build requires a build revision.');
  }

  return {
    plugins: [react()],
    server: {
      strictPort: true,
      proxy: command === 'serve' && env.API_UPSTREAM_ORIGIN
        ? { '/api': { target: env.API_UPSTREAM_ORIGIN, changeOrigin: false } }
        : undefined,
    },
    preview: { strictPort: true },
    define: { 'import.meta.env.VITE_BUILD_REVISION': JSON.stringify(revision || 'development') },
  };
});
