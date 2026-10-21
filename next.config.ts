import type { NextConfig } from 'next';
const config: NextConfig = {
  // Public files are not fingerprinted: cache with a bounded TTL, not immutable.
  // Next already serves fingerprinted /_next/static assets as immutable.
  async headers() { return ['/logos/:path*', '/icon.svg'].map(source => ({
    source, headers: [{ key: 'Cache-Control', value: 'public, max-age=2592000, stale-while-revalidate=86400' }],
  })); },
  experimental: { globalNotFound: true },
  async redirects() { return [
  ...(process.env.VERCEL_ENV === 'production' ? ['anime-weekly\\.vercel\\.app', 'anime-weekly-[a-z0-9-]+\\.vercel\\.app'].map(host => ({
    source: '/:path((?!api/).*)', has: [{ type: 'host' as const, value: host }],
    destination: 'https://weeklyanime.com/:path*', permanent: true,
  })) : []),
  { source: '/favicon.ico', destination: '/icon.svg', permanent: false },
]; }, staticPageGenerationTimeout: 300,
  // Local previews can reuse public catalog data without copying credentials.
  // Production always keeps its own API route, even if the flag is set.
  async rewrites() {
    return { beforeFiles: process.env.NODE_ENV === 'development' && process.env.ANIME_WEEKLY_LOCAL_PREVIEW_DATA === '1' ? [
      { source: '/api/anime-card/:id', destination: 'https://anime-weekly.vercel.app/api/anime-card/:id' },
    ] : [], afterFiles: [], fallback: [] };
  }, images: { unoptimized: true, remotePatterns: [{ protocol: 'https', hostname: 'images.justwatch.com', pathname: '/icon/**' }, { protocol: 'https', hostname: 'image.tmdb.org', pathname: '/t/p/**' }, { protocol: 'https', hostname: 's4.anilist.co', pathname: '/**' }] } };
export default config;
