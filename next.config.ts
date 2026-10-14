import type { NextConfig } from 'next';
const config: NextConfig = { async redirects() { return [{ source: '/favicon.ico', destination: '/icon.svg', permanent: false }]; }, staticPageGenerationTimeout: 300, images: { remotePatterns: [{ protocol: 'https', hostname: 'image.tmdb.org', pathname: '/t/p/**' }, { protocol: 'https', hostname: 's4.anilist.co', pathname: '/**' }] } };
export default config;
