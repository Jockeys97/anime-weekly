import { STREAMING_REGIONS, type StreamingRegion } from '@/lib/config';
import type { AnimeTitle } from '@/lib/tmdb';

export interface StoredAvailability {
  countries: Partial<Record<StreamingRegion, number[]>>;
  fetchedAt: number;
}
export interface ProviderSnapshot {
  titles: Record<string, StoredAvailability>;
  providers: Record<string, { name: string; logo: string | null }>;
}
export interface ProviderStore extends Omit<ProviderSnapshot, 'titles'> {
  titles: Record<string, StoredAvailability & { lastSeenAt: number }>;
}
export const PROVIDER_MAX_AGE = 7 * 86400000;

export function compactAvailability(providers: AnimeTitle['providers'], table: ProviderSnapshot['providers'], fetchedAt: number): StoredAvailability {
  const countries: StoredAvailability['countries'] = {};
  for (const country of STREAMING_REGIONS) {
    const offers = providers[country]?.providers;
    if (!offers?.length) continue;
    countries[country] = [...new Set(offers.map(provider => {
      table[provider.provider_id] = { name: provider.provider_name, logo: provider.logo_path || null };
      return provider.provider_id;
    }))];
  }
  return { countries, fetchedAt };
}

export function expandAvailability(snapshot: ProviderSnapshot | undefined, key: string): AnimeTitle['providers'] {
  const providers: AnimeTitle['providers'] = {};
  const entry = snapshot?.titles[key];
  if (!snapshot || !entry) return providers;
  const [kind, id] = key.split(':');
  for (const country of STREAMING_REGIONS) {
    const offers = (entry.countries[country] ?? []).flatMap(providerId => {
      const provider = snapshot.providers[providerId];
      return provider ? [{ provider_id: providerId, provider_name: provider.name, logo_path: provider.logo }] : [];
    });
    if (offers.length) providers[country] = { link: `https://www.themoviedb.org/${kind}/${id}/watch?locale=${country}`, providers: offers };
  }
  return providers;
}

// Also used at the authenticated snapshot-write boundary. Old snapshots may
// omit availability entirely; malformed new payloads must not poison caches.
export function validProviderSnapshot(value: unknown, store = false): value is ProviderSnapshot {
  const record = (item: unknown): item is Record<string, unknown> => Boolean(item && typeof item === 'object' && !Array.isArray(item));
  const time = (item: unknown) => typeof item === 'number' && Number.isFinite(item) && item >= 0;
  if (!record(value) || !record(value.titles) || !record(value.providers)) return false;
  if (!Object.entries(value.providers).every(([id, provider]) => /^[1-9]\d*$/.test(id) && record(provider) && typeof provider.name === 'string' && provider.name.length > 0 && provider.name.length <= 200 && (provider.logo === null || (typeof provider.logo === 'string' && /^\/[\w.\/-]+$/.test(provider.logo))))) return false;
  return Object.entries(value.titles).every(([key, entry]) => /^(tv|movie):[1-9]\d*$/.test(key) && record(entry) && time(entry.fetchedAt) && (!store || time(entry.lastSeenAt)) && record(entry.countries)
    && Object.entries(entry.countries).every(([country, ids]) => STREAMING_REGIONS.includes(country as StreamingRegion) && Array.isArray(ids) && ids.every(id => Number.isSafeInteger(id) && id > 0 && Object.hasOwn(value.providers as object, String(id)))));
}
