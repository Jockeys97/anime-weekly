import type { NextConfig } from 'next';
const config: NextConfig = { staticPageGenerationTimeout: 300, images: { remotePatterns: [{ protocol: 'https', hostname: 'image.tmdb.org', pathname: '/t/p/**' }, { protocol: 'https', hostname: 's4.anilist.co', pathname: '/**' }] } };
export default config;
