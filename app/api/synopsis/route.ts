import { isLocale } from '@/lib/locales';
import { getLocalizedSynopsis } from '@/lib/tmdb';
import { animeDescription } from '@/lib/anilist';
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const locale = params.get('locale'), kind = params.get('kind');
  const titles = params.getAll('title');
  const yearText = params.get('year');
  const year = yearText == null ? undefined : Number(yearText);
  if (!isLocale(locale) || (kind !== 'tv' && kind !== 'movie') || titles.length < 1 || titles.length > 3
    || titles.some(title => !title.trim() || title.length > 200)
    || (yearText != null && (!/^\d{4}$/.test(yearText) || !Number.isSafeInteger(year) || year! < 1000))) return Response.json({ error: 'Invalid synopsis request' }, { status: 400 });
  const synopsis = await getLocalizedSynopsis(titles, year, locale, kind);
  return Response.json({ synopsis: synopsis ? animeDescription(synopsis) : null, language: synopsis ? locale : null }, {
    headers: { 'Cache-Control': synopsis ? 'public, max-age=86400' : 'public, max-age=300' },
  });
}
