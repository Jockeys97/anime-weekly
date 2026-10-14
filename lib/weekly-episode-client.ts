'use client';
import type { WeeklyEpisodes } from '@/lib/weekly-episodes';
const snapshots = new Map<string, { expires: number; data: WeeklyEpisodes }>();
export async function loadWeeklyEpisodes(slug: string, signal: AbortSignal): Promise<WeeklyEpisodes> {
  const existing = snapshots.get(slug);
  if (existing && existing.expires > Date.now()) return existing.data;
  const response = await fetch(`/api/revalidate?episodes=${encodeURIComponent(slug)}`, { signal: AbortSignal.any([signal, AbortSignal.timeout(10000)]) });
  if (!response.ok) throw new Error('Episode ratings unavailable');
  const data = await response.json() as WeeklyEpisodes;
  if (!data || !Array.isArray(data.entries) || !['ready', 'partial', 'pending', 'unavailable'].includes(data.status)) throw new Error('Invalid episode ratings');
  if (data.status === 'ready') {
    if (snapshots.size >= 30) snapshots.delete(snapshots.keys().next().value!);
    snapshots.set(slug, { data, expires: Date.now() + 300000 });
  }
  return data;
}
