import 'server-only';
import { cache } from 'react';
import type { AniListAnime } from '@/lib/anilist';
import { siteUrl } from '@/lib/seo';

export const SIMILAR_CATALOG_TAG = 'similar-catalog';
export const SIMILAR_CATALOG_RESPONSE_TAG = 'similar-catalog-response-v3';

// The API owns unstable_cache reads AND cron writes. Pages only cache HTTP
// responses, whose keys do not depend on compiled loader function source.
// Only the server's cron credential is sent; never forward visitor headers.
export const readSharedSimilarCatalog = cache(async (catalog: 'full' | 'seasonal'): Promise<AniListAnime[]> => {
  const secret = process.env.CRON_SECRET;
  if (!secret?.trim()) throw new Error('CRON_SECRET is required to read the shared similar catalog');
  const origin = process.env.VERCEL_ENV === 'preview' && process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}` : siteUrl();
  // Version the URL too: Next's fetch key excludes next.tags, and an existing
  // entry can retain its old tags even after a caller stops supplying them.
  const response = await fetch(new URL(`/api/similar-catalog?catalog=${catalog}&cache=v3`, origin), {
    headers: { Authorization: `Bearer ${secret}` },
    // Next 16 keeps authenticated fetches cached with an explicit positive
    // revalidate value, including when the surrounding page is dynamic.
    // The cron marks only this HTTP snapshot stale after successful warming.
    cache: 'force-cache', next: { revalidate: 604800, tags: [SIMILAR_CATALOG_RESPONSE_TAG] },
    signal: AbortSignal.timeout(4000),
  });
  if (!response.ok) throw new Error(`Shared similar catalog unavailable (${response.status})`);
  const result = await response.json() as { media?: AniListAnime[] };
  if (!Array.isArray(result.media)) throw new Error('Invalid shared similar catalog');
  return result.media;
});
