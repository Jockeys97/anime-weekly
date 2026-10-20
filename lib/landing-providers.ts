import type { StreamingRegion } from '@/lib/config';
import type { Locale } from '@/lib/i18n';
import type { ProviderSnapshot, StoredAvailability } from '@/lib/provider-snapshot';

export interface LandingProvider { id: number; name: string; logo: string | null }
export interface LandingCountry { country: StreamingRegion; providers: LandingProvider[] }

export const LOCALE_REGIONS: Record<Locale, StreamingRegion[]> = { it: ['IT'], en: ['US', 'GB'], es: ['ES'], fr: ['FR'], de: ['DE'], pt: ['PT', 'BR'] };
export const LANDING_PROVIDER_LIMIT = 3;

// Channel resellers and ad tiers repeat a base service ("Crunchyroll Amazon Channel", "Netflix Standard with Ads").
const VARIANT = /\s+(?:(?:standard|basic|premium)\s+)?with\s+ads$|\s+(?:via\s+)?(?:amazon(?:\s+prime)?|apple\s+tv|roku(?:\s+premium)?|youtube|prime\s+video)\s+channels?$|\s+channel$/i;
export function providerBase(name: string): string {
  let base = name.trim(); let previous = '';
  while (previous !== base) { previous = base; base = base.replace(VARIANT, '').trim(); }
  return base.toLowerCase();
}
/** Collapse reseller/ad-tier variants onto one entry, preferring the plain base provider. */
export function dedupeProviders(providers: LandingProvider[]): LandingProvider[] {
  const byBase = new Map<string, LandingProvider>();
  for (const provider of providers) {
    const key = providerBase(provider.name); const current = byBase.get(key);
    if (!current || provider.name.length < current.name.length) byBase.set(key, current && !provider.logo ? { ...provider, logo: current.logo } : provider);
  }
  return [...byBase.values()];
}
export function landingProviders(entry: StoredAvailability | undefined, table: ProviderSnapshot['providers'] | undefined, locale: Locale): { primary: LandingCountry | null; others: LandingCountry[] } {
  const countries = (Object.entries(entry?.countries ?? {}) as [StreamingRegion, number[]][]).map(([country, ids]) => ({
    country,
    providers: dedupeProviders(ids.flatMap(id => { const p = table?.[id]; return p ? [{ id, name: p.name, logo: p.logo }] : []; })),
  })).filter(item => item.providers.length);
  const primaryCountry = LOCALE_REGIONS[locale].find(region => countries.some(item => item.country === region));
  const primary = countries.find(item => item.country === primaryCountry) ?? null;
  return { primary: primary && { ...primary, providers: primary.providers.slice(0, LANDING_PROVIDER_LIMIT) }, others: countries.filter(item => item !== primary) };
}
