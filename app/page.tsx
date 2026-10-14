import { WeeklyGuide } from '@/components/WeeklyGuide';
import { isoWeek } from '@/lib/week';
export const dynamic = 'error';
export const revalidate = 900; // re-read the cron-cached ratings snapshot (cache-only) every 15 min
export default function Home() { return <WeeklyGuide week={isoWeek(new Date())} />; }
