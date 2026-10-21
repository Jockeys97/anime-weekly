import Link from 'next/link';
import { getAnimeWeekAppearances } from '@/lib/weekly-seo-data';
import { getDictionary } from '@/lib/i18n';
import type { Locale } from '@/lib/locales';
import { localePath } from '@/lib/locale-routing';
import { withTimeout } from '@/lib/async-timeout';
export async function AnimeWeekLinks({ id, locale }: { id: number; locale: Locale }) {
  const weeks = await withTimeout(getAnimeWeekAppearances(id), 2500).catch(() => []);
  if (!weeks.length) return null;
  const d = getDictionary(locale);
  return <section className="landing-day"><h2>{d.rankings.appearances}</h2><ul>
    {weeks.map(item => <li key={item.week}><Link href={localePath(`/week/${item.week}`, locale)}>{d.week.label} {item.week}</Link>
      {item.ranked && <> · <Link href={localePath(`/rankings/${item.week}`, locale)}>{d.rankings.nav} {item.week}</Link></>}
    </li>)}
  </ul></section>;
}
