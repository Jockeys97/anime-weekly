import { cookies } from 'next/headers';
import { isLocale } from '@/lib/locales';
export async function POST(request: Request) {
  if (request.headers.get('origin') && request.headers.get('origin') !== new URL(request.url).origin) return new Response(null, { status: 403 });
  let locale: unknown;
  try { locale = (await request.json()).locale; } catch { return new Response(null, { status: 400 }); }
  if (!isLocale(locale)) return new Response(null, { status: 400 });
  (await cookies()).set('anime-language', locale, { httpOnly: true, sameSite: 'lax', secure: new URL(request.url).protocol === 'https:', path: '/', maxAge: 31536000 });
  return Response.json({ locale }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function GET() {
  const value = (await cookies()).get('anime-language')?.value;
  return Response.json({ locale: isLocale(value) ? value : null }, { headers: { 'Cache-Control': 'private, no-store' } });
}
