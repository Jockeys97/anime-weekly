import { Suspense } from 'react';
import { WeeklyContent } from '@/components/WeeklyContent';
import { WeeklyHeadingContent, WeeklyScopeContent } from '@/components/WeeklyIntro';
import { NewsletterSignup } from '@/components/NewsletterSignup';
import type { Locale } from '@/lib/locales';
import { getDictionary } from '@/lib/i18n';
import { getQuickWeekData } from '@/lib/tmdb';
import { getWeeklyRatings, trackWeeklyPage } from '@/lib/weekly-ratings';
import { formatWeek, type ISOWeek } from '@/lib/week';
import { JsonLd } from '@/components/JsonLd';
import { animeItemList } from '@/lib/structured-data';
import { readWeekArchive } from '@/lib/week-archive';
export function WeeklyGuide({ week, newsletter = false, archive = false, locale = 'it' }: { week: ISOWeek; locale?: Locale; newsletter?: boolean; archive?: boolean }) {
  return <main id="main">
    <WeeklyHeadingContent week={week} archive={archive} locale={locale} />
    {newsletter && <NewsletterSignup />}
    <section className="guide" aria-labelledby="releases-heading">
      <Suspense fallback={<p className="calendar-note" role="status">{getDictionary(locale).loading}</p>}>
        <WeeklyCatalog week={week} locale={locale} />
      </Suspense>
      <WeeklyScopeContent locale={locale} />
    </section><aside className="sponsor"><span className="eyebrow">{getDictionary(locale).sponsor.label}</span><p>{getDictionary(locale).sponsor.body}</p><span aria-hidden="true">✦</span></aside>
  </main>;
}
async function WeeklyCatalog({ week, locale }: { week: ISOWeek; locale: Locale }) {
  // Serialize each title once. Scores and matches are read-only cache lookups;
  // a cold snapshot never starts enrichment or delays the HTML with rating APIs.
  const archived = await readWeekArchive(week);
  const [data, snapshot] = archived ? [archived.data, archived.ratings] : await Promise.all([getQuickWeekData(week, 'en'), getWeeklyRatings(formatWeek(week)), trackWeeklyPage()]);
  const initial = { ...data, titles: data.titles.map(title => ({ ...title, ratings: snapshot.titles[`${title.kind}:${title.id}`] || {} })) };
  return <><JsonLd data={animeItemList(initial.titles.map(title => ({ name: title.name, anilistId: title.ratings.anilistId })), locale, { name: getDictionary(locale).week.label, path: `/week/${formatWeek(week)}` })} />
    <WeeklyContent key={`${week.year}-${week.week}`} initial={initial} initialAvailability={snapshot.availability} week={week} initialEvents={snapshot.events} initialEpisodes={snapshot.episodes ?? { entries: [], status: 'pending' }} initialCalendar={archived?.calendar} frozen={Boolean(archived)} /></>;
}
