import { episodeSegments, similarSegments } from '@/lib/discovery';
import { isLocale, locales, type Locale } from '@/lib/locales';

export const landingSlugs = {
  'this-week': { it: 'questa-settimana', en: 'this-week', es: 'esta-semana', fr: 'cette-semaine', de: 'diese-woche', pt: 'esta-semana' },
  'best-this-season': { it: 'migliori-della-stagione', en: 'best-this-season', es: 'mejores-de-la-temporada', fr: 'meilleurs-de-la-saison', de: 'beste-der-saison', pt: 'melhores-da-temporada' },
  'rankings/this-week': { it: 'rankings/questa-settimana', en: 'rankings/this-week', es: 'rankings/esta-semana', fr: 'rankings/cette-semaine', de: 'rankings/diese-woche', pt: 'rankings/esta-semana' },
} satisfies Record<string, Record<Locale, string>>;
export function landingRoute(path: string): keyof typeof landingSlugs | undefined {
  const slug = stripLocale(path).split(/[?#]/)[0].replace(/^\/|\/$/g, '');
  return (Object.keys(landingSlugs) as (keyof typeof landingSlugs)[]).find(key => Object.values(landingSlugs[key]).some(value => value === slug));
}

export const openGraphLocales: Record<Locale, string> = {
  it: 'it_IT', en: 'en_US', es: 'es_ES', fr: 'fr_FR', de: 'de_DE', pt: 'pt_PT',
};
export function stripLocale(path: string): string {
  return path.replace(/^\/(en|it|es|fr|de|pt)(?=\/|\?|#|$)/, '').replace(/^(?=[?#]|$)/, '/');
}
export function localePath(path: string, locale: Locale): string {
  // Leave APIs, assets, anchors, protocol-relative and external URLs alone.
  if (!path.startsWith('/') || path.startsWith('//') || /^\/(?:api|_next)(?:\/|$)/.test(path) || /\.[a-z0-9]+$/i.test(path.split(/[?#]/)[0])) return path;
  const imageSuffix = path.split(/[?#]/)[0].endsWith('/opengraph-image') ? '/opengraph-image' : '';
  const route = landingRoute(imageSuffix ? path.replace('/opengraph-image', '') : path);
  const bare = route ? `/${landingSlugs[route][locale]}${imageSuffix}${path.match(/[?#].*$/)?.[0] ?? ''}` : localizeDiscoveryPath(stripLocale(path), locale);
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

/** Translate nested public routes while keeping one App Router implementation. */
export function localizeDiscoveryPath(path: string, locale: Locale): string {
  return path.replace(/^(\/anime\/[^/?#]+\/)([^/?#]+)(?=[?#]|$)/, (all, prefix: string, segment: string) => {
    const episode = /^(?:episode|episodio|folge)-([1-9]\d*)$/.exec(segment);
    if (episode) return `${prefix}${episodeSegments[locale]}-${episode[1]}`;
    return Object.values(similarSegments).includes(segment) ? `${prefix}${similarSegments[locale]}` : all;
  }).replace(/^\/([^/?#]+)(\/[^/?#]+)(?=[?#]|$)/, (all, prefix: string, suffix: string) =>
    Object.values(landingSlugs['best-this-season']).includes(prefix) ? `/${landingSlugs['best-this-season'][locale]}${suffix}` : all);
}
export function discoveryInternalPath(path: string): string | null {
  const bare = stripLocale(path);
  const anime = /^(\/anime\/[^/]+\/)([^/]+)$/.exec(bare);
  if (anime) {
    const episode = /^(?:episode|episodio|folge)-([1-9]\d*)$/.exec(anime[2]);
    if (episode) return `${anime[1]}episode-${episode[1]}`;
    if (Object.values(similarSegments).includes(anime[2])) return `${anime[1]}similar`;
  }
  const genre = /^\/([^/]+)\/([^/]+)$/.exec(bare);
  return genre && Object.values(landingSlugs['best-this-season']).includes(genre[1]) ? `/best-this-season/${genre[2]}` : null;
}
