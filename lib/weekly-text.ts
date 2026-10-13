import 'server-only';
import { getTMDBTextTranslations } from '@/lib/tmdb';
import { translateText } from '@/lib/deepl';
import { animeDescription } from '@/lib/anilist';
import { tmdbLanguages, type Locale } from '@/lib/locales';

export async function getWeeklyText(id: number, kind: 'tv' | 'movie', locale: Locale) {
  const entries = await getTMDBTextTranslations(id, kind);
  const country = tmdbLanguages[locale].split('-')[1];
  const select = (language: string, field: 'name' | 'overview') => {
    const matches = entries.filter(entry => entry.iso_639_1 === language && entry[field]?.trim());
    return (matches.find(entry => entry.iso_3166_1 === country) || matches[0])?.[field]?.trim() || '';
  };
  // Names are independent of the interface language. Never machine-translate
  // a title: use its published English name or an existing romanized name.
  const readable = (value: string) => /[\u3040-\u30ff\u3400-\u9fff]/.test(value) ? '' : value;
  const name = readable(select('en', 'name')) || readable(select('ja', 'name'));
  let overview = animeDescription(select(locale, 'overview'));
  let machine = false;
  let overviewLanguage: string | null = overview ? locale : null;
  if (!overview) {
    const english = animeDescription(select('en', 'overview'));
    const japanese = animeDescription(select('ja', 'overview'));
    const original = english || japanese;
    const source = english ? 'EN' : 'JA';
    if (original) {
      const translated = await translateText(original, locale, source);
      overview = translated || original;
      overviewLanguage = translated ? locale : source.toLowerCase();
      machine ||= Boolean(translated);
    }
  }
  return { name: name || null, overview: overview || null, overviewLanguage, machine, locale };
}
