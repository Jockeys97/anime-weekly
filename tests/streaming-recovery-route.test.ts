import { afterEach, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
vi.mock('../lib/anilist', () => ({ getAnime: vi.fn(), animeName: () => 'Black Clover Season 2' }));
vi.mock('../lib/detail-availability', () => ({ getCachedDetailAvailability: vi.fn() }));
vi.mock('../lib/justwatch-recovery', () => ({ recoverJustWatchOffers: vi.fn() }));
import { getAnime } from '../lib/anilist';
import { getCachedDetailAvailability } from '../lib/detail-availability';
import { recoverJustWatchOffers } from '../lib/justwatch-recovery';
import { GET } from '../app/api/streaming-recovery/route';
afterEach(() => vi.resetAllMocks());
it('recovers original-series regional offers without claiming exact-season coverage', async () => {
  vi.mocked(getAnime).mockResolvedValue({ id: 195604 } as Awaited<ReturnType<typeof getAnime>>);
  vi.mocked(getCachedDetailAvailability).mockResolvedValue({ match: null, ratings: { imdbId: 'tt7441658' }, providers: {}, providersUnavailable: false, seriesWatch: { id: 73223, kind: 'tv', name: 'Black Clover', providers: {}, providersUnavailable: false } });
  vi.mocked(recoverJustWatchOffers).mockResolvedValue({ link: 'https://www.justwatch.com/it/serie-tv/black-clover', providers: [{ provider_id: 8, provider_name: 'Netflix', logo_path: null, watch_url: 'https://www.netflix.com/title/80238012' }] });
  const response = await GET(new Request('https://example.com/api/streaming-recovery?anime=195604&region=IT'));
  expect(recoverJustWatchOffers).toHaveBeenCalledWith('Black Clover','tt7441658','IT');
  expect(await response.json()).toMatchObject({ id: 73223, name: 'Black Clover', series: true, providers: { IT: { providers: [{ provider_name: 'Netflix' }] } } });
});
it.each(['region=XX&anime=195604','region=IT&anime=-1','region=IT&anime=not-a-number'])('rejects unsupported targets %s', async query => {
  expect((await GET(new Request('https://example.com/api/streaming-recovery?'+query))).status).toBe(400);
  expect(getAnime).not.toHaveBeenCalled();
});
it('does not guess title identity when IMDb and the series match are absent', async () => {
  vi.mocked(getAnime).mockResolvedValue({ id: 195604 } as Awaited<ReturnType<typeof getAnime>>);
  vi.mocked(getCachedDetailAvailability).mockResolvedValue({ match: null, ratings: {}, providers: {}, providersUnavailable: false });
  const response = await GET(new Request('https://example.com/api/streaming-recovery?anime=195604&region=IT'));
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(recoverJustWatchOffers).not.toHaveBeenCalled();
});
it('answers a pinned airing cour from its own verified page, and stops after it expires', async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  try {
    vi.setSystemTime(new Date('2026-10-20T12:00:00Z'));
    vi.mocked(recoverJustWatchOffers).mockResolvedValue({ link: 'https://www.justwatch.com/it/serie-tv/bleach-thousand-year-blood-war', providers: [{ provider_id: 337, provider_name: 'Disney Plus', logo_path: null, watch_url: 'https://www.disneyplus.com/browse/entity-571475d5' }] });
    const response = await GET(new Request('https://example.com/api/streaming-recovery?anime=185874&region=IT'));
    expect(recoverJustWatchOffers).toHaveBeenCalledWith('Bleach: Thousand-Year Blood War', 'tt14986406', 'IT');
    expect(getAnime).not.toHaveBeenCalled();
    expect(await response.json()).toMatchObject({ id: 30984, kind: 'tv', series: false, providers: { IT: { providers: [{ provider_name: 'Disney Plus' }] } } });
    vi.mocked(recoverJustWatchOffers).mockClear();
    vi.setSystemTime(new Date('2026-11-03T00:00:00Z'));
    vi.mocked(getAnime).mockResolvedValue(null);
    expect((await GET(new Request('https://example.com/api/streaming-recovery?anime=185874&region=IT'))).status).toBe(404);
    expect(recoverJustWatchOffers).not.toHaveBeenCalled();
  } finally { vi.useRealTimers(); }
});
