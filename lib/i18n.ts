import en from '@/messages/en.json';
import it from '@/messages/it.json';
import es from '@/messages/es.json';
import fr from '@/messages/fr.json';
import de from '@/messages/de.json';
import pt from '@/messages/pt.json';
import { defaultLocale, isLocale } from '@/lib/locales';
export { defaultLocale, locales, type Locale } from '@/lib/locales';
export type Dictionary = typeof en;
const translations = { it, es, fr, de, pt };
const dictionaries = new Map<string, Dictionary>();
export function getDictionary(value: string = defaultLocale): Dictionary {
  const locale = isLocale(value) ? value : defaultLocale;
  const cached = dictionaries.get(locale);
  if (cached) return cached;
  const translated = locale === 'en' ? en : translations[locale];
  const dictionary = { ...en, ...translated, title: { ...en.title, ...translated.title }, regions: { ...en.regions, ...translated.regions } };
  dictionaries.set(locale, dictionary);
  return dictionary;
}
