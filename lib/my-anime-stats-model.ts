import type { TraktShow } from '@/lib/my-anime-week';
import type { PersonalAnimeIdentity } from '@/lib/my-anime-identity';

export interface TraktHistoryPlay {
  id: number; type: string; watched_at?: string;
  show: TraktShow;
  episode: { season: number; number: number; runtime?: number | null };
}
export interface PersonalAnimeStats {
  status: 'ready' | 'unavailable'; series: number; episodes: number; plays: number; rewatches: number;
  minutes: number; missingRuntimePlays: number; unmatched: number; partial: boolean; updatedAt: string;
  syncing?: boolean;
}
export function animeHistoryStats(history: TraktHistoryPlay[], identities: Map<number, PersonalAnimeIdentity>, partial = false, unmatched = 0): PersonalAnimeStats {
  const plays = new Set<number>(), episodes = new Set<string>(), series = new Set<number>();
  let minutes = 0, missingRuntimePlays = 0;
  for (const item of history) {
    const identity = identities.get(item.show?.ids?.trakt);
    if (!identity || item.type !== 'episode' || !Number.isSafeInteger(item.id) || item.id <= 0 || plays.has(item.id)
      || !Number.isSafeInteger(item.episode?.season) || item.episode.season < 0 || !Number.isSafeInteger(item.episode.number) || item.episode.number <= 0) continue;
    plays.add(item.id); series.add(identity.id);
    episodes.add(`${item.show.ids.trakt}:${item.episode.season}:${item.episode.number}`);
    const runtime = item.episode.runtime;
    if (typeof runtime === 'number' && Number.isFinite(runtime) && runtime > 0 && runtime < 1440) minutes += runtime;
    else missingRuntimePlays++;
  }
  return { status: 'ready', series: series.size, episodes: episodes.size, plays: plays.size, rewatches: Math.max(0, plays.size - episodes.size),
    minutes, missingRuntimePlays, partial, unmatched, updatedAt: new Date().toISOString() };
}
