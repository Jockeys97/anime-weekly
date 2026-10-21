import { NextResponse, type NextRequest } from 'next/server';
import { isLocale, negotiateLocale } from '@/lib/locales';
import { landingRoute, localePath, pathLocale, stripLocale } from '@/lib/locale-routing';

const bots = /bot|crawl|spider|slurp|facebookexternalhit|embedly|preview/i;
export function proxy(request: NextRequest) {
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
  matcher: ['/', '/(en|it|es|fr|de|pt)', '/(en|it|es|fr|de|pt)/:path*', '/rankings/:path*', '/week/:path*', '/season/:path*', '/anime/:path*', '/piattaforma/:path*', '/search', '/my-anime', '/this-week', '/best-this-season', '/questa-settimana', '/migliori-della-stagione', '/esta-semana', '/mejores-de-la-temporada', '/cette-semaine', '/meilleurs-de-la-saison', '/diese-woche', '/beste-der-saison', '/melhores-da-temporada'],
};
