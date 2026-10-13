import { afterEach, describe, expect, it, vi } from 'vitest';
import { findProviderOffer, parseWatchTarget, providerWatchLink, regionalWatchPage, type WatchTarget } from '../lib/watch-links';
import { GET } from '../app/api/watch/route';

const target: WatchTarget = { kind: 'tv', id: 45790, region: 'IT', provider: 8 };
function offer({ provider = 8, country = 'it', type = 'flatrate', destination = 'https://www.netflix.com/title/80179831' } = {}) {
  const cx = Buffer.from(JSON.stringify({ data: [{ schema: 'iglu:com.justwatch/clickout_context/jsonschema/1-3-2', data: { providerId: provider, monetizationType: type } }] })).toString('base64url');
  return `https://click.justwatch.com/a?${new URLSearchParams({ cx, r: destination, uct_country: country })}`;
}
const anchor = (href: string) => `<a class="relative" href="${href.replaceAll('&', '&amp;')}">Watch</a>`;
afterEach(() => vi.unstubAllGlobals());

describe('country and provider offer selection', () => {
  it('selects the exact provider in the displayed country and preserves its click-out', () => {
    const desired = offer();
    expect(findProviderOffer(anchor(offer({ country: 'us' })) + anchor(offer({ provider: 283 })) + anchor(desired), target)).toBe(desired);
  });
  it('accepts Spain and retains the Spanish offer country', () => {
    const spanish = { ...target, region: 'ES' as const };
    expect(parseWatchTarget(new URL(providerWatchLink('tv', 45790, 'ES', 8), 'https://example.com').searchParams)).toEqual(spanish);
    expect(findProviderOffer(anchor(offer({ country: 'es' })), spanish)).toBe(offer({ country: 'es' }));
    expect(findProviderOffer(anchor(offer({ country: 'it' })), spanish)).toBeNull();
  });
  it.each(['flatrate', 'free', 'ads'])('accepts %s streaming offers', type => {
    expect(findProviderOffer(anchor(offer({ type })), target)).toBe(offer({ type }));
  });
  it.each(['rent', 'buy', 'other'])('never substitutes %s offers', type => {
    expect(findProviderOffer(anchor(offer({ type })), target)).toBeNull();
  });
  it('rejects wrong countries, providers, unsafe links and malformed metadata', () => {
    for (const href of [offer({ country: 'us' }), offer({ provider: 9 }), offer({ destination: 'javascript:alert(1)' }), offer().replace('click.justwatch.com', 'click.justwatch.com.evil.test'), 'https://click.justwatch.com/a?cx=invalid&uct_country=it', 'https://www.netflix.com/title/123']) {
      expect(findProviderOffer(anchor(href), target)).toBeNull();
    }
    expect(findProviderOffer('<html>No offers</html>', target)).toBeNull();
  });
  it('generates regional links and validates parameters', () => {
    const link = providerWatchLink('tv', 45790, 'IT', 8);
    expect(parseWatchTarget(new URL(link, 'https://example.com').searchParams)).toEqual(target);
    expect(regionalWatchPage(target)).toBe('https://www.themoviedb.org/tv/45790/watch?locale=IT');
    expect(regionalWatchPage({ ...target, kind: 'movie', region: 'JP' })).toBe('https://www.themoviedb.org/movie/45790/watch?locale=JP');
    for (const param of ['kind=other&id=1&region=IT&provider=8', 'kind=tv&id=-1&region=IT&provider=8', 'kind=tv&id=1&region=XX&provider=8', 'kind=tv&id=1&region=IT&provider=0', 'kind=tv&id=1&region=IT&provider=1.5', 'kind=tv&id=9007199254740992&region=IT&provider=8']) expect(parseWatchTarget(new URLSearchParams(param))).toBeNull();
  });
});

describe('streaming redirect route', () => {
  const request = () => new Request(`https://example.com${providerWatchLink('tv', 45790, 'IT', 8)}`);
  it('redirects to the source offer with bounded, tagged fetch caching', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(anchor(offer()), { headers: { 'content-type': 'text/html; charset=utf-8' } }));
    vi.stubGlobal('fetch', fetchMock);
    const response = await GET(request());
    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(offer());
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(fetchMock).toHaveBeenCalledWith(regionalWatchPage(target), expect.objectContaining({ cache: 'force-cache', next: { revalidate: 604800, tags: ['anime-week'] }, redirect: 'error' }));
  });
  it.each(['blocked', 'offline', 'no-match', 'wrong-content'])('falls back to the same title and country on %s', async scenario => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      if (scenario === 'offline') throw new Error('offline');
      if (scenario === 'blocked') return new Response('', { status: 403 });
      return new Response(scenario === 'no-match' ? anchor(offer({ country: 'us' })) : '{}', { headers: { 'content-type': scenario === 'wrong-content' ? 'application/json' : 'text/html' } });
    }));
    expect((await GET(request())).headers.get('location')).toBe(regionalWatchPage(target));
  });
  it('rejects invalid parameters without fetching or redirecting', async () => {
    const fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock);
    const response = await GET(new Request('https://example.com/api/watch?url=https://evil.test'));
    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
