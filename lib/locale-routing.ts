import { isLocale, locales, type Locale } from '@/lib/locales';

export const openGraphLocales: Record<Locale, string> = {
  it: 'it_IT', en: 'en_US', es: 'es_ES', fr: 'fr_FR', de: 'de_DE', pt: 'pt_PT',
};
export function stripLocale(path: string): string {
  return path.replace(/^\/(en|it|es|fr|de|pt)(?=\/|\?|#|$)/, '').replace(/^(?=[?#]|$)/, '/');
}
export function localePath(path: string, locale: Locale): string {
  // Leave APIs, assets, anchors, protocol-relative and external URLs alone.
  if (!path.startsWith('/') || path.startsWith('//') || /^\/(?:api|_next)(?:\/|$)/.test(path) || /\.[a-z0-9]+$/i.test(path.split(/[?#]/)[0])) return path;
  const bare = stripLocale(path);
  return locale === 'it' ? bare : `/${locale}${bare === '/' ? '' : bare.startsWith('/?') || bare.startsWith('/#') ? bare.slice(1) : bare}`;
}
export function languageAlternates(path: string, base: URL): Record<string, string> {
  return Object.fromEntries([...locales.map(locale => [locale, new URL(localePath(path, locale), base).href]),
    ['x-default', new URL(localePath(path, 'it'), base).href]]);
}
export function pathLocale(path: string): Locale {
  const first = path.split('/')[1];
  return isLocale(first) ? first : 'it';
}
