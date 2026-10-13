import Image from 'next/image';
import type { ReactNode } from 'react';
import { getDictionary, type Locale } from '@/lib/i18n';
import { formatAnimeScore, formatMembers, formatRating, formatVotes, ratingSourceLink, type Ratings } from '@/lib/ratings';

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

export function RatingSummary({ ratings, title, locale, pendingImdb = false }: { ratings: Ratings; title: string; locale?: Locale; pendingImdb?: boolean }) {
  const d = getDictionary(locale);
  const animeScore = formatAnimeScore(ratings);
  const isMal = animeScore.startsWith('MAL ');
  const isAnilist = animeScore.startsWith('AniList ');
  const source = isMal ? 'myanimelist' : 'anilist';
  const members = formatMembers(ratings.malMembers);
  return <dl className="ratings">
    <SourceTile source="imdb" name={d.title.imdb} href={ratingSourceLink('imdb', ratings)} title={ratings.imdbSeriesTitle || title} locale={locale}>
      <dd className="rating-value">{pendingImdb ? '…' : formatRating(ratings.imdbRating)}{!pendingImdb && formatRating(ratings.imdbRating) !== 'n/a' && <span className="rating-scale"> / 10</span>}</dd>
      <dd className="rating-detail">{pendingImdb ? d.catalog.loadingRatings : <>{formatVotes(ratings.imdbVotes)} {d.title.voteCount}</>}</dd>
      {ratings.imdbSeriesTitle && <dd className="rating-detail">{d.title.seriesRating}: {ratings.imdbSeriesTitle}</dd>}
    </SourceTile>
    <SourceTile source={source} name={isMal ? 'MyAnimeList' : isAnilist ? 'AniList' : d.title.animeScore} href={ratingSourceLink(source, ratings)} title={title} locale={locale}>
      <dd className="rating-value">{isMal ? ratings.malScore!.toFixed(2) : isAnilist ? `${ratings.anilistScore}%` : 'n/a'}{isMal && <span className="rating-scale"> / 10</span>}</dd>
      <dd className="rating-detail">{isMal && members !== 'n/a' ? `${members} ${d.title.members}` : d.title.animeScore}</dd>
    </SourceTile>
  </dl>;
}
