import { getAnime } from '@/lib/anilist';
import { getDetailAvailability } from '@/lib/detail-availability';
import type { CatalogCardSummary } from '@/lib/catalog-card-summary';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(Number(id)) || Number(id) > 2147483647) {
    return Response.json({ error: 'Invalid anime ID' }, { status: 400 });
  }
  try {
    const anime = await getAnime(Number(id));
    if (!anime) return Response.json({ error: 'Anime unavailable' }, { status: 404, headers: { 'Cache-Control': 'no-store' } });
    const watch = await getDetailAvailability(anime);
    const summary: CatalogCardSummary = {
      ratings: { ...watch.ratings, anilistScore: anime.averageScore, anilistId: anime.id },
      availability: { match: watch.match, providers: watch.providers, providersUnavailable: watch.providersUnavailable },
    };
    return Response.json(summary, { headers: { 'Cache-Control': watch.providersUnavailable ? 'no-store' : 'public, max-age=60, s-maxage=300' } });
  } catch {
    return Response.json({ error: 'Anime enrichment unavailable' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
