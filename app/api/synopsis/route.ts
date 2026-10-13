import { isLocale } from '@/lib/locales';
import { getLocalizedSynopsis } from '@/lib/tmdb';
import { animeDescription, getAnime } from '@/lib/anilist';
import { isDeepLConfigured, translateSynopsis } from '@/lib/deepl';
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const locale = params.get('locale'), kind = params.get('kind');
  const titles = params.getAll('title');
  const idText = params.get('anilist');
  const id = idText == null ? undefined : Number(idText);
  const yearText = params.get('year');
  const year = yearText == null ? undefined : Number(yearText);
  if ((idText != null && (!/^[1-9]\d*$/.test(idText) || !Number.isSafeInteger(id) || id! > 2147483647)) || !isLocale(locale) || (kind !== 'tv' && kind !== 'movie') || titles.length < 1 || titles.length > 3
    || titles.some(title => !title.trim() || title.length > 200)
    || (yearText != null && (!/^\d{4}$/.test(yearText) || !Number.isSafeInteger(year) || year! < 1000))) return Response.json({ error: 'Invalid synopsis request' }, { status: 400 });
  let synopsis = await getLocalizedSynopsis(titles, year, locale, kind);
  let source: 'tmdb' | 'deepl' | null = synopsis ? 'tmdb' : null;
  if (!synopsis && id != null && locale !== 'en' && isDeepLConfigured()) {
    // Fetch the English source by its canonical AniList ID. Never accept text
    // submitted by a client, or infer a season's synopsis from its parent show.
    const anime = await getAnime(id);
    const original = anime ? animeDescription(anime.description) : '';
    if (original) {
      synopsis = await translateSynopsis(original, locale);
      if (synopsis) source = 'deepl';
    }
  }
  return Response.json({ synopsis: synopsis ? animeDescription(synopsis) : null, language: synopsis ? locale : null, source }, {
    headers: { 'Cache-Control': synopsis ? 'public, max-age=86400' : 'public, max-age=60' },
  });
}
