import type { Locale } from '@/lib/locales';
export interface SynopsisResult { synopsis: string | null; language: Locale | null; source: 'tmdb' | 'deepl' | null }
const requests = new Map<string, { expires: number; promise: Promise<SynopsisResult> }>();
export function synopsisQuery(locale: Locale, kind: 'tv' | 'movie', anilistId: number, titles: string[], year?: number): string {
  const params = new URLSearchParams({ locale, kind, anilist: String(anilistId) });
  titles.filter(title => title.trim()).slice(0, 3).forEach(title => params.append('title', title.slice(0, 200)));
  if (year) params.set('year', String(year));
  return params.toString();
}
export function loadSynopsis(query: string): Promise<SynopsisResult> {
  const existing = requests.get(query);
  if (existing && existing.expires > Date.now()) return existing.promise;
  const promise = fetch(`/api/synopsis?${query}`, { signal: AbortSignal.timeout(30000) }).then(async response => {
    if (!response.ok) throw new Error('Synopsis unavailable');
    const data = await response.json() as SynopsisResult;
    if (!data.synopsis) requests.delete(query);
    return data;
  }).catch(error => { requests.delete(query); throw error; });
  if (requests.size >= 200) requests.delete(requests.keys().next().value!);
  requests.set(query, { expires: Date.now() + 600000, promise });
  return promise;
}
