import { animeName, type AniListAnime } from '@/lib/anilist';
import { animePath } from '@/lib/anime-url';
import { localePath } from '@/lib/locale-routing';
import { locales, type Locale } from '@/lib/locales';
import { pageMetadata, siteUrl } from '@/lib/seo';
import { listVisibility } from '@/lib/discovery';

export function animeChildAlternates(anime: Pick<AniListAnime, 'id' | 'title'>, names: Partial<Record<Locale, string>>, suffix: string, base = siteUrl()): Record<string, string> {
  const languages: Record<string, string> = Object.fromEntries(locales.map(locale => {
    const path = animePath(anime.id, names[locale] || animeName(anime as AniListAnime));
    return [locale, new URL(localePath(`${path}${suffix}`, locale), base).href];
  }));
  return { ...languages, 'x-default': languages.it };
}
export function listMetadata(title: string, intro: string, path: string, count: number, locale: Locale) {
  return { ...pageMetadata(title, intro, path, undefined, locale), robots: { index: listVisibility(count) === 'index', follow: true } };
}
