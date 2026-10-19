import type { MetadataRoute } from 'next';
import { siteUrl } from '@/lib/seo';
import { sitemapUrls } from '@/lib/seo-sitemap';
export const revalidate = 86400;
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/', disallow: '/api/' },
    sitemap: [new URL('/sitemap.xml', siteUrl()).href, ...sitemapUrls()],
  };
}
