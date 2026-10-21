import 'server-only';
import { cache } from 'react';
import { unstable_cache } from 'next/cache';
import { getQuickWeekData } from '@/lib/tmdb';
import { getWeeklyRatings, WEEKLY_PAGE_TAG } from '@/lib/weekly-ratings';
import { listArchivedWeeks, readWeekArchive, WEEK_ARCHIVE_LIST_TAG, WEEK_ARCHIVE_TAG } from '@/lib/week-archive';
import { formatWeek, isoWeek, parseWeek } from '@/lib/week';
import { weeklyRankings } from '@/lib/weekly-rankings';
import type { SitemapWeek } from '@/lib/seo-sitemap';

// Shared by HTML, metadata, OG and sitemap. Never run rating enrichment here.
export const getSeoWeek = cache(async (slug: string) => {
  const week = parseWeek(slug);
  if (!week || slug > formatWeek(isoWeek(new Date()))) return null;
  const archived = await readWeekArchive(week);
  const [data, ratings] = archived ? [archived.data, archived.ratings]
    : await Promise.all([getQuickWeekData(week, 'en'), getWeeklyRatings(slug)]);
  if (data.status !== 'ready' || !data.titles.length) return null;
  const titles = data.titles.map(title => ({ ...title, ratings: { ...title.ratings, ...ratings.titles[`${title.kind}:${title.id}`] } }));
  return { week: slug, titles, rankings: weeklyRankings(titles), savedAt: archived?.savedAt };
});

// Cache the membership index once for all anime. Only real archive/current-week
// titles establish membership; a season association or next airing cannot do so.
const readWeekIndex = unstable_cache(async () => {
  const archived = await listArchivedWeeks();
  const current = formatWeek(isoWeek(new Date()));
  const candidates = [...archived.filter(item => item.week < current), { week: current, uploadedAt: new Date().toISOString() }];
  const weeks: SitemapWeek[] = [];
  const appearances: Record<number, { week: string; ranked: boolean }[]> = {};
  // Sequential, bounded Blob reads reuse readWeekArchive's seven-day cache.
  for (const candidate of candidates) {
    const data = await getSeoWeek(candidate.week);
    if (!data) continue;
    const ranked = new Set([...data.rankings.imdb, ...data.rankings.mal].map(entry => entry.anilistId));
    weeks.push({ week: candidate.week, uploadedAt: candidate.uploadedAt, titleCount: data.titles.length, rankingCount: ranked.size });
    for (const id of new Set(data.titles.map(title => title.ratings.anilistId).filter((id): id is number => Number.isSafeInteger(id) && id! > 0))) {
      (appearances[id] ??= []).push({ week: candidate.week, ranked: ranked.has(id) });
    }
  }
  return { weeks, appearances };
}, ['weekly-seo-membership-v1'], { revalidate: 900, tags: [WEEKLY_PAGE_TAG, WEEK_ARCHIVE_LIST_TAG, WEEK_ARCHIVE_TAG] });

export async function getSeoWeeks() { return (await readWeekIndex()).weeks; }
export async function getAnimeWeekAppearances(id: number) { return (await readWeekIndex()).appearances[id] ?? []; }
