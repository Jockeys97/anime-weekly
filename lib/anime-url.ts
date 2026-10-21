/** Stable, ASCII-only slugs shared by server metadata and client links. */
export function animeSlug(name: string): string {
  return name.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    .slice(0, 60).replace(/-+$/g, '');
}

export function animePath(id: number, name = ''): string {
  const slug = animeSlug(name);
  return `/anime/${id}${slug ? `-${slug}` : ''}`;
}

export function parseAnimeId(segment: string): number | null {
  const match = /^([1-9]\d*)(?:-.*)?$/.exec(segment);
  const id = match ? Number(match[1]) : NaN;
  return Number.isSafeInteger(id) && id <= 2147483647 ? id : null;
}

export function animeLanguageAlternates(id: number, name: string, names: Partial<Record<import('@/lib/locales').Locale, string>>, base: URL): Record<string, string> {
  const languages = Object.fromEntries((['it', 'en', 'es', 'fr', 'de', 'pt'] as const).map(locale => [locale,
    new URL(`${locale === 'it' ? '' : `/${locale}`}${animePath(id, names[locale] || name)}`, base).href,
  ]));
  return { ...languages, 'x-default': languages.it };
}
