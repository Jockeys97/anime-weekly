import { expect, it } from 'vitest';
import { compactAvailability, expandAvailability, validProviderSnapshot, type ProviderSnapshot } from '../lib/provider-snapshot';
import { snapshotCatalog } from '../lib/snapshot-catalog';

it('stores supported country IDs once per title and shares provider names and logos', () => {
  const providers: ProviderSnapshot['providers'] = {};
  const netflix = { provider_id: 8, provider_name: 'Netflix', logo_path: '/netflix.png' };
  const entry = compactAvailability({ IT: { link: '', providers: [netflix, netflix] }, US: { link: '', providers: [netflix] } }, providers, 123);
  const snapshot = { titles: { 'tv:1': entry }, providers };
  expect(entry).toEqual({ countries: { IT: [8], US: [8] }, fetchedAt: 123 });
  expect(Object.keys(providers)).toEqual(['8']);
  expect(validProviderSnapshot(snapshot)).toBe(true);
  expect(expandAvailability(snapshot, 'tv:1').IT?.providers).toEqual([netflix]);
  expect(expandAvailability(snapshot, 'tv:1').US?.providers).toEqual([netflix]);
  expect(expandAvailability(snapshot, 'tv:1').JP).toBeUndefined();
  expect(expandAvailability(undefined, 'tv:1')).toEqual({});
  const catalog = snapshotCatalog({ titles: { 'tv:1': { anilistId: 21, imdbRating: '8.1', malScore: 8.25 } }, events: [], availability: snapshot });
  expect(catalog[21].availability.match).toEqual({ id: 1, kind: 'tv' });
  expect(catalog[21].availability.providers.IT?.providers[0].provider_name).toBe('Netflix');
  expect(catalog[21].ratings.imdbRating).toBe('8.1');
});

it.each([
  null, { titles: [], providers: {} },
  { titles: { 'tv:1': { countries: { US: [8] }, fetchedAt: 1 } }, providers: {} },
  { titles: { 'tv:1': { countries: { XX: [] }, fetchedAt: 1 } }, providers: {} },
  { titles: { 'tv:1': { countries: {}, fetchedAt: 'bad' } }, providers: {} },
  { titles: {}, providers: { 8: { name: 'Netflix', logo: 'https://evil.test/logo.png' } } },
])('rejects malformed provider snapshots (%j)', value => expect(validProviderSnapshot(value)).toBe(false));

it('accepts empty availability, but requires retention timestamps on cross-week entries', () => {
  const snapshot = { titles: { 'movie:1': { countries: {}, fetchedAt: 123 } }, providers: {} };
  expect(validProviderSnapshot(snapshot)).toBe(true);
  expect(validProviderSnapshot(snapshot, true)).toBe(false);
  expect(validProviderSnapshot({ ...snapshot, titles: { 'movie:1': { ...snapshot.titles['movie:1'], lastSeenAt: 124 } } }, true)).toBe(true);
});
