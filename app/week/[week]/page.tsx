import { notFound } from 'next/navigation';
import { WeeklyGuide } from '@/components/WeeklyGuide';
import { parseWeek } from '@/lib/week';
export const revalidate = 604800;
// All valid week routes are generated on first request, then cached by ISR.
export function generateStaticParams() { return []; }
export default async function WeekPage({ params }: { params: Promise<{ week: string }> }) {
  const { week: slug } = await params; const week = parseWeek(slug);
  if (!week) notFound();
  return <WeeklyGuide week={week} />;
}
