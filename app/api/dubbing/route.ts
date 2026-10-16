import { getAnime } from '@/lib/anilist';
import { validMalId } from '@/lib/dubbing';
import { isLocale } from '@/lib/locales';
import { getDubbing } from '@/lib/mydublist';

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const mal = params.get('mal'), anilist = params.get('anilist'), locale = params.get('locale');
  const raw = mal ?? anilist;
  if (!isLocale(locale) || params.getAll('locale').length !== 1 || params.getAll('mal').length > 1 || params.getAll('anilist').length > 1
    || (params.has('mal') === params.has('anilist')) || !raw || !/^[1-9]\d*$/.test(raw) || !validMalId(Number(raw))) {
    return Response.json({ error: 'Invalid dub lookup' }, { status: 400 });
  }
  try {
    // A calendar event supplies its exact AniList media ID. Never traverse
    // prequels, use the IMDb parent, or search a stripped series title here.
    let malId = mal ? Number(mal) : null;
    if (anilist) {
      const anime = await getAnime(Number(anilist));
      if (!anime || anime.id !== Number(anilist)) throw new Error('Exact season unavailable');
      malId = anime.idMal;
    }
    const result = await getDubbing(malId, locale);
    const failed = result.reason === 'upstream';
    return Response.json(result, { status: failed ? 503 : 200,
      headers: { 'Cache-Control': failed ? 'no-store' : 'public, max-age=300, s-maxage=86400' } });
  } catch {
    return Response.json({ status: 'unverified', language: locale, reason: 'upstream' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
