import type { NextConfig } from 'next';
const config: NextConfig = { images: { remotePatterns: [{ protocol: 'https', hostname: 'image.tmdb.org', pathname: '/t/p/**' }] } };
export default config;
