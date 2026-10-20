import { describe, expect, it } from 'vitest';
import { dedupeProviders, landingProviders, providerBase } from '../lib/landing-providers';

const table = { 1: { name: 'Crunchyroll', logo: '/c.png' }, 2: { name: 'Crunchyroll Amazon Channel', logo: null }, 3: { name: 'Netflix', logo: null }, 4: { name: 'Netflix Standard with Ads', logo: null }, 5: { name: 'Disney Plus', logo: null }, 6: { name: 'Prime Video', logo: null }, 7: { name: 'HIDIVE Apple TV Channel', logo: null } };
const entry = { fetchedAt: 0, countries: { IT: [1, 2, 3, 4, 5, 6], GB: [7], US: [3], JP: [99] } };

describe('landing providers', () => {
  it('normalises reseller and ad-tier variants', () => {
    expect(providerBase('Crunchyroll Amazon Channel')).toBe('crunchyroll');
    expect(providerBase('Netflix Standard with Ads')).toBe('netflix');
    expect(providerBase('HIDIVE Apple TV Channel')).toBe('hidive');
    expect(providerBase('Prime Video')).toBe('prime video');
  });
  it('keeps the base provider and a variant only when the base is missing', () => {
    expect(dedupeProviders([{ id: 2, name: 'Crunchyroll Amazon Channel', logo: null }, { id: 1, name: 'Crunchyroll', logo: '/c.png' }]).map(p => p.name)).toEqual(['Crunchyroll']);
    expect(dedupeProviders([{ id: 7, name: 'HIDIVE Apple TV Channel', logo: null }]).map(p => p.name)).toEqual(['HIDIVE Apple TV Channel']);
  });
  it('shows max three deduped providers for the locale region and moves others aside', () => {
    const it = landingProviders(entry, table, 'it');
    expect(it.primary).toEqual({ country: 'IT', providers: [{ id: 1, name: 'Crunchyroll', logo: '/c.png' }, { id: 3, name: 'Netflix', logo: null }, { id: 5, name: 'Disney Plus', logo: null }] });
    expect(it.others.map(o => o.country)).toEqual(['GB', 'US']);
  });
  it('falls back through locale regions and handles missing data', () => {
    expect(landingProviders({ fetchedAt: 0, countries: { GB: [3] } }, table, 'en').primary?.country).toBe('GB');
    expect(landingProviders(entry, table, 'pt').primary).toBeNull();
    expect(landingProviders(undefined, undefined, 'de')).toEqual({ primary: null, others: [] });
  });
});
