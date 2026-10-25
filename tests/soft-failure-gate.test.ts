import { afterEach, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { animeUnavailableResponse, clearAnimeUnavailable, isAnimeUnavailable, markAnimeUnavailable, SOFT_FAILURE_GATE_TTL } from '@/lib/soft-failure-gate';
import { SOFT_FAILURE_REVALIDATE, softLookup } from '@/lib/soft-failure';
afterEach(async () => { vi.restoreAllMocks(); await clearAnimeUnavailable(77); await clearAnimeUnavailable(78); });

it('outlives the 60s soft ISR copy so it is not served while AniList still fails', () => {
  expect(SOFT_FAILURE_GATE_TTL).toBeGreaterThan(SOFT_FAILURE_REVALIDATE);
});
it('marks and reads a transient failure per anime', async () => {
  expect(await isAnimeUnavailable(77)).toBe(false);
  await markAnimeUnavailable(77);
  expect(await isAnimeUnavailable(77)).toBe(true);
  expect(await isAnimeUnavailable(78)).toBe(false);
});
it('marks the anime when softLookup absorbs a transient failure, not on success or confirmed not-found', async () => {
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  vi.stubGlobal('fetch', vi.fn(async () => new Response('')));
  expect(await softLookup(async () => null, { id: 78 })).toBeNull();
  expect(await isAnimeUnavailable(78)).toBe(false);
  expect(await softLookup(async () => { throw new Error('AniList HTTP 429'); }, { id: 77 })).toBeUndefined();
  expect(await isAnimeUnavailable(77)).toBe(true);
  vi.unstubAllGlobals();
});
it('fails open when the gate read is slow', async () => {
  expect(await isAnimeUnavailable(77, 0)).toBe(false);
});
it('returns an uncached 503 with Retry-After and without noindex', async () => {
  const response = animeUnavailableResponse();
  expect(response.status).toBe(503);
  expect(response.headers.get('Retry-After')).toBe('120');
  expect(response.headers.get('Cache-Control')).toBe('no-store');
  expect(await response.text()).not.toContain('noindex');
});
