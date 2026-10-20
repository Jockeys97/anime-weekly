import 'server-only';
import { unstable_cache } from 'next/cache';
import { CACHE_TAG, type StreamingRegion } from '@/lib/config';
import { findProviderOffer, regionalWatchPage, type WatchTarget } from '@/lib/watch-links';
import { recoverJustWatchOffers } from '@/lib/justwatch-recovery';
import { verifiedWeeklyIdentity } from '@/lib/verified-weekly-identities';

const LINK_CACHE_SECONDS = 3600;
interface TitleIdentity {
  id?: number;
  name?: string;
  title?: string;
  imdb_id?: string | null;
  external_ids?: { imdb_id?: string | null };
}

// The official metadata API remains usable when the public TMDB watch page
// blocks a server request. Never search by a visitor-supplied name or IMDb ID.
async function watchIdentity(kind: WatchTarget['kind'], id: number) {
  // The weekly snapshot lists a verified identity's own offers; resolve them from the same page.
  const pinned = verifiedWeeklyIdentity(`${kind}:${id}`);
  if (pinned) return { name: pinned.justWatchName, imdbId: pinned.imdbId };
  const token = process.env.TMDB_READ_TOKEN?.trim(), key = process.env.TMDB_API_KEY?.trim();
  if (!token && !key) return null;
  const url = new URL(`https://api.themoviedb.org/3/${kind}/${id}`);
  url.searchParams.set('language', 'en-US');
  url.searchParams.set('append_to_response', 'external_ids');
  if (!token) url.searchParams.set('api_key', key!);
  const response = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    cache: 'force-cache', next: { revalidate: LINK_CACHE_SECONDS, tags: [CACHE_TAG] },
    signal: AbortSignal.timeout(6000), redirect: 'error',
  });
  if (!response.ok) return null;
  const detail = await response.json() as TitleIdentity;
  const name = (kind === 'tv' ? detail.name : detail.title)?.trim();
  const imdbId = detail.external_ids?.imdb_id || (kind === 'movie' ? detail.imdb_id : null);
  return detail.id === id && name && /^tt\d+$/.test(imdbId || '') ? { name, imdbId: imdbId! } : null;
}

class MissingWatchDestination extends Error {}
const cachedDestination = unstable_cache(async (kind: WatchTarget['kind'], id: number, region: StreamingRegion, provider: number) => {
  const target = { kind, id, region, provider };
  try {
    const response = await fetch(regionalWatchPage(target), {
      cache: 'force-cache', next: { revalidate: LINK_CACHE_SECONDS, tags: [CACHE_TAG] },
      signal: AbortSignal.timeout(8000), redirect: 'error',
    });
    if (response.ok && response.headers.get('content-type')?.includes('text/html')) {
      const html = await response.text();
      const offer = html.length <= 2_000_000 ? findProviderOffer(html, target) : null;
      if (offer) return offer;
    }
  } catch { /* Try the independently verified JustWatch page below. */ }
  const identity = await watchIdentity(kind, id);
  if (identity) {
    const watch = await recoverJustWatchOffers(identity.name, identity.imdbId, region, kind);
    const href = watch?.providers.find(item => item.provider_id === provider)?.watch_url;
    if (href) return href;
  }
  // Missing links and outages must not poison the successful-link cache.
  throw new MissingWatchDestination();
}, ['regional-watch-destination-v1'], { revalidate: LINK_CACHE_SECONDS, tags: [CACHE_TAG] });

export async function resolveWatchDestination(target: WatchTarget): Promise<string> {
  try { return await cachedDestination(target.kind, target.id, target.region, target.provider); }
  catch { return regionalWatchPage(target); }
}
