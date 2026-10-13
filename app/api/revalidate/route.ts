import { timingSafeEqual } from 'node:crypto';
import { revalidatePath, revalidateTag } from 'next/cache';
import { CACHE_TAG } from '@/lib/config';
import { getDictionary } from '@/lib/i18n';
export async function GET(request: Request) {
  const d = getDictionary(); const secret = process.env.CRON_SECRET;
  if (!secret?.trim()) return Response.json({ error: d.api.missingSecret }, { status: 500 });
  const actual = Buffer.from(request.headers.get('authorization') || '');
  const expected = Buffer.from(`Bearer ${secret}`);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return Response.json({ error: d.api.unauthorized }, { status: 401 });
  revalidateTag(CACHE_TAG, { expire: 0 });
  revalidatePath('/'); revalidatePath('/week/[week]', 'page');
  return Response.json({ revalidated: true });
}
