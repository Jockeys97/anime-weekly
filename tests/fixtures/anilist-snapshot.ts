import type { AniListAnime } from '../../lib/anilist';
import type { SnapshotSeason } from '../../lib/anilist-snapshot';

export const anime: AniListAnime = {
  id: 21, idMal: 123, title: { english: 'Saved anime', romaji: 'Saved anime', native: null },
  coverImage: { large: 'https://s4.anilist.co/cover.jpg', extraLarge: null, color: null },
  bannerImage: null, description: 'Saved synopsis', startDate: { year: 2026, month: 10, day: 1 },
  episodes: 12, format: 'TV', status: 'RELEASING', genres: ['Action'], averageScore: 81,
  studios: { nodes: [{ id: 1, name: 'Studio' }] }, season: 'FALL', seasonYear: 2026,
  nextAiringEpisode: { episode: 3, airingAt: 1792886400 }, trailer: { id: 'official', site: 'youtube' },
  relations: { edges: [] }, stats: { scoreDistribution: [{ amount: 10 }] },
};
export const snapshot: SnapshotSeason = {
  version: 1, year: 2026, season: 'fall', savedAt: '2026-10-21T05:30:00.000Z', count: 1, media: [anime],
};
export function blobResult(value: unknown) {
  return {
    statusCode: 200 as const, stream: new Response(JSON.stringify(value)).body!, headers: new Headers(),
    blob: { url: 'https://example.private.blob.vercel-storage.com/anilist/test.json', downloadUrl: '', pathname: 'anilist/test.json', contentType: 'application/json', contentDisposition: '', cacheControl: '', uploadedAt: new Date(snapshot.savedAt), etag: '', size: 100 },
  };
}
