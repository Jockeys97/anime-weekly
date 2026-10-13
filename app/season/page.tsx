import { redirect } from 'next/navigation';
import { connection } from 'next/server';
import { currentSeason, seasonPath } from '@/lib/season';

export default async function SeasonIndex() {
  await connection();
  redirect(seasonPath(currentSeason()));
}
