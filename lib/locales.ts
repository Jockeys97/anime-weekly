export const locales = ['en', 'it', 'es', 'fr', 'de', 'pt'] as const;
export type Locale = typeof locales[number];
export const defaultLocale: Locale = 'en';
export const localeNames: Record<Locale, string> = { en: 'English', it: 'Italiano', es: 'Español', fr: 'Français', de: 'Deutsch', pt: 'Português' };
export const tmdbLanguages: Record<Locale, string> = { en: 'en-US', it: 'it-IT', es: 'es-ES', fr: 'fr-FR', de: 'de-DE', pt: 'pt-PT' };
export function isLocale(value: unknown): value is Locale { return typeof value === 'string' && locales.includes(value as Locale); }
export function negotiateLocale(acceptLanguage: string | null, saved?: string, fallback: Locale = defaultLocale): Locale {
  if (isLocale(saved)) return saved;
  const preferences = (acceptLanguage || '').split(',').map((part, index) => {
    const [tag, ...parameters] = part.trim().split(';');
    const quality = parameters.find(param => /^\s*q=/i.test(param));
    const q = quality ? Number(quality.split('=')[1]) : 1;
    return { locale: tag.toLowerCase().split('-')[0], q, index };
  }).filter(item => Number.isFinite(item.q) && item.q > 0 && item.q <= 1).sort((a, b) => b.q - a.q || a.index - b.index);
  return preferences.find(item => isLocale(item.locale))?.locale as Locale || fallback;
}
