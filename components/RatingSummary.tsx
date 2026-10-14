'use client';
import Image from 'next/image';
import { withTimeout } from '@/lib/async-timeout';
import { useEffect, useState, type ReactNode } from 'react';
import { getDictionary, type Locale } from '@/lib/i18n';
import { formatAnimeScore, formatMembers, formatRating, formatVotes, ratingSourceLink, type Ratings } from '@/lib/ratings';

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

function SourceTile({ source, name, href, title, children, locale }: {
  source: 'imdb' | 'anilist' | 'myanimelist'; name: string; href?: string; title: string; children: ReactNode; locale?: Locale;
}) {
  const d = getDictionary(locale);
  const brand = <><span className={`rating-logo rating-logo-${source}`}><Image src={`/logos/${source}.svg`} alt="" width={24} height={24} /></span><span>{name}</span>{href && <span className="rating-external" aria-hidden="true">↗</span>}</>;
  return <div className={`rating-tile${href ? ' rating-tile-linked' : ''}`}>
    <dt className="rating-source">{href ? <a href={href} target="_blank" rel="noopener noreferrer" aria-label={`${title} on ${name} (${d.title.opensNewTab})`}>{brand}</a> : brand}</dt>
    {children}
  </div>;
}

export interface ImdbLookup { tmdbId: number; kind: 'tv' | 'movie' }
export function ImdbRatingTile({ ratings, title, locale, pending = false, lookup, allowRetry = true }: { ratings: Ratings; title: string; locale?: Locale; pending?: boolean; lookup?: ImdbLookup | null; allowRetry?: boolean }) {
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
  const retry = async () => {
    if (!query) return;
    setBusy(true);
    try {
      const result = await withTimeout((async () => {
        const response = await fetch(`/api/imdb?${query}`, { signal: AbortSignal.timeout(15000) });
        if (!response.ok) throw new Error('IMDb unavailable');
        return await response.json() as Ratings;
      })(), 15000);
      setRetried({ query, ratings: { ...ratings, ...result } });
    } catch { setRetried({ query, ratings: { ...ratings, imdbStatus: 'error' } }); }
    finally { setBusy(false); }
  };
  return <SourceTile source="imdb" name={d.title.imdb} href={ratingSourceLink('imdb', current)} title={current.imdbSeriesTitle || title} locale={locale}>
    <dd className={`rating-value${!waiting && !ready ? ' rating-value-state' : ''}`}>{waiting ? '…' : ready ? value : error ? d.title.imdbError : 'n/a'}{!waiting && ready && <span className="rating-scale"> / 10</span>}</dd>
    <dd className="rating-detail" role={waiting ? 'status' : undefined}>{waiting ? d.catalog.loadingRatings : ready ? <>{formatVotes(current.imdbVotes)} {d.title.voteCount}</> : error ? d.title.imdbErrorDetail : current.imdbStatus === 'unmatched' ? d.title.imdbUnmatchedDetail : d.title.imdbUnavailableDetail}</dd>
    {allowRetry && !waiting && !ready && query && <dd className="rating-detail"><button type="button" onClick={retry}>{d.error.retry}</button></dd>}
    {current.imdbSeriesTitle && <dd className="rating-detail">{d.title.seriesRating}: {current.imdbSeriesTitle}</dd>}
  </SourceTile>;
}

export function AnimeRatingTile({ ratings, title, locale, pending = false }: { ratings: Ratings; title: string; locale?: Locale; pending?: boolean }) {
  const d = getDictionary(locale);
  const waiting = usePendingTimeout(pending);
  const animeScore = formatAnimeScore(ratings);
  const isMal = animeScore.startsWith('MAL ');
  const isAnilist = animeScore.startsWith('AniList ');
  const source = isMal ? 'myanimelist' : 'anilist';
  const members = formatMembers(ratings.malMembers);
  return <SourceTile source={source} name={isMal ? 'MyAnimeList' : isAnilist ? 'AniList' : d.title.animeScore} href={ratingSourceLink(source, ratings)} title={title} locale={locale}>
    <dd className="rating-value">{waiting ? '…' : isMal ? ratings.malScore!.toFixed(2) : isAnilist ? `${ratings.anilistScore}%` : 'n/a'}{isMal && <span className="rating-scale"> / 10</span>}</dd>
    <dd className="rating-detail">{waiting ? d.catalog.loadingRatings : isMal && members !== 'n/a' ? `${members} ${d.title.members}` : d.title.animeScore}</dd>
  </SourceTile>;
}

export function RatingSummary({ ratings, title, locale, pendingImdb = false, pendingAnime = false, imdbLookup, allowRetry = true }: { ratings: Ratings; title: string; locale?: Locale; pendingImdb?: boolean; pendingAnime?: boolean; imdbLookup?: ImdbLookup | null; allowRetry?: boolean }) {
  return <dl className="ratings">
    <ImdbRatingTile ratings={ratings} title={title} locale={locale} pending={pendingImdb} lookup={imdbLookup} allowRetry={allowRetry} />
    <AnimeRatingTile ratings={ratings} title={title} locale={locale} pending={pendingAnime} />
  </dl>;
}
