import { ImageResponse } from 'next/og';
import { getWeeklyRatings } from '@/lib/weekly-ratings';
import { snapshotTopFive } from '@/lib/weekly-snapshot-titles';
import { getDictionary } from '@/lib/i18n';
export async function weeklyOgImage(slug: string) {
  const top = snapshotTopFive(await getWeeklyRatings(slug), slug);
  const d = getDictionary('it');
  return new ImageResponse(<div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%', background: '#101824', color: '#ffffff', padding: 64, fontFamily: 'sans-serif' }}>
    <div style={{ display: 'flex', color: '#a7f3d0', fontSize: 28 }}>Anime Weekly · {slug}</div>
    <div style={{ display: 'flex', fontSize: 52, marginTop: 24, marginBottom: 24 }}>{d.features.topFive} · IMDb</div>
    {top.length ? top.map((title, index) => <div key={title.key} style={{ display: 'flex', fontSize: 30, marginBottom: 16 }}><span style={{ marginRight: 20, color: '#a7f3d0' }}>{index + 1}.</span><span style={{ flex: 1 }}>{title.name.length > 65 ? `${title.name.slice(0, 62)}…` : title.name}</span><span style={{ marginLeft: 20 }}>{title.score.toFixed(2)}</span></div>) : <div style={{ display: 'flex', fontSize: 32, marginTop: 48 }}>{d.hero.description}</div>}
  </div>, { width: 1200, height: 630 });
}
