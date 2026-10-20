import type { AniListAnime } from '@/lib/anilist';
import { getDictionary, type Locale } from '@/lib/i18n';
import type { Ratings } from '@/lib/ratings';
import { currentSeason } from '@/lib/season';
import { pageMetadata } from '@/lib/seo';
import { isoWeek, weekDateRange } from '@/lib/week';

export function landingHeading(kind: 'week' | 'best', locale: Locale, now = new Date()) {
  const d = getDictionary(locale);
  const season = currentSeason(now);
  const label = `${d.catalog.seasonNames[season.season]} ${season.year}`;
  return kind === 'week' ? `${d.landings.weekTitle} (${weekDateRange(isoWeek(now), locale)}) · ${label}` : `${d.landings.bestTitle} · ${label}`;
}

export function landingMetadata(kind: 'week' | 'best', locale: Locale, now = new Date()) {
  const d = getDictionary(locale).landings;
  const title = landingHeading(kind, locale, now);
  // These compact discovery pages have their own framing and content; the home
  // and /week/<current> remain full guides, so each keeps its own canonical.
  return pageMetadata(title, `${kind === 'week' ? d.weekDescription : d.bestDescription} ${title}.`, kind === 'week' ? '/this-week' : '/best-this-season', undefined, locale);
}

export function ratingSources(ratings: Ratings, averageScore = ratings.anilistScore) {
  const candidates = [
    { name: 'IMDb', score: ratings.imdbRating?.trim() ? Number(ratings.imdbRating) : NaN },
    { name: 'MyAnimeList', score: ratings.malScore ?? NaN },
    { name: 'AniList', score: averageScore == null ? NaN : averageScore / 10 },
  ];
  return candidates.filter(item => Number.isFinite(item.score) && item.score >= 0 && item.score <= 10);
}

export function rankSeason(media: readonly AniListAnime[], cached: Record<string, Ratings> = {}) {
  const unique = [...new Map(media.map(anime => [anime.id, anime])).values()];
  return unique.flatMap(anime => {
    const ratings = cached[anime.id] ?? {};
    const sources = ratingSources(ratings, anime.averageScore ?? ratings.anilistScore);
    if (!sources.length) return [];
    const score = sources.reduce((sum, source) => sum + source.score, 0) / sources.length;
    const anilistVotes = anime.stats?.scoreDistribution?.reduce((sum, entry) => sum + entry.amount, 0) ?? 0;
    const imdbVotes = Number(ratings.imdbVotes?.replaceAll(',', '') ?? 0);
    const votes = anilistVotes + (Number.isFinite(imdbVotes) ? imdbVotes : 0) + (ratings.malScoredBy ?? 0);
    return [{ anime, score, sources, votes }];
  }).sort((a, b) => b.score - a.score || b.votes - a.votes || a.anime.id - b.anime.id).slice(0, 50);
}
