import { getDictionary } from '@/lib/i18n';
import type { Locale } from '@/lib/locales';
// TMDB's standalone subscription providers (not Amazon Channels variants).
export const PLATFORM_PROVIDERS = {
  netflix: { id: 8, name: 'Netflix' },
  crunchyroll: { id: 283, name: 'Crunchyroll' },
  'prime-video': { id: 119, name: 'Prime Video' },
  'disney-plus': { id: 337, name: 'Disney+' },
  'apple-tv': { id: 350, name: 'Apple TV+' },
  max: { id: 1899, name: 'Max' },
} as const;
export const PLATFORM_COUNTRIES = {
  it: { region: 'IT', name: 'Italia' }, us: { region: 'US', name: 'Stati Uniti' },
  gb: { region: 'GB', name: 'Regno Unito' }, fr: { region: 'FR', name: 'Francia' },
  de: { region: 'DE', name: 'Germania' }, jp: { region: 'JP', name: 'Giappone' }, es: { region: 'ES', name: 'Spagna' },
} as const;
export type PlatformProvider = keyof typeof PLATFORM_PROVIDERS;
export type PlatformCountry = keyof typeof PLATFORM_COUNTRIES;
export function platformMapping(provider: string, country: string) {
  if (!Object.hasOwn(PLATFORM_PROVIDERS, provider) || !Object.hasOwn(PLATFORM_COUNTRIES, country)) return null;
  return { provider: PLATFORM_PROVIDERS[provider as PlatformProvider], country: PLATFORM_COUNTRIES[country as PlatformCountry] };
}
export function platformPaths(): string[] {
  return Object.keys(PLATFORM_PROVIDERS).flatMap(provider => Object.keys(PLATFORM_COUNTRIES).map(country => `/piattaforma/${provider}/${country}`));
}
export function platformTitle(provider: string, country: string, locale: Locale = 'it'): string | null {
  const mapping = platformMapping(provider, country);
  const d = getDictionary(locale);
  return mapping ? d.seo.platformTitle.replace('{provider}', mapping.provider.name).replace('{country}', d.regions[mapping.country.region as keyof typeof d.regions]) : null;
}
