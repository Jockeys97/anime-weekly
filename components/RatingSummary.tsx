'use client';
import Image from 'next/image';
import { useLocale } from '@/components/LanguageSelector';
import { withTimeout } from '@/lib/async-timeout';
import { useEffect, useRef, useState, type ReactNode, type Ref } from 'react';
import { getDictionary, type Locale } from '@/lib/i18n';
import { formatAnimeScore, formatMembers, formatRating, formatVotes, ratingSourceLink, type Ratings } from '@/lib/ratings';
import { loadMalRating } from '@/lib/mal-rating-client';

function usePendingTimeout(pending: boolean) {
  const [expired, setExpired] = useState(false);
  useEffect(() => {
    if (!pending) return;
    const reset = setTimeout(() => setExpired(false), 0);
    const timer = setTimeout(() => setExpired(true), 30000);
    return () => { clearTimeout(reset); clearTimeout(timer); };
  }, [pending]);
  return pending && !expired;
}

function SourceTile({ source, name, href, title, children, locale, tileRef }: {
  source: 'imdb' | 'anilist' | 'myanimelist'; name: string; href?: string; title: string; children: ReactNode; locale?: Locale; tileRef?: Ref<HTMLDivElement>;
}) {
  const d = getDictionary(locale);
  const brand = <><span className={`rating-logo rating-logo-${source}`}><Image src={`/logos/${source}.svg`} alt="" width={24} height={24} /></span><span>{name}</span>{href && <span className="rating-external" aria-hidden="true">↗</span>}</>;
  return <div ref={tileRef} className={`rating-tile${href ? ' rating-tile-linked' : ''}`}>
    <dt className="rating-source">{href ? <a href={href} target="_blank" rel="noopener noreferrer" aria-label={`${title} on ${name} (${d.title.opensNewTab})`}>{brand}</a> : brand}</dt>
    {children}
  </div>;
}

export interface ImdbLookup { tmdbId: number; kind: 'tv' | 'movie' }
async function loadImdbRating(query: string): Promise<Ratings> {
  return withTimeout((async () => {
    const response = await fetch(`/api/imdb?${query}`, { signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error('IMDb unavailable');
    return await response.json() as Ratings;
  })(), 15000);
}
export function ImdbRatingTile({ ratings, title, locale, pending = false, lookup, allowRetry = true, followLocale = false, autoLoad = false }: { ratings: Ratings; title: string; locale?: Locale; pending?: boolean; lookup?: ImdbLookup | null; allowRetry?: boolean; followLocale?: boolean; autoLoad?: boolean }) {
  const selectedLocale = useLocale();
  locale = followLocale ? selectedLocale : locale;
  const d = getDictionary(locale);
  const query = ratings.imdbId ? new URLSearchParams({ imdb: ratings.imdbId }).toString()
    : lookup ? new URLSearchParams({ tmdb: String(lookup.tmdbId), kind: lookup.kind }).toString()
      : lookup !== null && ratings.anilistId ? new URLSearchParams({ anilist: String(ratings.anilistId) }).toString() : '';
  const [retried, setRetried] = useState<{ query: string; ratings: Ratings } | null>(null);
  const [busy, setBusy] = useState(false);
  const current = retried?.query === query ? retried.ratings : ratings;
  const waiting = usePendingTimeout(pending) || busy;
  const value = formatRating(current.imdbRating);
  const ready = value !== 'n/a';
  const error = current.imdbStatus === 'error' && current.imdbErrorReason !== 'quota' && current.imdbErrorReason !== 'authentication';
  const serverReady = formatRating(ratings.imdbRating) !== 'n/a';
  useEffect(() => {
    if (!autoLoad || serverReady || !query || pending) return;
    let active = true;
    // Only missing server values are recovered. This endpoint reads the shared
    // dataset/cron cache and cannot make visitor-triggered OMDb requests.
    void loadImdbRating(query).then(result => {
      if (active) setRetried({ query, ratings: { ...ratings, ...result } });
    }).catch(() => {
      if (active) setRetried({ query, ratings: { ...ratings, imdbStatus: 'error' } });
    });
    return () => { active = false; };
  }, [autoLoad, serverReady, query, pending, ratings]);
  const retry = async () => {
    if (!query) return;
    setBusy(true);
    try {
      const result = await loadImdbRating(query);
      setRetried({ query, ratings: { ...ratings, ...result } });
    } catch { setRetried({ query, ratings: { ...ratings, imdbStatus: 'error' } }); }
    finally { setBusy(false); }
  };
  return <SourceTile source="imdb" name={d.title.imdb} href={ratingSourceLink('imdb', current)} title={current.imdbSeriesTitle || title} locale={locale}>
    <dd className={`rating-value${!waiting && !ready ? ' rating-value-state' : ''}`}>{waiting ? '…' : ready ? value : autoLoad ? 'n/d' : error ? d.title.imdbError : 'n/a'}{!waiting && ready && <span className="rating-scale"> / 10</span>}</dd>
    <dd className="rating-detail" role={waiting ? 'status' : undefined}>{waiting ? d.catalog.loadingRatings : ready ? <>{formatVotes(current.imdbVotes)} {d.title.voteCount}</> : error ? d.title.imdbErrorDetail : current.imdbStatus === 'unmatched' ? d.title.imdbUnmatchedDetail : d.title.imdbUnavailableDetail}</dd>
    {allowRetry && !waiting && !ready && query && <dd className="rating-detail"><button type="button" onClick={retry}>{d.error.retry}</button></dd>}
    {current.imdbSeriesTitle && <dd className="rating-detail">{d.title.seriesRating}: {current.imdbSeriesTitle}</dd>}
  </SourceTile>;
}

export function AnimeRatingTile({ ratings, title, locale, pending = false, followLocale = false, unavailableLabel = 'n/a' }: { ratings: Ratings; title: string; locale?: Locale; pending?: boolean; followLocale?: boolean; unavailableLabel?: string }) {
  const selectedLocale = useLocale();
  locale = followLocale ? selectedLocale : locale;
  const d = getDictionary(locale);
  const waiting = usePendingTimeout(pending);
  const animeScore = formatAnimeScore({ anilistScore: ratings.anilistScore });
  const isAnilist = animeScore.startsWith('AniList ');
  const failed = !isAnilist && ratings.animeStatus === 'error';
  return <SourceTile source="anilist" name="AniList" href={ratingSourceLink('anilist', ratings)} title={title} locale={locale}>
    <dd className={`rating-value${failed ? ' rating-value-state' : ''}`}>{waiting ? '…' : isAnilist ? `${ratings.anilistScore}%` : failed ? d.title.imdbError : unavailableLabel}</dd>
    <dd className="rating-detail" role={waiting ? 'status' : undefined}>{waiting ? d.catalog.loadingRatings : failed ? d.title.imdbErrorDetail : d.title.animeScore}</dd>
  </SourceTile>;
}

export function MyAnimeListRatingTile({ ratings, title, locale, pending = false, followLocale = false, eager = false, frozen = false }: { ratings: Ratings; title: string; locale?: Locale; pending?: boolean; followLocale?: boolean; eager?: boolean; frozen?: boolean }) {
  const selectedLocale = useLocale();
  locale = followLocale ? selectedLocale : locale;
  const d = getDictionary(locale);
  const tile = useRef<HTMLDivElement>(null);
  const query = ratingSourceLink('myanimelist', ratings) ? `mal=${ratings.malId}`
    : ratingSourceLink('anilist', ratings) ? `anilist=${ratings.anilistId}` : '';
  const [loaded, setLoaded] = useState<{ query: string; ratings: Ratings } | null>(null);
  const [attempt, retry] = useState(0);
  const [loading, setLoading] = useState<string | null>(null);
  const initialReady = formatAnimeScore({ malScore: ratings.malScore }).startsWith('MAL ');
  const current = !initialReady && loaded?.query === query ? { ...ratings, ...loaded.ratings } : ratings;
  const ready = formatAnimeScore({ malScore: current.malScore }).startsWith('MAL ');
  const needsLookup = Boolean(!frozen && query && !initialReady && (!ratings.malStatus || ratings.malStatus === 'error' || attempt > 0) && !pending);
  useEffect(() => {
    if (!needsLookup) return;
    let active = true;
    let observer: IntersectionObserver | undefined;
    const load = () => {
      observer?.disconnect();
      setLoading(query);
      // Include time spent in the shared catalog queue. A stalled observer or
      // queued request must never leave a visible tile loading indefinitely.
      void withTimeout(loadMalRating(query), 20000).then(result => { if (active) setLoaded({ query, ratings: result }); })
        .catch(() => { if (active) setLoaded({ query, ratings: { malStatus: 'error' } }); })
        .finally(() => { if (active) setLoading(null); });
    };
    const timer = eager || typeof IntersectionObserver === 'undefined' ? setTimeout(load, 0) : undefined;
    if (timer === undefined) {
      observer = new IntersectionObserver(entries => { if (entries.some(entry => entry.isIntersecting)) load(); }, { rootMargin: '100px' });
      if (tile.current) observer.observe(tile.current);
    }
    return () => { active = false; clearTimeout(timer); observer?.disconnect(); };
  }, [needsLookup, query, attempt, eager]);
  const waiting = usePendingTimeout(pending && !initialReady) || (needsLookup && !ready && loading === query && loaded?.query !== query);
  const failed = current.malStatus === 'error';
  const members = formatMembers(current.malMembers);
  return <SourceTile source="myanimelist" name="MyAnimeList" href={ratingSourceLink('myanimelist', current)} title={title} locale={locale} tileRef={tile}>
    <dd className={`rating-value${!waiting && !ready ? ' rating-value-state' : ''}`}>{waiting ? '…' : ready ? current.malScore!.toFixed(2) : eager ? 'n/d' : failed ? d.title.imdbError : 'n/a'}{!waiting && ready && <span className="rating-scale"> / 10</span>}</dd>
    <dd className="rating-detail" role={waiting ? 'status' : undefined}>{waiting ? d.catalog.loadingRatings : failed ? d.title.malErrorDetail : !ready ? d.title.malUnavailableDetail
      : Number.isSafeInteger(current.malScoredBy) && current.malScoredBy! >= 0 ? `${formatVotes(String(current.malScoredBy))} ${d.title.voteCount}`
        : members !== 'n/a' ? `${members} ${d.title.members}` : d.title.animeScore}</dd>
    {!frozen && !waiting && failed && query && <dd className="rating-detail"><button type="button" onClick={() => { setLoaded(null); retry(value => value + 1); }}>{d.error.retry}</button></dd>}
  </SourceTile>;
}

export function RatingSummary({ ratings, title, locale, pendingImdb = false, pendingAnime = false, imdbLookup, allowRetry = true, frozen = false }: { ratings: Ratings; title: string; locale?: Locale; pendingImdb?: boolean; pendingAnime?: boolean; imdbLookup?: ImdbLookup | null; allowRetry?: boolean; frozen?: boolean }) {
  return <dl className="ratings">
    <ImdbRatingTile ratings={ratings} title={title} locale={locale} pending={pendingImdb} lookup={imdbLookup} allowRetry={!frozen && allowRetry} />
    <AnimeRatingTile ratings={ratings} title={title} locale={locale} pending={pendingAnime} />
    <MyAnimeListRatingTile ratings={ratings} title={title} locale={locale} pending={pendingAnime} frozen={frozen} />
  </dl>;
}
