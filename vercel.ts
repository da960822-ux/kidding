const configuredUpstream = process.env.API_UPSTREAM_ORIGIN?.replace(/\/+$/, '');
let upstream: string;

try {
  const url = new URL(configuredUpstream ?? '');
  if (url.protocol !== 'https:' || url.origin !== configuredUpstream) throw new Error();
  upstream = url.origin;
} catch {
  throw new Error('API_UPSTREAM_ORIGIN must be an HTTPS origin without a path.');
}

export const config = {
  installCommand: 'npm ci',
  buildCommand: 'npm run build',
  outputDirectory: 'dist',
  rewrites: [
    { source: '/api/:path*', destination: `${upstream}/api/:path*` },
    { source: '/(.*)', destination: '/index.html' },
  ],
};
