import { sitemapUrls } from '@/lib/seo-sitemap';

export const revalidate = 86400;

export function GET() {
  const escapeXml = (value: string) => value.replace(/[<>&"']/g,
    char => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[char]!);
  const entries = sitemapUrls().map(url => `<sitemap><loc>${escapeXml(url)}</loc></sitemap>`).join('');
  return new Response(`<?xml version="1.0" encoding="UTF-8"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${entries}</sitemapindex>`, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
}
