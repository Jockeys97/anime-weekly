import { weeklyOgImage } from '@/components/WeeklyOgImage';
import { formatWeek, isoWeek } from '@/lib/week';
export const alt = 'Weekly Anime – Top 5 episodi della settimana su IMDb';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const revalidate = 21600;
export default function Image() { return weeklyOgImage(formatWeek(isoWeek(new Date()))); }
