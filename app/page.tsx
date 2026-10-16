import { WeeklyGuide } from '@/components/WeeklyGuide';
import { isoWeek } from '@/lib/week';
import { pageMetadata } from '@/lib/seo';
import { getDictionary } from '@/lib/i18n';
const d = getDictionary('it');
export const metadata = pageMetadata(d.metadata.title, d.metadata.description, '/');
export const dynamic = 'error';
export const revalidate = 900; // re-read the cron-cached ratings snapshot (cache-only) every 15 min
export default function Home() { return <WeeklyGuide week={isoWeek(new Date())} newsletter />; }
