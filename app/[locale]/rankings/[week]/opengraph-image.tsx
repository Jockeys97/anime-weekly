import { ImageResponse } from 'next/og';
import { notFound } from 'next/navigation';
import { getRequestLocale } from '@/lib/request-locale';
import { getDictionary } from '@/lib/i18n';
import { getRankingsWeek } from '@/lib/rankings-seo-data';
export const alt = 'Weekly Anime · IMDb / MyAnimeList';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const revalidate = 900;
export default async function Image({ params }: { params: Promise<{ week: string; locale?: string }> }) {
  const { week } = await params;
  const data = await getRankingsWeek(week);
  if (!data) notFound();
  const slug = data.week;
  const locale = await getRequestLocale(params);
  const d = getDictionary(locale).rankings;
  const heading = (week === 'this-week' ? d.currentTitle : d.title).replace('{week}', slug);
  return new ImageResponse(<div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%', background: '#10131d', color: '#fff', padding: 48, fontFamily: 'sans-serif' }}>
    <div style={{ display: 'flex', fontSize: 24, color: '#8edfc5' }}>WEEKLY ANIME · {slug}</div>
    <div style={{ display: 'flex', fontSize: 42, marginTop: 18 }}>{heading}</div>
    <div style={{ display: 'flex', gap: 40, marginTop: 30 }}>
      {(['imdb', 'mal'] as const).map(source => <div key={source} style={{ display: 'flex', flexDirection: 'column', width: '48%' }}>
        <div style={{ fontSize: 28, color: '#8edfc5', marginBottom: 12 }}>{source === 'imdb' ? 'IMDb' : 'MyAnimeList'}</div>
        {data.rankings[source].slice(0, 3).map((entry, index) => <div key={entry.anilistId} style={{ display: 'flex', fontSize: 24, marginBottom: 20 }}>{index + 1}. {entry.anime.name.slice(0, 42)} · {entry.score}/10</div>)}
      </div>)}
    </div>
  </div>, size);
}
