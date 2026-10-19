import { notFound } from 'next/navigation';
import { WeeklyGuide } from '@/components/WeeklyGuide';
import { formatWeek, isoWeek, parseWeek, weekDateRange } from '@/lib/week';
import { pageMetadata } from '@/lib/seo';
import { JsonLd } from '@/components/JsonLd';
import { breadcrumbList, homeBreadcrumb } from '@/lib/structured-data';
export async function generateMetadata({ params }: { params: Promise<{ week: string }> }) {
  const { week } = await params;
  const value = parseWeek(week);
  if (!value) notFound();
  const dates = weekDateRange(value);
  return pageMetadata(`Anime ${dates} · settimana ${value.week}`, `Uscite anime, voti e piattaforme streaming: ${dates}, settimana ${value.week}.`, week === formatWeek(isoWeek(new Date())) ? '/' : `/week/${week}`);
}
export const dynamic = 'error';
export const revalidate = 900; // re-read the cron-cached ratings snapshot (cache-only) every 15 min
export const dynamicParams = true;
// All valid week routes are generated on first request, then cached by ISR.
export function generateStaticParams() { return []; }
export default async function WeekPage({ params }: { params: Promise<{ week: string }> }) {
  const { week: slug } = await params; const week = parseWeek(slug);
  if (!week) notFound();
  return <><JsonLd data={breadcrumbList([homeBreadcrumb, { name: `Settimana ${week.week}`, path: `/week/${slug}` }])} /><WeeklyGuide week={week} archive /></>;
}
