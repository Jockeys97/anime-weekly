'use client';

import { useEffect, useRef, useState } from 'react';
import { RatingSummary } from '@/components/RatingSummary';
import { StreamingAvailability } from '@/components/StreamingAvailability';
import { getDictionary, type Locale } from '@/lib/i18n';
import { invalidateCatalogCard, loadCatalogCard } from '@/lib/catalog-card-client';
import type { CatalogCardSummary } from '@/lib/catalog-card-summary';
import { useCatalogWatch } from '@/components/CatalogWatchContext';

export function CatalogCardExtras({ id, name, score, locale = 'en' }: { id: number; name: string; score: number | null; locale?: Locale }) {
  const container = useRef<HTMLDivElement>(null);
  const [summary, setSummary] = useState<CatalogCardSummary | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const d = getDictionary(locale);
  const earlyWatch = useCatalogWatch(id);
  useEffect(() => {
    let mounted = true;
    const controller = new AbortController();
    let observer: IntersectionObserver | undefined;
    const load = () => {
      observer?.disconnect();
      void loadCatalogCard(id, controller.signal).then(data => { if (mounted) setSummary(data); }).catch(() => { if (mounted && !controller.signal.aborted) setFailed(true); });
    };
    if (typeof IntersectionObserver === 'undefined') load();
    else {
      observer = new IntersectionObserver(entries => {
        if (entries.some(entry => entry.isIntersecting)) load();
      }, { rootMargin: '100px' });
      if (container.current) observer.observe(container.current);
    }
    return () => { mounted = false; controller.abort(); observer?.disconnect(); };
  }, [id, attempt]);
  const pending = !summary && !failed;
  // Seasonal filters already fetched these providers independently of ratings.
  // Show them immediately instead of waiting for the card enrichment queue.
  const availability = summary?.availability.providersUnavailable && earlyWatch
    ? earlyWatch : summary?.availability ?? earlyWatch;
  return <div ref={container} className="catalog-card-extras" aria-busy={pending}>
    <RatingSummary ratings={summary?.ratings ?? { anilistId: id, anilistScore: score, ...(failed ? { imdbStatus: 'error' as const } : {}) }} title={name} locale={locale} pendingImdb={pending} imdbLookup={failed ? null : undefined} />
    {failed && <p className="catalog-enrichment-error" role="status">{d.catalog.enrichmentUnavailable} <button type="button" onClick={() => { invalidateCatalogCard(id); setSummary(null); setFailed(false); setAttempt(value => value + 1); }}>{d.error.retry}</button></p>}
    <StreamingAvailability locale={locale} loading={pending && !earlyWatch} seriesWatch={summary?.availability.seriesWatch} recoveryId={summary || earlyWatch ? id : undefined} anime={{
      id: availability?.match?.id ?? 0, kind: availability?.match?.kind ?? 'tv', name,
      providers: availability?.match ? availability.providers : {},
      providersUnavailable: availability?.providersUnavailable === true || (!availability && failed),
    }} />
  </div>;
}
