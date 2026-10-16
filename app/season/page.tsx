import { redirect } from 'next/navigation';
import { connection } from 'next/server';
import { currentSeason, seasonPath } from '@/lib/season';
import { pageMetadata } from '@/lib/seo';
export const metadata = pageMetadata('Anime per stagione', 'Esplora le uscite anime per stagione.', '/season');

export default async function SeasonIndex() {
  await connection();
  redirect(seasonPath(currentSeason()));
}
