import type { Locale } from '@/lib/locales';
import { getDictionary } from '@/lib/i18n';
import { VisitorDate } from '@/components/VisitorTime';
import { weekRange, weekDateRange, type ISOWeek } from '@/lib/week';
export function WeeklyHeadingContent({ week, archive = false, locale = 'it' }: { week: ISOWeek; archive?: boolean; locale?: Locale }) {
  const d = getDictionary(locale); const range = weekRange(week);
  return <section className="hero"><div className="hero-copy"><p className="eyebrow"><span className="green-dot" />{d.hero.eyebrow}</p><h1>{archive ? <>Anime {weekDateRange(week, locale)} · {d.week.label.toLocaleLowerCase(locale)} {week.week}</> : <>{d.hero.title}<br /><span>{d.hero.accent}</span></>}</h1><p className="hero-description">{d.hero.description}</p></div><div className="calendar-art" aria-hidden="true"><div className="calendar-top">{d.week.label} {String(week.week).padStart(2, '0')} <span>✦</span></div><div className="calendar-number">{String(week.week).padStart(2, '0')}</div><div className="calendar-bottom"><VisitorDate value={range.start} options={{ month: 'short', day: 'numeric' }} /> — <VisitorDate value={range.end} options={{ month: 'short', day: 'numeric' }} /><span>↗</span></div></div></section>;
}
export function WeeklyScopeContent({ locale = 'it' }: { locale?: Locale }) {
  const d = getDictionary(locale);
  return <div className="guide-note"><p>{d.week.scope}</p><span>{d.week.cap}</span></div>;
}
