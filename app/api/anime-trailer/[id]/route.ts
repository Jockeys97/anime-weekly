import { getAnime } from '@/lib/anilist';
import { trailerLinks, trailerPreview } from '@/lib/trailer';

// Hover previews on the weekly calendar: only the trailer, cached at the edge,
// so a visitor's hover never triggers rating or availability work.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[1-9]\d*$/.test(id) || Number(id) > 2147483647) return Response.json({}, { status: 400 });
  const anime = await getAnime(Number(id));
  if (!anime) return Response.json({}, { status: 404, headers: { 'Cache-Control': 'no-store' } });
  const preview = trailerPreview(anime.trailer);
  return Response.json(preview ? { preview, watch: trailerLinks(anime.trailer)!.watch } : {}, {
    headers: { 'Cache-Control': preview ? 'public, max-age=3600, s-maxage=86400' : 'public, max-age=600, s-maxage=3600' },
  });
}
