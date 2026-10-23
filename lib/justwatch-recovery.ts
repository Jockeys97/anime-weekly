import type { Provider } from '@/lib/tmdb';
import type { StreamingRegion } from '@/lib/config';

type RecordValue = Record<string, number>;
const record = (value: unknown): value is RecordValue => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const safeUrl = (value: unknown) => {
  try { const url = new URL(String(value)); return url.protocol === 'https:' && !url.username && !url.password ? url.href : null; } catch { return null; }
};

// Nuxt's public page payload is a flattened reference table. Follow only the
// primary URL's node and its offers, never recommendations or sponsored titles.
export function parseJustWatchPage(html: string, pageUrl: string, imdbId: string, region: StreamingRegion): { providers: Provider[]; regionalUrl?: string } | null {
  try {
    const script = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)].find(match => /id=["']__NUXT_DATA__["']/.test(match[1]));
    if (!script) return null;
    const table: unknown[] = JSON.parse(script[2]);
    if (!Array.isArray(table)) return null;
    const read = (index: number): unknown => index >= 0 ? table[index] : null;
    const deref = (index: number): unknown => {
      let value = read(index);
      for (let i = 0; i < 4 && record(value) && '__ref' in value; i++) {
        const key = read(value.__ref);
        if (typeof key !== 'string') return null;
        const cache = table.find(item => record(item) && key in item);
        value = record(cache) ? read(cache[key]) : null;
      }
      return value;
    };
    const url = new URL(pageUrl);
    const primary = table.find(item => record(item) && read(item.__typename) === 'Url' && read(item.fullPath) === url.pathname && 'node' in item);
    if (!record(primary)) return null;
    const node = deref(primary.node);
    if (!record(node)) return null;
    const content = Object.entries(node).filter(([key]) => key.startsWith('content(')).map(([, index]) => deref(index)).find(item => record(item) && 'externalIds' in item);
    if (!record(content)) return null;
    const ids = deref(content.externalIds);
    if (!record(ids) || read(ids.imdbId) !== imdbId || !/^tt\d+$/.test(imdbId)) return null;
    // The verified seed page publishes canonical regional paths, including
    // translated slugs and differing /serie/, /serie-tv/ and /tv-show/ prefixes.
    const alternate = [...html.matchAll(/<link\b[^>]*>/gi)].map(match => match[0]).find(tag => {
      const lang = tag.match(/hreflang=["']([^"']+)["']/i)?.[1];
      return lang?.split('-').at(-1)?.toUpperCase() === region;
    });
    const regionalUrl = safeUrl(alternate?.match(/href=["']([^"']+)["']/i)?.[1]);
    const unique = new Map<number, Provider>();
    for (const [key, index] of Object.entries(node)) {
      if (!key.startsWith('offers(')) continue;
      const options = JSON.parse(key.slice(7, -1));
      if (options.country !== region) continue;
      const refs = read(index);
      if (!Array.isArray(refs)) continue;
      for (const ref of refs) {
        const offer = deref(ref);
        if (!record(offer) || read(offer.country) !== region || !['FLATRATE', 'FREE', 'ADS'].includes(String(read(offer.monetizationType)))) continue;
        const service = deref(offer.package);
        if (!record(service)) continue;
        const id = read(service.packageId), name = read(service.clearName), href = safeUrl(read(offer.standardWebURL));
        if (!Number.isSafeInteger(id) || Number(id) <= 0 || typeof name !== 'string' || !href) continue;
        const iconKey = Object.keys(service).find(key => key.startsWith('icon(')) || 'icon';
        const icon = read(service[iconKey]);
        const iconPath = typeof icon === 'string' ? icon.replace('{profile}', 's100').replace('{format}', 'png') : '';
        const logo_url = /^\/icon\/\d+\/s100\/[a-z0-9_-]+\.png$/i.test(iconPath) ? `https://images.justwatch.com${iconPath}` : undefined;
        unique.set(Number(id), { ...(logo_url ? { logo_url } : {}), provider_id: Number(id), provider_name: name, logo_path: null, watch_url: href });
      }
    }
    return { providers: [...unique.values()], ...(regionalUrl && new URL(regionalUrl).origin === 'https://www.justwatch.com' ? { regionalUrl } : {}) };
  } catch { return null; }
}

export type JustWatchRegions = Partial<Record<StreamingRegion, { providers: Provider[]; link: string }>>;

// One verified US seed page serves every requested country: each regional page
// is reached only through the seed's own canonical link, never a guessed slug.
// Returns null when the seed cannot be verified; a country that fails to load
// is omitted (retryable), while a loaded country without offers is data.
export async function recoverJustWatchRegions(name: string, imdbId: string, regions: readonly StreamingRegion[], kind: 'tv' | 'movie' = 'tv'): Promise<JustWatchRegions | null> {
  // The canonical slug omits AniList's remake label. The page's IMDb identity
  // is still mandatory, so this cannot inherit offers from the older adaptation.
  const slug = name.replace(/\s*\((?:19|20)\d{2}\)\s*$/u, '').replaceAll('½', '1/2')
    .normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  if (!slug || !/^tt\d+$/.test(imdbId)) return null;
  const load = async (url: string) => {
    const response = await fetch(url, { next: { revalidate: 86400, tags: ['anime-week'] }, signal: AbortSignal.timeout(7000), redirect: 'error' });
    if (!response.ok) return null;
    const html = await response.text();
    return html.length <= 2_000_000 ? html : null;
  };
  try {
    const seed = `https://www.justwatch.com/us/${kind === 'movie' ? 'movie' : 'tv-show'}/${slug}`;
    const seedHtml = await load(seed);
    if (!seedHtml || !parseJustWatchPage(seedHtml, seed, imdbId, 'US')) return null;
    const found: JustWatchRegions = {};
    // JustWatch's United Kingdom paths use /uk/, not the ISO code.
    for (const region of regions) {
      try {
        const first = parseJustWatchPage(seedHtml, seed, imdbId, region);
        if (region === 'US') { if (first) found.US = { providers: first.providers, link: seed }; continue; }
        if (!first?.regionalUrl) continue;
        const next = new URL(first.regionalUrl);
        if (next.origin !== 'https://www.justwatch.com' || next.username || next.password || !next.pathname.startsWith(`/${region === 'GB' ? 'uk' : region.toLowerCase()}/`)) continue;
        const html = await load(next.href);
        const regional = html ? parseJustWatchPage(html, next.href, imdbId, region) : null;
        if (regional) found[region] = { providers: regional.providers, link: next.href };
      } catch { /* This country stays retryable; the others are kept. */ }
    }
    return found;
  } catch { return null; }
}

export async function recoverJustWatchOffers(name: string, imdbId: string, region: StreamingRegion, kind: 'tv' | 'movie' = 'tv') {
  return (await recoverJustWatchRegions(name, imdbId, [region], kind))?.[region] ?? null;
}
