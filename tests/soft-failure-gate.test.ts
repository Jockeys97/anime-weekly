import { afterEach, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { animeUnavailableResponse, clearAnimeUnavailable, isAnimeUnavailable, markAnimeUnavailable } from '@/lib/soft-failure-gate';
import { softFailureMetadata, softLookup } from '@/lib/soft-failure';
afterEach(async () => { vi.restoreAllMocks(); await clearAnimeUnavailable(77); await clearAnimeUnavailable(78); });

it('marks and reads a transient failure per anime', async () => {
  expect(await isAnimeUnavailable(77)).toBe(false);
  await markAnimeUnavailable(77);
  expect(await isAnimeUnavailable(77)).toBe(true);
  expect(await isAnimeUnavailable(78)).toBe(false);
});
it('rejects transient renders without masking a previous successful ISR page', async () => {
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  vi.stubGlobal('fetch', vi.fn(async () => new Response('')));
  expect(await softLookup(async () => null, { id: 78 })).toBeNull();
  expect(await isAnimeUnavailable(78)).toBe(false);
  await expect(softLookup(async () => { throw new Error('AniList HTTP 429'); }, { id: 77 })).rejects.toThrow('AniList HTTP 429');
  // Marked so the proxy can 503 a URL with no cached copy (it probes first).
  expect(await isAnimeUnavailable(77)).toBe(true);
  vi.unstubAllGlobals();
});
it('fails open when the gate read is slow', async () => {
  expect(await isAnimeUnavailable(77, 0)).toBe(false);
});
it('returns an uncached 503 with Retry-After and noindex', async () => {
  const response = animeUnavailableResponse();
  expect(response.status).toBe(503);
  expect(response.headers.get('Retry-After')).toBe('120');
  expect(response.headers.get('Cache-Control')).toBe('no-store');
  const html = await response.text();
  expect(html).toContain('noindex');
  expect(html).toContain('<title>Temporarily unavailable · Weekly Anime</title>');
  expect(html).not.toContain('og:url');
});

it('clears inherited homepage canonical and social metadata', () => {
  const meta = softFailureMetadata('Something interrupted the guide');
  expect(meta.title).toEqual({ absolute: 'Temporarily unavailable · Weekly Anime' });
  expect(meta.alternates).toBeNull();
  expect(meta.openGraph).not.toHaveProperty('url');
  expect(meta.robots).toEqual({ index: false, follow: true });
});
