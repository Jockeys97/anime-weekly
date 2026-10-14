import { Suspense } from 'react';
import { WeeklyHeading, WeeklyContent, WeeklyScope } from '@/components/WeeklyContent';
import { SponsorSlot } from '@/components/SponsorSlot';
import { NewsletterSignup } from '@/components/NewsletterSignup';
import { getDictionary } from '@/lib/i18n';
import { getQuickWeekData } from '@/lib/tmdb';
import { getWeeklyRatings, trackWeeklyPage } from '@/lib/weekly-ratings';
import { formatWeek, type ISOWeek } from '@/lib/week';
export function WeeklyGuide({ week, newsletter = false }: { week: ISOWeek; newsletter?: boolean }) {
  return <main id="main">
    <WeeklyHeading week={week} />
    {newsletter && <NewsletterSignup />}
    <section className="guide" aria-labelledby="releases-heading">
      <Suspense fallback={<p className="calendar-note" role="status">{getDictionary('it').loading}</p>}>
        <WeeklyCatalog week={week} />
      </Suspense>
      <WeeklyScope />
    </section><SponsorSlot />
  </main>;
}
async function WeeklyCatalog({ week }: { week: ISOWeek }) {
  // Serialize each title once. Scores and matches are read-only cache lookups;
  // a cold snapshot never starts enrichment or delays the HTML with rating APIs.
  const [data, snapshot] = await Promise.all([getQuickWeekData(week, 'en'), getWeeklyRatings(formatWeek(week)), trackWeeklyPage()]);
  const initial = { ...data, titles: data.titles.map(title => ({ ...title, ratings: snapshot.titles[`${title.kind}:${title.id}`] || {} })) };
  return <WeeklyContent key={`${week.year}-${week.week}`} initial={initial} week={week} initialEvents={snapshot.events} initialEpisodes={snapshot.episodes} />;
}
