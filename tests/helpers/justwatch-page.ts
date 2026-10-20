// Minimal JustWatch title page: a Nuxt reference table with one primary title,
// its offers per country, and hreflang links to the canonical regional pages.
export interface PageOffer { id: number; name: string; href: string; monetization?: string }
export function justWatchPage(path: string, imdb: string, offers: Record<string, PageOffer[]>, alternates: Record<string, string> = {}) {
  const table: unknown[] = [];
  function ref(value: unknown): number {
    const index = table.length; table.push(null);
    table[index] = Array.isArray(value) ? value.map(ref) : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([key, item]) => [key, ref(item)])) : value;
    return index;
  }
  ref({ __typename: 'Url', fullPath: path, node: { __ref: 'Show:1' } });
  ref({ 'Show:1': {
    'content({"country":"US"})': { externalIds: { imdbId: imdb } },
    ...Object.fromEntries(Object.entries(offers).map(([country, list]) => [`offers({"country":"${country}"})`, list.map(offer => ({
      country, monetizationType: offer.monetization ?? 'FLATRATE', package: { packageId: offer.id, clearName: offer.name }, standardWebURL: offer.href,
    }))])),
  } });
  const links = Object.entries(alternates).map(([lang, href]) => `<link rel="alternate" hreflang="${lang}" href="${href}">`).join('');
  return `${links}<script id="__NUXT_DATA__">${JSON.stringify(table)}</script>`;
}
