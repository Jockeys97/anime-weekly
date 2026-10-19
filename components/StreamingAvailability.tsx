'use client';

import Image from 'next/image';
import { useLocale } from '@/components/LanguageSelector';
import { useEffect, useState } from 'react';
import { getDictionary } from '@/lib/i18n';
import type { AnimeTitle } from '@/lib/tmdb';
import { providerWatchLink } from '@/lib/provider-watch-link';
import { ProviderLink } from '@/components/ProviderLink';
import { useStreamingDisplay } from '@/lib/streaming-display';
import { useStreamingCountry } from '@/components/StreamingCountry';
import { withTimeout } from '@/lib/async-timeout';

export function StreamingAvailability({ anime, seriesWatch, recoveryId, locale = 'en', collapsible = true, loading = false, followLocale = false }: { anime: Pick<AnimeTitle, 'id' | 'kind' | 'name' | 'providers' | 'providersUnavailable'>; seriesWatch?: Pick<AnimeTitle, 'id' | 'kind' | 'name' | 'providers' | 'providersUnavailable'>; recoveryId?: number; locale?: string; collapsible?: boolean; loading?: boolean; followLocale?: boolean }) {
  const selectedLocale = useLocale();
  locale = followLocale ? selectedLocale : locale;
  const { region } = useStreamingCountry();
  const [showStreaming] = useStreamingDisplay();
  const d = getDictionary(locale);
  const useSeries = !anime.providers[region]?.providers.length && Boolean(seriesWatch?.providers[region]?.providers.length);
  const base = useSeries && seriesWatch ? seriesWatch : anime;
  type Recovery = typeof base & { series?: boolean; recovered?: boolean };
  const key = `${recoveryId}:${region}`;
  type RecoveryResult = { status: 'ready'; data: Recovery | null } | { status: 'error' };
  const [results, setResults] = useState<Record<string, RecoveryResult>>({});
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const needsRecovery = Boolean(recoveryId && !base.providers[region]?.providers.length && !loading);
  const result = needsRecovery ? results[key] : undefined;
  const recovered = result?.status === 'ready' ? result.data : null;
  useEffect(() => {
    if (!needsRecovery || key in results) return;
    const controller = new AbortController();
    const timer = setTimeout(() => setBusyKey(key), 0);
    // A failed request is not proof that the country has no streaming offers.
    // Bound both fetching and reading the body, and let the visitor retry.
    void withTimeout((async () => {
      const response = await fetch(`/api/streaming-recovery?anime=${recoveryId}&region=${region}&logos=v2`, {
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(25000)]),
      });
      if (!response.ok) throw new Error('Streaming recovery unavailable');
      return await response.json() as Recovery;
    })(), 25000)
      .then(data => { if (!controller.signal.aborted) setResults(previous => ({ ...previous, [key]: { status: 'ready', data: data?.providers ? data : null } })); })
      .catch(() => { if (!controller.signal.aborted) setResults(previous => ({ ...previous, [key]: { status: 'error' } })); });
    return () => { clearTimeout(timer); controller.abort(); };
  }, [needsRecovery, key, recoveryId, region, results]);
  const source = recovered || base;
  const availability = source.providers[region];
  const pending = needsRecovery && busyKey === key && !(key in results);
  const content = <>
    {(useSeries || recovered?.series) && <p className="streaming-note" role="note"><strong>{d.title.seriesWatch}: {source.name}.</strong> {d.title.seriesWatchNote}</p>}
    {recovered?.recovered && availability?.link && <p className="streaming-note"><a href={availability.link} target="_blank" rel="noopener noreferrer">{d.title.recoveredWatchSource} ↗</a></p>}
    <p className="streaming-note">{d.title.streamingLinksNote}</p>
    <div className="region-list"><div className="region"><span>{d.regions[region]}</span><div>
      {loading || pending ? <p role="status">{d.catalog.loadingAvailability}</p> : availability?.providers.length ? availability.providers.map(provider => <ProviderLink key={provider.provider_id}
        href={provider.watch_url || providerWatchLink(source.kind, source.id, region, provider.provider_id)}
        label={`${source.name} · ${provider.provider_name} · ${d.regions[region]} · ${d.title.watch}`}>
        {(provider.logo_path || provider.logo_url) && <Image src={provider.logo_path ? `https://image.tmdb.org/t/p/w92${provider.logo_path}` : provider.logo_url!} alt="" width={24} height={24} />}
        <span>{provider.provider_name}</span><span className="provider-external" aria-hidden="true">↗</span>
      </ProviderLink>) : result?.status === 'error' ? <p role="status">n/d · {d.state.providersError} <button type="button" onClick={() => {
        setResults(previous => { const next = { ...previous }; delete next[key]; return next; });
      }}>{d.error.retry}</button></p> : <p>{source.providersUnavailable ? d.state.providersError : d.title.noWatchData}</p>}
    </div></div></div>
  </>;
  return collapsible ? <details className="streaming" open={showStreaming}><summary>{d.title.streaming}<span className="streaming-country-name">{d.regions[region]}</span><span className="streaming-toggle" aria-hidden="true">＋</span></summary>{content}</details> : <div className="streaming streaming-static">{content}</div>;
}
