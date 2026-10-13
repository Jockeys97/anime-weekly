import en from '@/messages/en.json';
export const defaultLocale = 'en';
export const locales = ['en'] as const;
export type Locale = typeof locales[number];
export type Dictionary = typeof en;
export function getDictionary(locale: string = defaultLocale): Dictionary {
  // Add a dictionary and its locale here when another language is available.
  switch (locale) { case 'en': return en; default: return en; }
}
