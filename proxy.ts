import { NextResponse, type NextRequest } from 'next/server';
import { animeUnavailableResponse, isAnimeUnavailable } from '@/lib/soft-failure-gate';
import { isLocale, negotiateLocale } from '@/lib/locales';
import { discoveryInternalPath, landingRoute, localePath, pathLocale, stripLocale } from '@/lib/locale-routing';

const bots = /bot|crawl|spider|slurp|facebookexternalhit|embedly|preview/i;
// Detail, episode and similar URLs of an anime whose AniList lookup just
// failed get a real uncached 503 + Retry-After instead of the 200 soft page
// (lib/soft-failure-gate). Only these URLs wait on the gate read; every other
// path stays synchronous.
const GATED_ANIME = /^\/anime\/([1-9]\d{0,9})-[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[^/]+)?\/?$/i;
export const CACHE_PROBE_HEADER = 'x-aw-cache-probe';
const CACHE_PROBE_TIMEOUT_MS = 4000;
export function proxy(request: NextRequest): NextResponse | Promise<NextResponse> {
  // The probe request itself must reach the page/CDN normally.
  if (request.headers.get(CACHE_PROBE_HEADER)) return route(request);
  const gated = GATED_ANIME.exec(stripLocale(request.nextUrl.pathname));
  if (!gated) return route(request);
  return isAnimeUnavailable(Number(gated[1])).then(async down => {
    if (!down) return route(request);
    // AniList recently failed for this anime. Serve the last-good ISR copy if
    // one exists; otherwise the render would 500, so answer 503 + Retry-After.
    return await hasServablePage(request) ? route(request) : animeUnavailableResponse();
  });
}
async function hasServablePage(request: NextRequest): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CACHE_PROBE_TIMEOUT_MS);
  try {
    const response = await fetch(request.nextUrl.href, { method: 'GET', redirect: 'manual', cache: 'no-store', signal: controller.signal, headers: { [CACHE_PROBE_HEADER]: '1', 'user-agent': 'weeklyanime-cache-probe' } });
    await response.body?.cancel().catch(() => undefined);
    return response.status < 500;
  } catch { return false; }
  finally { clearTimeout(timer); }
}
function route(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const bare = stripLocale(pathname);
  const locale = pathLocale(pathname);
  // Run before the CDN lookup. Never cache a preference-dependent redirect.
  const ua = request.headers.get('user-agent')?.trim();
  if (pathname === '/' && ua && !bots.test(ua)) {
    // First visit: Accept-Language. Returning visitor: the saved choice, so a
    // non-Italian preference still lands on its own home (never on deep pages).
    const saved = request.cookies.get('anime-language')?.value;
    const selected = saved !== undefined ? (isLocale(saved) ? saved : 'it') : negotiateLocale(request.headers.get('accept-language'), undefined, 'it');
    if (selected !== 'it') {
      const destination = request.nextUrl.clone();
      destination.pathname = localePath('/', selected);
      const response = NextResponse.redirect(destination, 307);
      response.cookies.set('anime-language', selected, { httpOnly: true, sameSite: 'lax', secure: destination.protocol === 'https:', path: '/', maxAge: 31536000 });
      response.headers.set('Cache-Control', 'private, no-store');
      response.headers.set('Vary', 'Accept-Language, Cookie, User-Agent');
      return response;
    }
  }
  // Keep malformed-ID rejection ahead of streaming, for every locale.
  if (/^\/anime\/[^/]+\/?$/.test(bare)) {
    let id = '';
    try { id = decodeURIComponent(bare.split('/')[2] || ''); } catch { /* Invalid URI escapes are invalid IDs. */ }
    if (!/^\d+(?:-[a-z0-9]+(?:-[a-z0-9]+)*)?$/i.test(id)) {
      const destination = request.nextUrl.clone();
      // Two segments ensure this misses even the new /[locale] home route.
      destination.pathname = '/_anime-not-found/invalid';
      return NextResponse.rewrite(destination);
    }
    // Bare numeric IDs: resolve the slug in a route handler so a transient
    // AniList 429/timeout returns an uncached 503, never an ISR 500.
    if (/^[1-9]\d*$/.test(id)) {
      const destination = request.nextUrl.clone();
      destination.pathname = `/api/anime-redirect/${id}`;
      destination.search = `?locale=${locale}`;
      return NextResponse.rewrite(destination);
    }
  }
  const discovery = discoveryInternalPath(pathname);
  if (discovery) {
    const destination = request.nextUrl.clone();
    // Redirect before rewriting to the page, where streaming may already begin.
    if (discovery === '/best-this-season/hentai') {
      destination.pathname = localePath('/search/hentai', locale);
      return NextResponse.redirect(destination, 308);
    }
    const canonical = localePath(discovery, locale);
    destination.pathname = pathname !== canonical ? canonical : `/${locale}${discovery}`;
    return pathname !== canonical ? NextResponse.redirect(destination, 308) : NextResponse.rewrite(destination);
  }
  const imageSuffix = pathname.endsWith('/opengraph-image') ? '/opengraph-image' : '';
  const landing = landingRoute(imageSuffix ? pathname.slice(0, -imageSuffix.length) : pathname);
  if (landing) {
    const canonical = localePath(pathname, locale);
    const destination = request.nextUrl.clone();
    if (pathname !== canonical) {
      destination.pathname = canonical;
      return NextResponse.redirect(destination, 308);
    }
    destination.pathname = `/${locale}/${landing}${imageSuffix}`;
    return NextResponse.rewrite(destination);
  }
  // Italian is public only without a prefix. Preserve query parameters.
  if (pathname === '/it' || pathname.startsWith('/it/')) {
    const destination = request.nextUrl.clone(); destination.pathname = bare;
    return NextResponse.redirect(destination, 308);
  }
  const destination = request.nextUrl.clone();
  destination.pathname = locale === 'it' ? `/it${pathname === '/' ? '' : pathname}` : pathname;
  const response = locale === 'it' ? NextResponse.rewrite(destination) : NextResponse.next();
  // The document itself is URL-stable and can remain ISR/CDN cached.
  if (pathname === '/') response.headers.set('Vary', 'Accept-Language, Cookie, User-Agent');
  return response;
}
export const config = {
  matcher: [
    '/',
    '/((?!_next(?:/|$)|api(?:/|$)|(?:en|it|es|fr|de|pt)/(?:_next|api)(?:/|$)|(?:.*?/)?(?:favicon(?:\\.[^/]+)?|robots\\.txt|sitemap(?:\\.xml)?)(?:/|$)|(?:.*?/)?sitemaps(?:/|$)|.*\\.[^/]+$)(?:(?:en|it|es|fr|de|pt|rankings|week|season|anime|piattaforma|best-this-season|migliori-della-stagione|mejores-de-la-temporada|meilleurs-de-la-saison|beste-der-saison|melhores-da-temporada)(?:/.*)?|search(?:/.*)?|my-anime|tier-list|this-week|questa-settimana|esta-semana|cette-semaine|diese-woche))',
  ],
};
