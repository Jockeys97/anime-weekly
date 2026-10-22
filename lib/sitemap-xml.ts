import type { MetadataRoute } from 'next';

const escapeXml = (value: string) => value.replace(/[<>&"']/g, char => ({
  '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;',
})[char]!);

export function serializeSitemap(entries: MetadataRoute.Sitemap): string {
  const urls = entries.map(entry => {
    const fields = [`<loc>${escapeXml(entry.url)}</loc>`];
    for (const [language, href] of Object.entries(entry.alternates?.languages ?? {})) {
      if (href) fields.push(`<xhtml:link rel="alternate" hreflang="${escapeXml(language)}" href="${escapeXml(href)}" />`);
    }
    if (entry.lastModified) fields.push(`<lastmod>${escapeXml(entry.lastModified instanceof Date ? entry.lastModified.toISOString() : entry.lastModified)}</lastmod>`);
    if (entry.changeFrequency) fields.push(`<changefreq>${entry.changeFrequency}</changefreq>`);
    if (entry.priority != null) fields.push(`<priority>${entry.priority}</priority>`);
    return `<url>${fields.join('')}</url>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">${urls.join('')}</urlset>`;
}
