import type { NextConfig } from 'next';
const config: NextConfig = { staticPageGenerationTimeout: 300, images: { remotePatterns: [{ protocol: 'https', hostname: 'image.tmdb.org', pathname: '/t/p/**' }] } };
export default config;
