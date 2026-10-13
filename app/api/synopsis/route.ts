import { isLocale } from '@/lib/locales';
import { getSynopsis } from '@/lib/synopsis';
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
  const result = await getSynopsis(titles, year, locale, kind, id);
  const { synopsis } = result;
  return Response.json(result, {
    headers: { 'Cache-Control': synopsis ? 'public, max-age=86400' : 'public, max-age=60' },
  });
}
