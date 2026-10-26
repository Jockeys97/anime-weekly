import sitemap from '@/lib/sitemap-shards';
import { sitemapIds } from '@/lib/seo-sitemap';
import { serializeSitemap } from '@/lib/sitemap-xml';

// No generateStaticParams: upstream discovery must never run during the build.
export const dynamic = 'force-dynamic';

// Successful XML is cached by the CDN. Keep the underlying catalog/airings
// caches independent: nesting unstable_cache would bypass their existing data.
const readShard = async (id: string) => {
  return serializeSitemap(await sitemap({ id: Promise.resolve(id) }));
};
const pendingShards = new Map<string, Promise<string>>();

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: filename } = await params;
  const id = filename.endsWith('.xml') ? filename.slice(0, -4) : '';
  if (!sitemapIds().includes(id)) return new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } });
  try {
    let pending = pendingShards.get(id);
    if (!pending) {
      pending = readShard(id).finally(() => pendingShards.delete(id));
      pendingShards.set(id, pending);
    }
    return new Response(await pending, { headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=0, s-maxage=86400, stale-while-revalidate=604800',
    } });
  } catch (error) {
    console.error('[sitemap] Shard unavailable', { id, message: error instanceof Error ? error.message : 'Unknown error' });
    // The discovery shard depends on the Blob-backed catalog. When that store
    // is unavailable, answer with a valid empty urlset instead of a recurring
    // 503 that Google keeps retrying. Short CDN TTL so real entries return
    // soon after the catalog recovers.
    if (id === 'discovery') return new Response(serializeSitemap([]), { headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=0, s-maxage=3600',
    } });
    return new Response('Sitemap temporarily unavailable', { status: 503, headers: {
      'Cache-Control': 'no-store', 'Retry-After': '60',
    } });
  }
}
