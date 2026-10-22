// Run manually: npx tsx scripts/eval-similar.ts [AniList ids...]
// Direct GraphQL only; no Next cache, env files or per-candidate lookups.
import type { AniListAnime, AniListPage } from '../lib/anilist';
import { discoveryCandidate, DISCOVERY_DETAIL_FIELDS, DISCOVERY_MEDIA_FIELDS, popularCatalogQuery, POPULAR_CATALOG_PAGES, POPULAR_PAGES_PER_BATCH } from '../lib/anilist-discovery-query';
import { rankSimilar } from '../lib/discovery-similarity';
import { currentSeason, shiftSeason } from '../lib/season';
import { setTimeout as sleep } from 'node:timers/promises';

const DEFAULT_IDS = [185874, 154587, 161645, 1, 101921, 147103];
let lastCompleted = 0;
async function graphql<T>(query: string, variables: Record<string, string | number> = {}): Promise<T> {
  // At least 5.5 seconds after completion, including HTTP/GraphQL errors.
  await sleep(Math.max(0, lastCompleted + 5500 - Date.now()));
  try {
    const response = await fetch('https://graphql.anilist.co', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ query, variables }), signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) throw new Error(`AniList HTTP ${response.status}`);
    const result = await response.json() as { data?: T; errors?: { message?: string }[] };
    if (result.errors?.length || !result.data) throw new Error(JSON.stringify(result.errors ?? 'Missing AniList data'));
    return result.data;
  } finally { lastCompleted = Date.now(); }
}

async function main() {
  const ids = process.argv.length > 2 ? [...new Set(process.argv.slice(2).map(Number))] : DEFAULT_IDS;
  if (ids.some(id => !Number.isSafeInteger(id) || id <= 0 || id > 2147483647)) throw new Error('Expected positive AniList IDs');
  const pool = new Map<number, AniListAnime>();
  // Same seasonal coverage, page limit, and popular query as production.
  const selected = currentSeason();
  for (const { year, season } of [shiftSeason(selected, -1), selected]) {
    const seen = new Set<number>();
    for (let page = 1; page <= 40; page++) {
      const data = await graphql<{ Page: AniListPage }>(`query ($year: Int!, $season: MediaSeason!, $page: Int!) {
        Page(page: $page, perPage: 50) {
          pageInfo { currentPage hasNextPage }
          media(type: ANIME, season: $season, seasonYear: $year, sort: POPULARITY_DESC,
            format_in: [TV, TV_SHORT, MOVIE, ONA, OVA]) { ${DISCOVERY_MEDIA_FIELDS} }
        }
      }`, { year, season: season.toUpperCase(), page });
      const before = seen.size;
      for (const anime of data.Page.media) { pool.set(anime.id, anime); seen.add(anime.id); }
      if (!data.Page.pageInfo.hasNextPage || before === seen.size) break;
    }
  }
  const popular = new Map<number, AniListAnime>();
  for (let page = 1; page <= POPULAR_CATALOG_PAGES; page += POPULAR_PAGES_PER_BATCH) {
    const data = await graphql<Record<string, AniListPage>>(popularCatalogQuery(page));
    const batch = Array.from({ length: POPULAR_PAGES_PER_BATCH }, (_, offset) => data[`page${page + offset}`]);
    for (const result of batch) for (const anime of result.media) popular.set(anime.id, discoveryCandidate(anime));
    if (batch.some(result => !result.pageInfo.hasNextPage)) break;
  }
  const catalog = [...new Map([...popular, ...pool]).values()];
  console.log(`Candidate pool: ${catalog.length} titles`);
  for (const id of ids) {
    const { Media: anime } = await graphql<{ Media: AniListAnime | null }>(
      `query ($id: Int!) { Media(id: $id, type: ANIME) { ${DISCOVERY_DETAIL_FIELDS} } }`, { id });
    if (!anime) { console.log(`\n${id}: not found`); continue; }
    console.log(`\n${id}: ${anime.title.english || anime.title.romaji}`);
    console.table(rankSimilar(anime, catalog).slice(0, 6).map(({ anime: candidate, score }, index) => ({
      rank: index + 1, id: candidate.id, title: candidate.title.english || candidate.title.romaji,
      score: Number(score.toFixed(3)),
    })));
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
