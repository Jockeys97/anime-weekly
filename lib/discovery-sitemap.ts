import 'server-only';
import type { MetadataRoute } from 'next';
import { getDiscoveryCatalog, getGenreLists } from '@/lib/discovery-data';
import { getSitemapEpisodes } from '@/lib/episode-data';
import { animeName } from '@/lib/anilist';
import { getAnimeLocalizedTitles } from '@/lib/anime-localized-titles';
import { animeChildAlternates } from '@/lib/discovery-seo';
import { genrePath, listVisibility, rankSimilar } from '@/lib/discovery';
import { languageAlternates } from '@/lib/locale-routing';
import { locales } from '@/lib/locales';
import { siteUrl } from '@/lib/seo';

export async function getDiscoverySitemap(now = new Date(), base = siteUrl()): Promise<MetadataRoute.Sitemap> {
  const catalog = await getDiscoveryCatalog();
  // Fail the regeneration on upstream errors: a partial success would remove
  // previously published URLs from the cached discovery shard.
  const [events, genres] = await Promise.all([getSitemapEpisodes(catalog, now), getGenreLists()]);
  const entries: MetadataRoute.Sitemap = [];
  const byId = new Map(catalog.map(anime => [anime.id, anime]));
  const suffixes = new Map<number, string[]>();
  for (const event of events) if (byId.has(event.mediaId)) (suffixes.get(event.mediaId) ?? (suffixes.set(event.mediaId, []), suffixes.get(event.mediaId)!)).push(`/episode-${event.episode}`);
  for (const anime of catalog) if (listVisibility(rankSimilar(anime, catalog).length) === 'index') {
    const paths = suffixes.get(anime.id) ?? [];
    paths.push('/similar'); suffixes.set(anime.id, paths);
  }
  // Resolve names once per anime, in bounded groups, rather than per episode.
  const ids = [...suffixes.keys()];
  for (let offset = 0; offset < ids.length; offset += 4) {
    const translated = await Promise.all(ids.slice(offset, offset + 4).map(async id => {
      const anime = byId.get(id)!;
      return { anime, names: await getAnimeLocalizedTitles(id, animeName(anime)) };
    }));
    for (const { anime, names } of translated) for (const suffix of suffixes.get(anime.id)!) {
      const languages = animeChildAlternates(anime, names, suffix, base);
      for (const locale of locales) entries.push({ url: languages[locale], alternates: { languages }, changeFrequency: 'daily' });
    }
  }
  for (const list of genres.lists) if (listVisibility(list.items.length) === 'index') {
    const languages = languageAlternates(genrePath(list.genre), base);
    for (const locale of locales) entries.push({ url: languages[locale], alternates: { languages }, changeFrequency: 'daily' });
  }
  return entries;
}
