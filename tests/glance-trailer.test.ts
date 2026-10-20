import { afterEach, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
vi.mock('../lib/anilist', () => ({ getAnime: vi.fn() }));
import { getAnime } from '../lib/anilist';
import { previewBox } from '../components/GlanceTrailer';
import { trailerPreview } from '../lib/trailer';
import { GET } from '../app/api/anime-trailer/[id]/route';
afterEach(() => vi.resetAllMocks());
const call = (id: string) => GET(new Request(`https://example.com/api/anime-trailer/${id}`), { params: Promise.resolve({ id }) });

it('builds muted, chrome-less preview embeds only for validated trailer IDs', () => {
  expect(trailerPreview({ site: 'youtube', id: 'dQw4w9WgXcQ' })).toBe('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?autoplay=1&mute=1&controls=0&playsinline=1&rel=0&modestbranding=1&disablekb=1');
  expect(trailerPreview({ site: 'dailymotion', id: 'x8abc12' })).toContain('mute=1');
  expect(trailerPreview({ site: 'youtube', id: 'bad"id' })).toBeNull();
  expect(trailerPreview(null)).toBeNull();
  expect(trailerPreview({ site: 'youtube', id: 'dQw4w9WgXcQ' }, false)).toContain('&mute=0&');
});
it('centres the 16:9 box on the poster and keeps it inside the viewport', () => {
  expect(previewBox({ left: 500, top: 300, width: 200, height: 300 }, { width: 1400, height: 900 })).toEqual({ left: 408, top: 342, width: 384, height: 216 });
  expect(previewBox({ left: 0, top: 0, width: 200, height: 300 }, { width: 1400, height: 900 })).toMatchObject({ left: 8, top: 42 });
  expect(previewBox({ left: 1300, top: 800, width: 100, height: 150 }, { width: 1400, height: 900 })).toMatchObject({ left: 1008, top: 676 });
});
it('serves only the trailer, cached at the edge, and rejects invalid IDs', async () => {
  vi.mocked(getAnime).mockResolvedValue({ id: 185874, trailer: { site: 'youtube', id: 'dQw4w9WgXcQ' } } as Awaited<ReturnType<typeof getAnime>>);
  const ok = await call('185874');
  expect(await ok.json()).toEqual({ preview: expect.stringContaining('mute=1'), sound: expect.stringContaining('mute=0'), watch: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' });
  expect(ok.headers.get('cache-control')).toContain('s-maxage=86400');
  vi.mocked(getAnime).mockResolvedValue({ id: 1, trailer: null } as Awaited<ReturnType<typeof getAnime>>);
  expect(await (await call('1')).json()).toEqual({});
  vi.mocked(getAnime).mockResolvedValue(null);
  expect((await call('2')).headers.get('cache-control')).toBe('no-store');
  expect((await call('0')).status).toBe(400);
  expect((await call('abc')).status).toBe(400);
});
