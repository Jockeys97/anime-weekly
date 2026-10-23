import Link from '@/components/LocaleLink';
import { JsonLd } from '@/components/JsonLd';
import { LandingCard } from '@/components/LandingCard';
import { landingProviders } from '@/lib/landing-providers';
import { animeDetailLink } from '@/lib/anime-detail-link';
import { getDictionary } from '@/lib/i18n';
import { getRequestLocale, type LocaleParams } from '@/lib/request-locale';
import { landingHeading, landingMetadata, ratingSources } from '@/lib/seo-landings';
import { animeItemList, breadcrumbList } from '@/lib/structured-data';
import { getQuickWeekData, type AnimeTitle } from '@/lib/tmdb';
import { buildWeeklyCalendar } from '@/lib/weekly-calendar';
import { getWeeklyRatings } from '@/lib/weekly-ratings';
import { withIdentityFallback } from '@/lib/weekly-id-fallback';
import { formatWeek, isoWeek } from '@/lib/week';

export const revalidate = 21600;
export const dynamic = 'error';
export async function generateMetadata({ params }: { params?: LocaleParams }) {
  return landingMetadata('week', await getRequestLocale(params));
}
export default async function ThisWeek({ params }: { params?: LocaleParams }) {
  const locale = await getRequestLocale(params); const d = getDictionary(locale);
  const now = new Date(); const week = isoWeek(now); const slug = formatWeek(week);
  const [data, liveSnapshot] = await Promise.all([getQuickWeekData(week, 'en'), getWeeklyRatings(slug)]);
  const snapshot = await withIdentityFallback(slug, liveSnapshot);
  const titles = data.titles.map(title => ({ ...title, ratings: snapshot.titles[`${title.kind}:${title.id}`] ?? title.ratings }));
  const calendar = buildWeeklyCalendar(titles, snapshot.events, week, snapshot.episodes?.entries);
  const heading = landingHeading('week', locale, now);
  const dateFormat = new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
  const numberFormat = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 });
  function row(title: AnimeTitle, key: string) {
    const { primary, others } = landingProviders(snapshot.availability?.titles[`${title.kind}:${title.id}`], snapshot.availability?.providers, locale);
    return <li key={key}><LandingCard locale={locale} href={animeDetailLink(title)} name={title.name} poster={title.poster ? `https://image.tmdb.org/t/p/w342${title.poster}` : null} typeLabel={title.kind === 'movie' ? d.week.movie : d.week.tv} ratings={ratingSources(title.ratings).map(source => `${source.name} ${numberFormat.format(source.score)}/10`).join(' · ')} primary={primary} others={others} /></li>;
  }
  return <main id="main" className="catalog-page" lang={locale}>
    <JsonLd data={animeItemList(titles.map(title => ({ name: title.name, anilistId: title.ratings.anilistId })), locale, { name: heading, path: "/this-week" })} />
    <JsonLd data={breadcrumbList([{ name: d.landings.home, path: '/' }, { name: heading, path: '/this-week' }], locale)} />
    <h1>{heading}</h1><p className="catalog-intro">{d.landings.weekDescription}</p>
    <nav className="catalog-filters"><Link href="/rankings/this-week">{d.rankings.nav}</Link><Link href={`/week/${slug}`}>{d.landings.fullGuide}</Link><Link href="/">{d.landings.home}</Link><Link href="/best-this-season">{d.landings.bestNav}</Link></nav>
    {calendar.days.filter(day => day.releases.length).map(day => <section key={day.date} className="landing-day"><h2><time dateTime={day.date}>{dateFormat.format(new Date(`${day.date}T12:00:00Z`))}</time></h2><ul className="landing-list">{day.releases.map((release, index) => row(release.anime, `${release.anime.kind}:${release.anime.id}:${index}`))}</ul></section>)}
    {calendar.undated.length > 0 && <section className="landing-day"><h2>{d.landings.undated}</h2><ul className="landing-list">{calendar.undated.map(title => row(title, `${title.kind}:${title.id}`))}</ul></section>}
    {!titles.length && <div className="empty-state"><p>{d.landings.weekEmpty}</p></div>}
  </main>;
}
