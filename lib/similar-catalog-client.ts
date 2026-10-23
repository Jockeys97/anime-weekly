import 'server-only';
import { cache } from 'react';
import type { AniListAnime } from '@/lib/anilist';
import { CACHE_TAG } from '@/lib/config';
import { siteUrl } from '@/lib/seo';

export const SIMILAR_CATALOG_TAG = 'similar-catalog';

// The API owns unstable_cache reads AND cron writes. Pages only cache HTTP
// responses, whose keys do not depend on compiled loader function source.
// No credentials or visitor headers enter this public, read-only request.
export const readSharedSimilarCatalog = cache(async (catalog: 'full' | 'seasonal'): Promise<AniListAnime[]> => {
  const origin = process.env.VERCEL_ENV === 'preview' && process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}` : siteUrl();
  const response = await fetch(new URL(`/api/similar-catalog?catalog=${catalog}`, origin), {
    cache: 'force-cache', next: { revalidate: 86400, tags: [CACHE_TAG, SIMILAR_CATALOG_TAG] },
  });
  if (!response.ok) throw new Error(`Shared similar catalog unavailable (${response.status})`);
  const result = await response.json() as { media?: AniListAnime[] };
  if (!Array.isArray(result.media)) throw new Error('Invalid shared similar catalog');
  return result.media;
});
