import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/seo';
import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { myAnimeConfig, type AnimeProvider } from '@/lib/my-anime-config';
import { readToken, tokenCookie, tokenNeedsRefresh } from '@/lib/my-anime-auth';
import { getPersonalWeek } from '@/lib/my-anime-data';
import { romeWeek } from '@/lib/my-anime-week';
import { MyAnimeContent } from '@/components/MyAnimeContent';
import './my-anime.css';

export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';
export const metadata: Metadata = { ...pageMetadata('I miei anime', 'Il tuo calendario anime personale.', '/my-anime'), robots: { index: false, follow: false } };
export default async function MyAnimePage({ searchParams }: { searchParams: Promise<{ auth?: string }> }) {
  const config = myAnimeConfig();
  if (!config.enabled) notFound();
  const cookieStore = await cookies();
  const tokens = {
    trakt: config.trakt ? readToken('trakt', cookieStore.get(tokenCookie('trakt'))?.value) : null,
    mal: config.mal ? readToken('mal', cookieStore.get(tokenCookie('mal'))?.value) : null,
  };
  for (const provider of ['trakt', 'mal'] as AnimeProvider[]) {
    const token = tokens[provider];
    if (token && tokenNeedsRefresh(token)) redirect(`/api/auth/${provider}/refresh`);
  }
  const { week, start, end } = romeWeek();
  const data = tokens.trakt || tokens.mal ? await getPersonalWeek(tokens, week) : null;
  const params = await searchParams;
  return <MyAnimeContent providers={{ trakt: config.trakt, mal: config.mal }} connected={{ trakt: Boolean(tokens.trakt), mal: Boolean(tokens.mal) }}
    data={data} start={start} end={end} authError={params.auth === 'error'} />;
}
