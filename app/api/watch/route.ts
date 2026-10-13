import { CACHE_SECONDS, CACHE_TAG } from '@/lib/config';
import { findProviderOffer, parseWatchTarget, regionalWatchPage } from '@/lib/watch-links';
import { getDictionary } from '@/lib/i18n';

export async function GET(request: Request) {
  const target = parseWatchTarget(new URL(request.url).searchParams);
  if (!target) return Response.json({ error: getDictionary().api.invalidWatchTarget }, { status: 400 });
  const fallback = regionalWatchPage(target);
  let destination = fallback;
  try {
    const response = await fetch(fallback, {
      cache: 'force-cache', next: { revalidate: CACHE_SECONDS, tags: [CACHE_TAG] },
      signal: AbortSignal.timeout(8000), redirect: 'error',
    });
    if (response.ok && response.headers.get('content-type')?.includes('text/html')) {
      const html = await response.text();
      if (html.length <= 2_000_000) destination = findProviderOffer(html, target) || fallback;
    }
  } catch { /* Keep the regional title page usable if the upstream page is unavailable. */ }
  return new Response(null, { status: 307, headers: { Location: destination, 'Cache-Control': 'no-store' } });
}
