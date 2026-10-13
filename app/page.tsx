import { WeeklyGuide } from '@/components/WeeklyGuide';
import { isoWeek } from '@/lib/week';
export const maxDuration = 300;
export const revalidate = 604800;
export default function Home() { return <WeeklyGuide week={isoWeek(new Date())} />; }
