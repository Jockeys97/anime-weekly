import { isLocale } from '@/lib/locales';
import { getWeeklyText } from '@/lib/weekly-text';
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const idText = params.get('id') || '';
  const id = Number(idText), kind = params.get('kind'), locale = params.get('locale');
  if (!/^[1-9]\d*$/.test(idText) || !Number.isSafeInteger(id) || id > 2147483647 || (kind !== 'tv' && kind !== 'movie') || !isLocale(locale)) {
    return Response.json({ error: 'Invalid weekly text request' }, { status: 400 });
  }
  const result = await getWeeklyText(id, kind, locale);
  return Response.json(result, { headers: { 'Cache-Control': result.overview ? 'public, max-age=86400' : 'public, max-age=60' } });
}
