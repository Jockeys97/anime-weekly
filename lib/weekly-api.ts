import { parseWeek } from '@/lib/week';
export function weeklyLookup(url: string) {
  const params = new URL(url).searchParams;
  const week = params.get('week'), kind = params.get('kind'), id = params.get('id');
  if (!week || !parseWeek(week) || (kind !== 'tv' && kind !== 'movie') || !id || !/^[1-9]\d*$/.test(id) || Number(id) > 2147483647) return null;
  return { week, kind: kind as 'tv' | 'movie', id: Number(id) };
}
