import { NextResponse, type NextRequest } from 'next/server';

// Reject malformed detail URLs before the root loading/Suspense boundary can
// stream a 200 shell. Reserve digits-slug URLs for future canonical slugs.
export function proxy(request: NextRequest) {
  let id = '';
  try {
    id = decodeURIComponent(request.nextUrl.pathname.split('/')[2] || '');
  } catch {
    // Malformed URI escapes are invalid IDs too.
  }
  if (!/^\d+(?:-[a-z0-9]+(?:-[a-z0-9]+)*)?$/i.test(id)) {
    const destination = request.nextUrl.clone();
    destination.pathname = '/404';
    // No route exists at /404: Next renders app/not-found.tsx with HTTP 404.
    return NextResponse.rewrite(destination);
  }

  // Existence checks stay in the page's cached AniList loader. With the root
  // Suspense boundary, a missing numeric ID can still stream 200 + noindex;
  // a nested layout cannot undo response headers already sent by its parent.
  return NextResponse.next();
}

export const config = { matcher: '/anime/:id' };
