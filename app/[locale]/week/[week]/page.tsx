import { getSeoWeek } from '@/lib/weekly-seo-data';
import { getRequestLocale } from '@/lib/request-locale';
import { getDictionary } from '@/lib/i18n';
import { notFound } from 'next/navigation';
import { WeeklyGuide } from '@/components/WeeklyGuide';
import { parseWeek, weekDateRange } from '@/lib/week';
import { pageMetadata } from '@/lib/seo';
import { JsonLd } from '@/components/JsonLd';
import { breadcrumbList, homeBreadcrumb } from '@/lib/structured-data';
export async function generateMetadata({ params }: { params: Promise<{ week: string; locale?: string }> }) {
  const { week } = await params;
  const value = parseWeek(week);
  if (!value) notFound();
  const locale = await getRequestLocale(params); const d = getDictionary(locale);
  const dates = weekDateRange(value, locale);
  const metadata = pageMetadata(`Anime ${dates} · ${d.week.label.toLowerCase()} ${value.week}`, d.seo.weekDescription.replace('{dates}', dates).replace('{week}', String(value.week)), `/week/${week}`, undefined, locale);
  if (!await getSeoWeek(week)) metadata.robots = { index: false, follow: true };
  return metadata;
}
export const dynamic = 'error';
export const revalidate = 900; // re-read the cron-cached ratings snapshot (cache-only) every 15 min
export const dynamicParams = true;
// All valid week routes are generated on first request, then cached by ISR.
export function generateStaticParams() { return []; }
export default async function WeekPage({ params }: { params: Promise<{ week: string; locale?: string }> }) {
  const { week: slug } = await params; const week = parseWeek(slug);
  if (!week) notFound();
  const locale = await getRequestLocale(params);
  return <><JsonLd data={breadcrumbList([homeBreadcrumb, { name: `${getDictionary(locale).week.label} ${week.week}`, path: `/week/${slug}` }], locale)} /><WeeklyGuide week={week} locale={locale} archive /></>;
}
