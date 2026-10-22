import { animePath, animeSlug } from '@/lib/anime-url';
import type { AniListAnime } from '@/lib/anilist';
import type { Ratings } from '@/lib/ratings';
import { imdbVoteCount, MIN_IMDB_VOTES, MIN_MAL_SCORED_BY } from '@/lib/weekly-rankings';
import { getDictionary } from '@/lib/i18n';
import type { Locale } from '@/lib/locales';

export const episodeSegments = { it: 'episodio', en: 'episode', es: 'episodio', fr: 'episode', de: 'folge', pt: 'episodio' };
export const similarSegments = { it: 'simili', en: 'similar', es: 'similares', fr: 'similaires', de: 'aehnlich', pt: 'semelhantes' };
export const episodePath = (id: number, name: string, episode: number) => `${animePath(id, name)}/episode-${episode}`;
export const similarPath = (id: number, name: string) => `${animePath(id, name)}/similar`;
export const genrePath = (genre: string) => `/best-this-season/${animeSlug(genre)}`;
export function parseEpisode(segment: string): number | null {
  const match = /^(?:episode|episodio|folge)-([1-9]\d*)$/.exec(segment);
  const n = match ? Number(match[1]) : NaN;
  return Number.isSafeInteger(n) && n <= 100000 ? n : null;
}
export function episodeInSitemap(airingAt: number, now = new Date()): boolean {
  return Number.isSafeInteger(airingAt) && airingAt > 0 && airingAt * 1000 <= now.getTime() + 14 * 86400000;
}
export function listVisibility(count: number): 'index' | 'noindex' | 'not-found' {
  return count >= 5 ? 'index' : count > 0 ? 'noindex' : 'not-found';
}
export function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => String(values[key] ?? match));
}
export function episodeTitle(name: string, episode: number, locale: Locale): string {
  return fill(getDictionary(locale).discovery.episodeTitle, { title: name, n: episode });
}
export function rankSimilar(source: AniListAnime, catalog: readonly AniListAnime[]) {
  const tags = new Set(source.tags?.filter(tag => !tag.isMediaSpoiler).map(tag => tag.name) ?? []);
  const recommended = new Set(source.recommendations?.nodes?.filter(node => (node.rating ?? 0) > 0).map(node => node.mediaRecommendation?.id));
  return [...new Map(catalog.map(anime => [anime.id, anime])).values()].flatMap(anime => {
    if (anime.id === source.id) return [];
    const genres = anime.genres.filter(genre => source.genres.includes(genre));
    const sharedTags = anime.tags?.filter(tag => !tag.isMediaSpoiler && tags.has(tag.name)) ?? [];
    const recommendation = recommended.has(anime.id);
    if (!genres.length && !sharedTags.length && !recommendation) return [];
    const score = genres.length * 3 + sharedTags.length + (recommendation ? 3 : 0) + (anime.averageScore ?? 0) / 100;
    return [{ anime, score, genres }];
  }).sort((a, b) => b.score - a.score || a.anime.id - b.anime.id);
}
export function rankGenre(catalog: readonly AniListAnime[], genre: string, ratings: Record<number, Ratings>) {
  return [...new Map(catalog.map(anime => [anime.id, anime])).values()].flatMap(anime => {
    if (!anime.genres.includes(genre)) return [];
    const r = ratings[anime.id] ?? {};
    const sources = [
      { name: 'IMDb', score: Number(r.imdbRating), votes: imdbVoteCount(r.imdbVotes), minimum: MIN_IMDB_VOTES },
      { name: 'MyAnimeList', score: r.malScore ?? NaN, votes: r.malId === anime.idMal ? r.malScoredBy ?? 0 : 0, minimum: MIN_MAL_SCORED_BY },
    ].filter(s => Number.isFinite(s.score) && s.score > 0 && s.score <= 10 && Number.isSafeInteger(s.votes) && s.votes >= s.minimum);
    // A fresh deployment has no weekly/provider ratings yet. The catalog's
    // AniList average is already available, so no per-title enrichment is needed.
    // Keep it a fallback: never dilute qualifying IMDb/MAL scores with it.
    const average = anime.averageScore;
    if (!sources.length && typeof average === 'number' && Number.isFinite(average) && average > 0 && average <= 100) {
      const votes = anime.stats?.scoreDistribution?.reduce((sum, entry) => sum + entry.amount, 0) ?? 0;
      sources.push({ name: 'AniList', score: average / 10, votes: Number.isSafeInteger(votes) && votes >= 0 ? votes : 0, minimum: 0 });
    }
    if (!sources.length) return [];
    return [{ anime, sources, score: sources.reduce((sum, s) => sum + s.score, 0) / sources.length, votes: sources.reduce((sum, s) => sum + s.votes, 0) }];
  }).sort((a, b) => b.score - a.score || b.votes - a.votes || a.anime.id - b.anime.id);
}
