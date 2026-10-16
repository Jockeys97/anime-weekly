import type { NextConfig } from 'next';
const config: NextConfig = { async redirects() { return [
  ...['anime-weekly\\.vercel\\.app', 'anime-weekly-[a-z0-9-]+\\.vercel\\.app'].map(host => ({
    source: '/:path((?!api/).*)', has: [{ type: 'host' as const, value: host }],
    destination: 'https://weeklyanime.com/:path*', permanent: true,
  })),
  { source: '/favicon.ico', destination: '/icon.svg', permanent: false },
]; }, staticPageGenerationTimeout: 300,
  // Local previews can reuse public catalog data without copying credentials.
  // Production always keeps its own API route, even if the flag is set.
  async rewrites() {
    return { beforeFiles: process.env.NODE_ENV === 'development' && process.env.ANIME_WEEKLY_LOCAL_PREVIEW_DATA === '1' ? [
      { source: '/api/anime-card/:id', destination: 'https://anime-weekly.vercel.app/api/anime-card/:id' },
    ] : [], afterFiles: [], fallback: [] };
  }, images: { remotePatterns: [{ protocol: 'https', hostname: 'images.justwatch.com', pathname: '/icon/**' }, { protocol: 'https', hostname: 'image.tmdb.org', pathname: '/t/p/**' }, { protocol: 'https', hostname: 's4.anilist.co', pathname: '/**' }] } };
export default config;
