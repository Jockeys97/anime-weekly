import { notFound } from 'next/navigation';
import { WeeklyGuide } from '@/components/WeeklyGuide';
import { parseWeek } from '@/lib/week';
import { pageMetadata } from '@/lib/seo';
export async function generateMetadata({ params }: { params: Promise<{ week: string }> }) {
  const { week } = await params;
  if (!parseWeek(week)) notFound();
  return pageMetadata(`Anime della settimana ${week}`, `Uscite anime, voti e piattaforme streaming della settimana ${week}.`, `/week/${week}`);
}
export const dynamic = 'error';
export const revalidate = 900; // re-read the cron-cached ratings snapshot (cache-only) every 15 min
export const dynamicParams = true;
// All valid week routes are generated on first request, then cached by ISR.
export function generateStaticParams() { return []; }
export default async function WeekPage({ params }: { params: Promise<{ week: string }> }) {
  const { week: slug } = await params; const week = parseWeek(slug);
  if (!week) notFound();
  return <WeeklyGuide week={week} />;
}
