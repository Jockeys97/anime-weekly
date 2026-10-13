import type { StreamingRegion } from '@/lib/config';
export function providerWatchLink(kind: 'tv' | 'movie', id: number, region: StreamingRegion, provider: number): string {
  return `/api/watch?${new URLSearchParams({ kind, id: String(id), region, provider: String(provider) })}`;
}
