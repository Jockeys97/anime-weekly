import { afterEach, beforeEach, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
vi.mock('next/cache', async () => import('./helpers/next-cache'));
import { GET } from '../app/api/watch/route';
import { providerWatchLink, regionalWatchPage, type WatchTarget } from '../lib/watch-links';

const target: WatchTarget = { kind: 'tv', id: 13916, region: 'US', provider: 9 };
const prime = 'https://www.amazon.com/gp/video/detail/amzn1.dv.gti.example?tag=justusrsjd-20&token=published-offer-token';
function fixture({ country = 'US', imdb = 'tt0877057', provider = 9, href = prime, type = 'FLATRATE', kind = 'tv' } = {}) {
  const table: unknown[] = [];
  const ref = (value: unknown): number => {
    const index = table.length; table.push(null);
    table[index] = Array.isArray(value) ? value.map(ref) : value && typeof value === 'object'
      ? Object.fromEntries(Object.entries(value).map(([key, item]) => [key, ref(item)])) : value;
    return index;
  };
  const path = country === 'IT' ? '/it/serie-tv/death-note' : `/us/${kind === 'movie' ? 'movie' : 'tv-show'}/death-note`;
  ref({ __typename: 'Url', fullPath: path, node: { __ref: 'Show:13916' } });
  ref({ 'Show:13916': {
    [`content({"country":"${country}"})`]: { externalIds: { imdbId: imdb } },
    [`offers({"country":"${country}"})`]: [{ country, monetizationType: type, package: { packageId: provider, clearName: 'Prime Video' }, standardWebURL: href }],
  } });
  return `<link hreflang="it-IT" href="https://www.justwatch.com/it/serie-tv/death-note"><script id="__NUXT_DATA__">${JSON.stringify(table)}</script>`;
}
const request = (overrides: Partial<WatchTarget> = {}) => {
  const value = { ...target, ...overrides };
  return new Request(`https://example.test${providerWatchLink(value.kind, value.id, value.region, value.provider)}`);
};
beforeEach(async () => {
  (await import('./helpers/next-cache')).clearNextCache();
  vi.stubEnv('TMDB_API_KEY', 'fixture'); vi.stubEnv('TMDB_READ_TOKEN', '');
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
function mockSources(options: Parameters<typeof fixture>[0] = {}) {
  const fetchMock = vi.fn(async (input: URL | string) => {
    const url = new URL(input);
    if (url.hostname === 'www.themoviedb.org') return new Response('', { status: 403 });
    if (url.hostname === 'api.themoviedb.org') return Response.json({ id: 13916, name: 'Death Note', title: 'Death Note', external_ids: { imdb_id: 'tt0877057' } });
    return new Response(fixture(options), { headers: { 'content-type': 'text/html' } });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

it('recovers the exact Prime offer after TMDB blocks the page and caches the result by title/country/provider', async () => {
  const fetchMock = mockSources();
  expect((await GET(request())).headers.get('location')).toBe(prime);
  expect(fetchMock).toHaveBeenCalledTimes(3);
  expect((await GET(request())).headers.get('location')).toBe(prime);
  expect(fetchMock).toHaveBeenCalledTimes(3);
  expect(fetchMock.mock.calls[1][0]).toBeInstanceOf(URL);
  const metadataUrl = fetchMock.mock.calls[1][0] as URL;
  expect(metadataUrl.pathname).toBe('/3/tv/13916');
  expect(metadataUrl.searchParams.get('append_to_response')).toBe('external_ids');
});
it('keeps the provider and country independent instead of reusing the US Prime link', async () => {
  mockSources();
  await GET(request());
  expect((await GET(request({ provider: 8 }))).headers.get('location')).toBe(regionalWatchPage({ ...target, provider: 8 }));
  expect((await GET(request({ region: 'IT' }))).headers.get('location')).toBe(regionalWatchPage({ ...target, region: 'IT' }));
});
it('follows the verified regional path and uses only that region’s offers', async () => {
  const italyPrime = 'https://www.primevideo.com/detail/regional-title';
  const fetchMock = vi.fn(async (input: URL | string) => {
    const url = new URL(input);
    if (url.hostname === 'www.themoviedb.org') return new Response('', { status: 403 });
    if (url.hostname === 'api.themoviedb.org') return Response.json({ id: 13916, name: 'Death Note', external_ids: { imdb_id: 'tt0877057' } });
    return new Response(url.pathname.startsWith('/it/') ? fixture({ country: 'IT', href: italyPrime }) : fixture());
  });
  vi.stubGlobal('fetch', fetchMock);
  expect((await GET(request({ region: 'IT' }))).headers.get('location')).toBe(italyPrime);
  expect(fetchMock.mock.calls.at(-1)?.[0]).toBe('https://www.justwatch.com/it/serie-tv/death-note');
});
it.each([
  { imdb: 'tt999' }, { provider: 1968 }, { type: 'BUY' }, { type: 'RENT' },
  { href: 'javascript:alert(1)' }, { href: 'https://user:secret@example.test/' },
])('rejects an incorrect identity, service, offer type or unsafe destination: %j', async options => {
  mockSources(options);
  expect((await GET(request())).headers.get('location')).toBe(regionalWatchPage(target));
});
it('does not cache an empty destination after an outage', async () => {
  const fetchMock = mockSources({ imdb: 'tt999' });
  expect((await GET(request())).headers.get('location')).toBe(regionalWatchPage(target));
  mockSources();
  expect((await GET(request())).headers.get('location')).toBe(prime);
  expect(fetchMock).toHaveBeenCalledTimes(3);
});
it('rejects a metadata response for a different TMDB title without reading JustWatch', async () => {
  const fetchMock = vi.fn().mockResolvedValueOnce(new Response('', { status: 403 }))
    .mockResolvedValueOnce(Response.json({ id: 2, name: 'Death Note', external_ids: { imdb_id: 'tt0877057' } }));
  vi.stubGlobal('fetch', fetchMock);
  expect((await GET(request())).headers.get('location')).toBe(regionalWatchPage(target));
  expect(fetchMock).toHaveBeenCalledTimes(2);
});
it('uses the movie page and exact movie identity for movie requests', async () => {
  const fetchMock = mockSources({ kind: 'movie' });
  expect((await GET(request({ kind: 'movie' }))).headers.get('location')).toBe(prime);
  expect(fetchMock.mock.calls[2][0]).toBe('https://www.justwatch.com/us/movie/death-note');
});
it('fails safely without credentials or usable source pages', async () => {
  vi.stubEnv('TMDB_API_KEY', '');
  const fetchMock = mockSources();
  expect((await GET(request())).headers.get('location')).toBe(regionalWatchPage(target));
  expect(fetchMock).toHaveBeenCalledTimes(1);
  vi.stubEnv('TMDB_API_KEY', 'fixture');
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
  expect((await GET(request())).headers.get('location')).toBe(regionalWatchPage(target));
});
