import { DubbingStatus } from '@/components/DubbingStatus';
import { getDubbing } from '@/lib/mydublist';
import type { Locale } from '@/lib/locales';
export async function DubbingSummary({ malId, locale, followLocale = false }: { malId?: number | null; locale: Locale; followLocale?: boolean }) {
  const initial = await getDubbing(malId, locale);
  return <DubbingStatus malId={malId} locale={locale} initial={initial} followLocale={followLocale} />;
}
