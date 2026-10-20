import 'server-only';
import { unstable_cache } from 'next/cache';
import { CACHE_TAG, type StreamingRegion } from '@/lib/config';
import { getAnime } from '@/lib/anilist';
import { getDetailProviders } from '@/lib/detail-availability';
import { recoverJustWatchOffers } from '@/lib/justwatch-recovery';
import { providerBase } from '@/lib/landing-providers';
import { providerWatchLink } from '@/lib/provider-watch-link';
import type { AnimeTitle, Provider } from '@/lib/tmdb';
import { verifiedIdentityForAnilist } from '@/lib/verified-weekly-identities';
import { animeName, getFavoriteAnime, type AniListAnime, type FavoriteAnime, type FavoriteSequel } from '@/lib/anilist';
import { activeSequel, missingSequelIds, SEQUEL_HOPS } from '@/lib/favorites';

/** Saved AniList favourites with their airing (or announced) sequel, one batched request per hop. */
export async function resolveFavoriteAnime(ids: number[]): Promise<{ entries: { media: FavoriteAnime; sequel: FavoriteSequel | null }[]; unavailable: boolean }> {
  if (!ids.length) return { entries: [], unavailable: false };
  const anime = await getFavoriteAnime(ids);
  const lookup = new Map<number, FavoriteAnime>(anime.media.map(media => [media.id, media]));
  let unavailable = anime.unavailable;
  for (let hop = 0; hop < SEQUEL_HOPS; hop++) {
    const missing = [...new Set(anime.media.flatMap(media => missingSequelIds(media, lookup)))].filter(id => !lookup.has(id));
    if (!missing.length) break;
    const more = await getFavoriteAnime(missing);
    for (const media of more.media) lookup.set(media.id, media);
    if (more.unavailable) { unavailable = true; break; }
  }
  return { entries: anime.media.map(media => ({ media, sequel: activeSequel(media, lookup) })), unavailable };
}
export const favoriteName = (anime: FavoriteAnime | FavoriteSequel) => animeName(anime as AniListAnime);

export interface FavoriteProvider { id: number; name: string; logo: string; href: string }
type StoredWatch = { kind: 'tv' | 'movie'; id: number; providers: AnimeTitle['providers'] } | null;
// Providers for one AniList entry, all countries, cached daily: same identity
// rules as the detail page (providers only, no ratings). Failures stay retryable.
const cachedFavoriteWatch = unstable_cache(async (anilistId: number): Promise<{ direct: StoredWatch; series: StoredWatch }> => {
  const anime = await getAnime(anilistId);
  if (!anime) return { direct: null, series: null };
  const watch = await getDetailProviders(anime);
  if (watch.providersUnavailable || watch.seriesWatch?.providersUnavailable) throw new Error('Favourite providers unavailable');
  return {
    direct: watch.match ? { kind: watch.match.kind, id: watch.match.id, providers: watch.providers } : null,
    series: watch.seriesWatch ? { kind: watch.seriesWatch.kind, id: watch.seriesWatch.id, providers: watch.seriesWatch.providers } : null,
  };
}, ['favorite-watch-v1'], { revalidate: 86400, tags: [CACHE_TAG] });

function toFavoriteProviders(offers: Provider[], kind: 'tv' | 'movie', tmdbId: number, region: StreamingRegion): FavoriteProvider[] {
  const byBase = new Map<string, FavoriteProvider>();
  for (const offer of offers) {
    const logo = offer.logo_path ? `https://image.tmdb.org/t/p/w92${offer.logo_path}` : offer.logo_url;
    if (!logo) continue;
    const key = providerBase(offer.provider_name), current = byBase.get(key);
    if (current && current.name.length <= offer.provider_name.length) continue;
    byBase.set(key, { id: offer.provider_id, name: offer.provider_name, logo, href: offer.watch_url || providerWatchLink(kind, tmdbId, region, offer.provider_id) });
  }
  return [...byBase.values()].slice(0, 3);
}

/** Up to three platforms for a favourite in the visitor's country; [] when none is known. */
export async function favoriteProviders(anilistId: number, region: StreamingRegion): Promise<FavoriteProvider[]> {
  const pinned = verifiedIdentityForAnilist(anilistId);
  if (pinned) {
    const [kind, id] = pinned.key.split(':');
    const offers = await recoverJustWatchOffers(pinned.identity.justWatchName, pinned.identity.imdbId, region).catch(() => null);
    return offers ? toFavoriteProviders(offers.providers, kind as 'tv' | 'movie', Number(id), region) : [];
  }
  const watch = await cachedFavoriteWatch(anilistId).catch(() => null);
  const source = watch?.direct?.providers[region]?.providers.length ? watch.direct : watch?.series?.providers[region]?.providers.length ? watch.series : null;
  return source ? toFavoriteProviders(source.providers[region]!.providers, source.kind, source.id, region) : [];
}
