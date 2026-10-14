import { weeklyOgImage } from '@/components/WeeklyOgImage';
import { formatWeek, isoWeek } from '@/lib/week';
export const alt = 'Anime Weekly – Top 5 della settimana';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const revalidate = 900;
export default function Image() { return weeklyOgImage(formatWeek(isoWeek(new Date()))); }
