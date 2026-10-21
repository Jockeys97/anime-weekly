import React from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('not-found'); } }));
vi.mock('../lib/weekly-seo-data', () => ({ getSeoWeek: vi.fn() }));
import { getSeoWeek } from '../lib/weekly-seo-data';
import { getRankingsWeek } from '../lib/rankings-seo-data';
import RankingsPage, { generateMetadata } from '../app/[locale]/rankings/[week]/page';
import { generateMetadata as weekMetadata } from '../app/[locale]/week/[week]/page';
import { localePath } from '../lib/locale-routing';
import { formatWeek, isoWeek } from '../lib/week';
const data = { week: '2026-42', titles: [], rankings: { imdb: [{ anilistId: 21, anime: { name: 'Real anime' }, score: 8.5, votes: 1234 }], mal: [] } } as unknown as NonNullable<Awaited<ReturnType<typeof getSeoWeek>>>;
beforeEach(() => { vi.stubGlobal('React', React); vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://weeklyanime.com'); vi.mocked(getSeoWeek).mockResolvedValue(data); });
afterEach(() => { vi.resetAllMocks(); vi.useRealTimers(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
it.each(['it', 'en', 'es', 'fr', 'de', 'pt'] as const)('declares localized canonical, hreflang and dedicated OG in %s', async locale => {
  const params = Promise.resolve({ week: '2026-42', locale });
  const meta = await generateMetadata({ params });
  expect(meta.alternates?.canonical).toBe(`https://weeklyanime.com${localePath('/rankings/2026-42', locale)}`);
  expect(Object.keys(meta.alternates!.languages!)).toHaveLength(7);
  expect(meta.openGraph).toMatchObject({ images: [{ url: localePath('/rankings/2026-42/opengraph-image', locale) }] });
  expect(meta.title).toContain('2026-42');
  expect(React.isValidElement(await RankingsPage({ params }))).toBe(true);
});
it('keeps the localized this-week alias canonical to itself', async () => {
  const meta = await generateMetadata({ params: Promise.resolve({ week: 'this-week', locale: 'it' }) });
  expect(getSeoWeek).toHaveBeenCalledWith(formatWeek(isoWeek(new Date())));
  expect(meta.alternates?.canonical).toBe('https://weeklyanime.com/rankings/questa-settimana');
  expect(meta.alternates?.languages).toMatchObject({ en: 'https://weeklyanime.com/en/rankings/this-week', fr: 'https://weeklyanime.com/fr/rankings/cette-semaine' });
  expect(getSeoWeek).toHaveBeenCalledTimes(1);
});
it('falls back to the latest populated ranking for HTML, metadata and OG', async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-21T12:00:00Z'));
  vi.mocked(getSeoWeek).mockImplementation(async slug => slug === data.week ? data : null);
  const props = { params: Promise.resolve({ week: 'this-week', locale: 'en' }) };
  const meta = await generateMetadata(props);
  const page = await RankingsPage(props);
  expect(meta.title).toContain('2026-42');
  expect(page.props.children[1].props.children).toContain('2026-42');
  expect(meta.alternates?.canonical).toBe('https://weeklyanime.com/en/rankings/this-week');
  expect(meta.openGraph).toMatchObject({ url: meta.alternates?.canonical, images: [{ url: '/en/rankings/this-week/opengraph-image' }] });
  const { default: Image } = await import('../app/[locale]/rankings/[week]/opengraph-image');
  const response = await Image(props);
  expect(response.headers.get('content-type')).toContain('image/png');
  await response.arrayBuffer();
  expect(vi.mocked(getSeoWeek).mock.calls.map(([slug]) => slug)).toEqual(Array(3).fill(['2026-43', '2026-42']).flat());
});
it('skips empty rankings, crosses ISO years and limits fallback to four preceding weeks', async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2027-01-05T12:00:00Z'));
  vi.mocked(getSeoWeek).mockImplementation(async slug => slug === '2026-50'
    ? { ...data, week: slug } : { ...data, week: slug, rankings: { imdb: [], mal: [] } });
  expect((await getRankingsWeek('this-week'))?.week).toBe('2026-50');
  expect(vi.mocked(getSeoWeek).mock.calls.map(([slug]) => slug)).toEqual(['2027-01', '2026-53', '2026-52', '2026-51', '2026-50']);
  vi.mocked(getSeoWeek).mockClear().mockResolvedValue(null);
  const props = { params: Promise.resolve({ week: 'this-week' }) };
  await expect(RankingsPage(props)).rejects.toThrow('not-found');
  expect(getSeoWeek).toHaveBeenCalledTimes(5);
});
it('returns notFound for absent data or a week without qualifying rankings', async () => {
  for (const value of [null, { ...data, rankings: { imdb: [], mal: [] } }]) {
    vi.mocked(getSeoWeek).mockResolvedValue(value);
    const props = { params: Promise.resolve({ week: '2099-01' }) };
    await expect(RankingsPage(props)).rejects.toThrow('not-found');
    await expect(generateMetadata(props)).rejects.toThrow('not-found');
    const { default: Image } = await import('../app/[locale]/rankings/[week]/opengraph-image');
    await expect(Image(props)).rejects.toThrow('not-found');
  }
  expect(vi.mocked(getSeoWeek).mock.calls.every(([slug]) => slug === '2099-01')).toBe(true);
});
it('sets noindex on weekly pages without data and leaves populated weeks indexable', async () => {
  vi.mocked(getSeoWeek).mockResolvedValue(null);
  expect((await weekMetadata({ params: Promise.resolve({ week: '2099-01' }) })).robots).toEqual({ index: false, follow: true });
  vi.mocked(getSeoWeek).mockResolvedValue(data);
  expect((await weekMetadata({ params: Promise.resolve({ week: '2026-42' }) })).robots).toBeUndefined();
});

it('emits ordered ItemLists with detail URLs and renders the OG PNG from the same entries', async () => {
  const page = await RankingsPage({ params: Promise.resolve({ week: '2026-42', locale: 'en' }) });
  const sections = page.props.children.at(-1);
  const list = sections[0].props.children[1].props.data;
  expect(list).toMatchObject({ '@type': 'ItemList', itemListElement: [{ position: 1, name: 'Real anime', url: 'https://weeklyanime.com/en/anime/21-real-anime' }] });
  const { default: Image } = await import('../app/[locale]/rankings/[week]/opengraph-image');
  const response = await Image({ params: Promise.resolve({ week: '2026-42', locale: 'en' }) });
  const png = new Uint8Array(await response.arrayBuffer());
  expect([...png.slice(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
});
