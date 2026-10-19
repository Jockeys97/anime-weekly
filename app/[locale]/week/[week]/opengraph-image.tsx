import { getRequestLocale } from '@/lib/request-locale';
import { weeklyOgImage } from '@/components/WeeklyOgImage';
import { parseWeek } from '@/lib/week';
import { notFound } from 'next/navigation';
export const alt = 'Weekly Anime – Top 5 episodi della settimana su IMDb';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const revalidate = 900;
export default async function Image({ params }: { params: Promise<{ week: string; locale?: string }> }) {
  const { week } = await params;
  if (!parseWeek(week)) notFound();
  return weeklyOgImage(week, await getRequestLocale(params));
}
