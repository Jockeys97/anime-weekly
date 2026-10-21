vi.mock('../lib/anime-localized-titles', () => ({ getAnimeLocalizedTitles: async () => ({}) }));
vi.mock('../lib/weekly-seo-data', () => ({ getSeoWeek: vi.fn().mockResolvedValue(null), getSeoWeeks: vi.fn().mockResolvedValue([]), getAnimeWeekAppearances: async () => [] }));
import { afterEach, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
vi.mock('../lib/week-archive', () => ({ listArchivedWeeks: async () => [] }));
vi.mock('next/cache', () => ({ unstable_cache: (fn: unknown) => fn }));
vi.mock('../lib/anilist', () => ({ getSeason: vi.fn() }));
vi.mock('@vercel/blob', () => ({ get: vi.fn(), put: vi.fn() }));
vi.mock('../components/WeeklyGuide', () => ({ WeeklyGuide: () => null }));
import config from '../next.config';
import { siteUrl, pageMetadata } from '../lib/seo';
import sitemap from '../app/sitemaps/sitemap';
import robots from '../app/robots';
import { getSeason } from '../lib/anilist';
afterEach(() => { vi.unstubAllEnvs(); vi.resetAllMocks(); vi.useRealTimers(); });

it('defaults production SEO to weeklyanime.com regardless of the Vercel API host', async () => {
  vi.stubEnv('NODE_ENV', 'production'); vi.stubEnv('NEXT_PUBLIC_SITE_URL', '');
  vi.stubEnv('VERCEL_PROJECT_PRODUCTION_URL', 'anime-weekly.vercel.app');
  expect(siteUrl().href).toBe('https://weeklyanime.com/');
  vi.mocked(getSeason).mockResolvedValue({ media: [], pageInfo: { currentPage: 1, hasNextPage: false } });
  expect((await sitemap({ id: Promise.resolve('pages') })).every(entry => entry.url.startsWith('https://weeklyanime.com/'))).toBe(true);
  expect(robots().sitemap).toContain('https://weeklyanime.com/sitemap.xml');
  for (const path of ['/', '/week/2026-42', '/season', '/season/2026/fall?page=2', '/search?q=Ranma', '/anime/21', '/piattaforma', '/piattaforma/netflix/it', '/my-anime']) {
    const metadata = pageMetadata('Title', 'Description', path);
    expect(metadata.alternates).toMatchObject({ canonical: `https://weeklyanime.com${path}` });
    expect(metadata.openGraph).toMatchObject({ url: `https://weeklyanime.com${path}` });
  }
});

it('gives pages without their own image the localized weekly share card', () => {
  vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://weeklyanime.com');
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-20T12:00:00Z'));
  const home = pageMetadata('Title', 'Description', '/');
  expect(home.openGraph).toMatchObject({ images: [{ url: 'https://weeklyanime.com/week/2026-43/opengraph-image', alt: 'Title' }] });
  expect(home.twitter).toMatchObject({ card: 'summary_large_image', images: ['https://weeklyanime.com/week/2026-43/opengraph-image'] });
  expect(pageMetadata('T', 'D', '/this-week', undefined, 'es').openGraph).toMatchObject({ images: [{ url: 'https://weeklyanime.com/es/week/2026-43/opengraph-image' }] });
  const cover = 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx21.jpg';
  expect(pageMetadata('T', 'D', '/anime/21', cover).openGraph).toMatchObject({ images: [{ url: cover }] });
});

it('redirects only legacy app hosts permanently while preserving paths and query forwarding', async () => {
  const previous = process.env.VERCEL_ENV;
  process.env.VERCEL_ENV = 'preview';
  expect((await config.redirects!()).filter(rule => rule.destination.startsWith('https://weeklyanime.com'))).toHaveLength(0);
  process.env.VERCEL_ENV = 'production';
  const redirects = await config.redirects!();
  if (previous === undefined) delete process.env.VERCEL_ENV; else process.env.VERCEL_ENV = previous;
  const canonical = redirects.filter(rule => rule.destination.startsWith('https://weeklyanime.com'));
  expect(canonical).toHaveLength(2);
  for (const rule of canonical) {
    expect(rule).toMatchObject({ source: '/:path((?!api/).*)', destination: 'https://weeklyanime.com/:path*', permanent: true });
    expect(rule.has).toHaveLength(1);
    expect(rule.has![0].type).toBe('host');
    expect(rule.destination).not.toContain('?'); // Next forwards the incoming query.
  }
  const matches = (host: string) => canonical.some(rule => new RegExp(`^(?:${rule.has![0].value})$`).test(host));
  for (const host of ['anime-weekly.vercel.app', 'anime-weekly-abc123.vercel.app', 'anime-weekly-git-feature-team.vercel.app']) expect(matches(host)).toBe(true);
  for (const host of ['weeklyanime.com', 'other.vercel.app', 'anime-weeklyXvercelXapp', 'anime-weekly.vercel.app.evil.test', 'anime-weekly-.vercel.app']) expect(matches(host)).toBe(false);
  const path = /^\/((?!api\/).*)$/;
  for (const url of ['/api/revalidate', '/api/revalidate?ratings=2026-42', '/api/auth/trakt/callback', '/api/auth/mal/callback', '/api/imdb']) expect(path.test(url)).toBe(false);
  for (const url of ['/', '/week/2026-42', '/search?q=Ranma', '/anime/21']) expect(path.test(url)).toBe(true);
  expect(redirects).toContainEqual({ source: '/favicon.ico', destination: '/icon.svg', permanent: false });
});

it('sets separate absolute canonicals for the home and ISR week routes', async () => {
  vi.stubEnv('NODE_ENV', 'production'); vi.stubEnv('NEXT_PUBLIC_SITE_URL', '');
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-19T12:00:00Z'));
  const home = await import('../app/[locale]/page');
  const week = await import('../app/[locale]/week/[week]/page');
  expect((await home.generateMetadata({})).alternates?.canonical).toBe('https://weeklyanime.com/');
  expect((await week.generateMetadata({ params: Promise.resolve({ week: '2026-42' }) })).alternates?.canonical).toBe('https://weeklyanime.com/week/2026-42');
  expect((await week.generateMetadata({ params: Promise.resolve({ week: '2026-43' }) })).openGraph).toMatchObject({ url: 'https://weeklyanime.com/week/2026-43' });
  const current = await week.generateMetadata({ params: Promise.resolve({ week: '2026-43' }) });
  expect(current.alternates?.canonical).toBe('https://weeklyanime.com/week/2026-43');
  expect(current.title).toBe('Anime 19–25 ottobre 2026 · settimana 43');
  expect(current.description).toContain('19–25 ottobre 2026');
  expect(home.dynamic).toBe('error'); expect(week.dynamic).toBe('error');
});
