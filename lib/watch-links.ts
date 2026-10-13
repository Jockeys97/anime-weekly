import { STREAMING_REGIONS, type StreamingRegion } from '@/lib/config';

export interface WatchTarget { kind: 'tv' | 'movie'; id: number; region: StreamingRegion; provider: number }
export function parseWatchTarget(params: URLSearchParams): WatchTarget | null {
  const kind = params.get('kind');
  const region = params.get('region');
  const idText = params.get('id') || '';
  const providerText = params.get('provider') || '';
  const id = Number(idText), provider = Number(providerText);
  if ((kind !== 'tv' && kind !== 'movie') || !STREAMING_REGIONS.includes(region as StreamingRegion)
    || !/^[1-9]\d*$/.test(idText) || !/^[1-9]\d*$/.test(providerText)
    || !Number.isSafeInteger(id) || !Number.isSafeInteger(provider)) return null;
  return { kind, id, region: region as StreamingRegion, provider };
}
export function regionalWatchPage(target: WatchTarget): string {
  return `https://www.themoviedb.org/${target.kind}/${target.id}/watch?locale=${target.region}`;
}
export function providerWatchLink(kind: WatchTarget['kind'], id: number, region: StreamingRegion, provider: number): string {
  return `/api/watch?${new URLSearchParams({ kind, id: String(id), region, provider: String(provider) })}`;
}

// TMDB's API has availability but no provider deep links. Its public watch page
// publishes JustWatch click-outs containing the provider ID and country.
// Preserve the original click-out (and attribution) rather than guessing URLs.
export function findProviderOffer(html: string, target: WatchTarget): string | null {
  for (const match of html.matchAll(/<a\b[^>]*\bhref\s*=\s*["']([^"']+)["']/gi)) {
    try {
      const href = match[1].replace(/&amp;|&#0*38;|&#x0*26;/gi, '&');
      const url = new URL(href);
      if (url.origin !== 'https://click.justwatch.com' || url.pathname !== '/a' || url.username || url.password
        || url.searchParams.get('uct_country')?.toUpperCase() !== target.region) continue;
      const destination = new URL(url.searchParams.get('r') || '');
      if (destination.protocol !== 'https:' || destination.username || destination.password) continue;
      const context = url.searchParams.get('cx');
      if (!context || context.length > 16000) continue;
      const decoded = JSON.parse(Buffer.from(context, 'base64url').toString('utf8')) as {
        data?: { schema?: string; data?: { providerId?: number; monetizationType?: string } }[];
      };
      if (!Array.isArray(decoded.data)) continue;
      const offer = decoded.data.find(item => item?.schema?.startsWith('iglu:com.justwatch/clickout_context/'))?.data;
      if (offer?.providerId === target.provider && ['flatrate', 'free', 'ads'].includes(offer.monetizationType || '')) return url.href;
    } catch { /* Invalid or changed upstream markup falls back to the regional watch page. */ }
  }
  return null;
}
