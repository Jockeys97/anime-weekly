import en from '@/messages/en.json';
import it from '@/messages/it.json';
export const defaultLocale = 'en';
export const locales = ['en', 'it'] as const;
export type Locale = typeof locales[number];
export type Dictionary = typeof en;
export function getDictionary(locale: string = defaultLocale): Dictionary {
  if (locale === 'it') return { ...en, ...it, state: { ...en.state, ...it.state }, title: { ...en.title, ...it.title } };
  return en;
}
