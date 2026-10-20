'use client';

import { useEffect, useRef, useState } from 'react';
import { observeNearViewport } from '@/lib/viewport-observer';
import { RatingSummary } from '@/components/RatingSummary';
import { StreamingAvailability } from '@/components/StreamingAvailability';
import { getDictionary, type Locale } from '@/lib/i18n';
import { invalidateCatalogCard, loadCatalogCard } from '@/lib/catalog-card-client';
import type { CatalogCardSummary } from '@/lib/catalog-card-summary';
import { useCatalogWatch } from '@/components/CatalogWatchContext';

export function CatalogCardExtras({ id, malId, name, score, locale = 'en', initialSummary }: { id: number; malId?: number | null; name: string; score: number | null; locale?: Locale; initialSummary?: CatalogCardSummary }) {
  const container = useRef<HTMLDivElement>(null);
  const [summary, setSummary] = useState<CatalogCardSummary | null>(initialSummary ?? null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const d = getDictionary(locale);
  const earlyWatch = useCatalogWatch(id);
  useEffect(() => {
    if (initialSummary && !attempt) return;
    let mounted = true;
    const controller = new AbortController();
    const load = () => {
      void loadCatalogCard(id, controller.signal).then(data => { if (mounted) setSummary(data); }).catch(() => { if (mounted && !controller.signal.aborted) setFailed(true); });
    };
    const stopObserving = container.current ? observeNearViewport(container.current, load) : undefined;
    return () => { mounted = false; controller.abort(); stopObserving?.(); };
  }, [id, attempt, initialSummary]);
  const pending = !summary && !failed;
  // Seasonal filters already fetched these providers independently of ratings.
  // Show them immediately instead of waiting for the card enrichment queue.
  const availability = earlyWatch && (!summary || summary.availability.providersUnavailable || !Object.keys(summary.availability.providers).length)
    ? earlyWatch : summary?.availability ?? earlyWatch;
  return <div ref={container} className="catalog-card-extras" aria-busy={pending}>
    <RatingSummary ratings={{ malId: malId ?? undefined, ...summary?.ratings, anilistId: id, anilistScore: score, ...(failed ? { imdbStatus: 'error' as const } : {}) }} title={name} locale={locale} imdbLookup={failed ? null : undefined} allowRetry={!initialSummary} />
    {failed && <p className="catalog-enrichment-error" role="status">{d.catalog.enrichmentUnavailable} <button type="button" onClick={() => { invalidateCatalogCard(id); setSummary(null); setFailed(false); setAttempt(value => value + 1); }}>{d.error.retry}</button></p>}
    <StreamingAvailability locale={locale} seriesWatch={availability?.seriesWatch} recoveryId={!initialSummary && (summary || earlyWatch) ? id : undefined} anime={{
      id: availability?.match?.id ?? 0, kind: availability?.match?.kind ?? 'tv', name,
      providers: availability?.providers ?? {},
      providersUnavailable: availability?.providersUnavailable === true || (!availability && failed),
    }} />
  </div>;
}
