import { afterEach, beforeEach, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
vi.mock('next/cache', async () => import('./helpers/next-cache'));
vi.mock('../lib/anilist', async () => ({ ...(await vi.importActual<object>('../lib/anilist')), getAnime: vi.fn() }));
vi.mock('../lib/detail-availability', () => ({ getDetailProviders: vi.fn() }));
vi.mock('../lib/justwatch-recovery', () => ({ recoverJustWatchOffers: vi.fn() }));
import { getAnime } from '../lib/anilist';
import { getDetailProviders } from '../lib/detail-availability';
import { recoverJustWatchOffers } from '../lib/justwatch-recovery';
import { favoriteProviders } from '../lib/favorites-server';
beforeEach(async () => { (await import('./helpers/next-cache')).clearNextCache(); });
afterEach(() => { vi.resetAllMocks(); vi.useRealTimers(); });
const offer = (provider_id: number, provider_name: string, logo_path: string | null = `/${provider_id}.png`, watch_url?: string) => ({ provider_id, provider_name, logo_path, ...(watch_url ? { watch_url } : {}) });

it('returns up to three country platforms, collapsing reseller variants and linking like the detail page', async () => {
  vi.mocked(getAnime).mockResolvedValue({ id: 21 } as never);
  vi.mocked(getDetailProviders).mockResolvedValue({ match: { id: 37854, kind: 'tv' }, ratings: {}, providersUnavailable: false, providers: {
    IT: { link: '', providers: [offer(1968, 'Crunchyroll Amazon Channel'), offer(283, 'Crunchyroll', '/cr.png', 'https://www.crunchyroll.com/it/x'), offer(8, 'Netflix'), offer(9, 'Prime Video'), offer(1, 'No logo', null)] },
  } } as never);
  expect(await favoriteProviders(21, 'IT')).toEqual([
    { id: 283, name: 'Crunchyroll', logo: 'https://image.tmdb.org/t/p/w92/cr.png', href: 'https://www.crunchyroll.com/it/x' },
    { id: 8, name: 'Netflix', logo: 'https://image.tmdb.org/t/p/w92/8.png', href: '/api/watch?kind=tv&id=37854&region=IT&provider=8' },
    { id: 9, name: 'Prime Video', logo: 'https://image.tmdb.org/t/p/w92/9.png', href: '/api/watch?kind=tv&id=37854&region=IT&provider=9' },
  ]);
  expect(await favoriteProviders(21, 'FR')).toEqual([]);
  expect(getDetailProviders).toHaveBeenCalledTimes(1); // Cached across countries.
});
it('falls back to the parent series offers, and uses the verified page for a pinned cour', async () => {
  vi.mocked(getAnime).mockResolvedValue({ id: 195604 } as never);
  vi.mocked(getDetailProviders).mockResolvedValue({ match: null, ratings: {}, providers: {}, providersUnavailable: false, seriesWatch: { id: 73223, kind: 'tv', name: 'Black Clover', providersUnavailable: false, providers: { IT: { link: '', providers: [offer(283, 'Crunchyroll')] } } } } as never);
  expect((await favoriteProviders(195604, 'IT')).map(p => p.href)).toEqual(['/api/watch?kind=tv&id=73223&region=IT&provider=283']);
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-21T12:00:00Z'));
  vi.mocked(recoverJustWatchOffers).mockResolvedValue({ link: '', providers: [{ provider_id: 337, provider_name: 'Disney Plus', logo_path: null, logo_url: 'https://images.justwatch.com/icon/1/s100/disneyplus.png', watch_url: 'https://www.disneyplus.com/x' }] });
  expect(await favoriteProviders(185874, 'IT')).toEqual([{ id: 337, name: 'Disney Plus', logo: 'https://images.justwatch.com/icon/1/s100/disneyplus.png', href: 'https://www.disneyplus.com/x' }]);
});
