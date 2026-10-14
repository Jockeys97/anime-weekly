import { parseWatchTarget } from '@/lib/watch-links';
import { resolveWatchDestination } from '@/lib/watch-destination';
import { getDictionary } from '@/lib/i18n';

export async function GET(request: Request) {
  const target = parseWatchTarget(new URL(request.url).searchParams);
  if (!target) return Response.json({ error: getDictionary().api.invalidWatchTarget }, { status: 400 });
  const destination = await resolveWatchDestination(target);
  return new Response(null, { status: 307, headers: { Location: destination, 'Cache-Control': 'no-store' } });
}
