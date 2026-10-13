'use client';

import { useEffect, useRef, useState } from 'react';
import { RatingSummary } from '@/components/RatingSummary';
import { StreamingAvailability } from '@/components/StreamingAvailability';
import { getDictionary, type Locale } from '@/lib/i18n';
import { loadCatalogCard } from '@/lib/catalog-card-client';
import type { CatalogCardSummary } from '@/lib/catalog-card-summary';

export function CatalogCardExtras({ id, name, score, locale = 'en' }: { id: number; name: string; score: number | null; locale?: Locale }) {
  const container = useRef<HTMLDivElement>(null);
  const [summary, setSummary] = useState<CatalogCardSummary | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const d = getDictionary(locale);
  useEffect(() => {
    let mounted = true;
    let observer: IntersectionObserver | undefined;
    const load = () => {
      observer?.disconnect();
      void loadCatalogCard(id).then(data => { if (mounted) setSummary(data); }).catch(() => { if (mounted) setFailed(true); });
    };
    if (typeof IntersectionObserver === 'undefined') load();
    else {
      observer = new IntersectionObserver(entries => {
        if (entries.some(entry => entry.isIntersecting)) load();
      }, { rootMargin: '100px' });
      if (container.current) observer.observe(container.current);
    }
    return () => { mounted = false; observer?.disconnect(); };
  }, [id, attempt]);
  const pending = !summary && !failed;
  return <div ref={container} className="catalog-card-extras" aria-busy={pending}>
    <RatingSummary ratings={summary?.ratings ?? { anilistId: id, anilistScore: score }} title={name} locale={locale} pendingImdb={pending} />
    {failed && <p className="catalog-enrichment-error" role="status">{d.catalog.enrichmentUnavailable} <button type="button" onClick={() => { setFailed(false); setAttempt(value => value + 1); }}>{d.error.retry}</button></p>}
    <StreamingAvailability locale={locale} loading={pending} anime={{
      id: summary?.availability.match?.id ?? 0, kind: summary?.availability.match?.kind ?? 'tv', name,
      providers: summary?.availability.match ? summary.availability.providers : {},
      providersUnavailable: failed || summary?.availability.providersUnavailable === true,
    }} />
  </div>;
}
