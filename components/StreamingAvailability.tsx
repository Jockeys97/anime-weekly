'use client';

import Image from 'next/image';
import { useLocale } from '@/components/LanguageSelector';
import { useEffect, useState } from 'react';
import { getDictionary } from '@/lib/i18n';
import type { AnimeTitle } from '@/lib/tmdb';
import { providerWatchLink } from '@/lib/provider-watch-link';
import { ProviderLink } from '@/components/ProviderLink';
import { useStreamingCountry } from '@/components/StreamingCountry';

export function StreamingAvailability({ anime, seriesWatch, recoveryId, locale = 'en', collapsible = true, loading = false, followLocale = false }: { anime: Pick<AnimeTitle, 'id' | 'kind' | 'name' | 'providers' | 'providersUnavailable'>; seriesWatch?: Pick<AnimeTitle, 'id' | 'kind' | 'name' | 'providers' | 'providersUnavailable'>; recoveryId?: number; locale?: string; collapsible?: boolean; loading?: boolean; followLocale?: boolean }) {
  const selectedLocale = useLocale();
  locale = followLocale ? selectedLocale : locale;
  const { region } = useStreamingCountry();
  const d = getDictionary(locale);
  const useSeries = !anime.providers[region]?.providers.length && Boolean(seriesWatch?.providers[region]?.providers.length);
  const base = useSeries && seriesWatch ? seriesWatch : anime;
  type Recovery = typeof base & { series?: boolean; recovered?: boolean };
  const key = `${recoveryId}:${region}`;
  const [results, setResults] = useState<Record<string, Recovery | null>>({});
  const needsRecovery = Boolean(recoveryId && !base.providers[region]?.providers.length && !loading);
  const recovered = needsRecovery ? results[key] : null;
  useEffect(() => {
    if (!needsRecovery || key in results) return;
    const controller = new AbortController();
    fetch(`/api/streaming-recovery?anime=${recoveryId}&region=${region}`, { signal: controller.signal })
      .then(response => response.ok ? response.json() : null)
      .then(data => { if (!controller.signal.aborted) setResults(previous => ({ ...previous, [key]: data?.providers ? data : null })); })
      .catch(() => { if (!controller.signal.aborted) setResults(previous => ({ ...previous, [key]: null })); });
    return () => controller.abort();
  }, [needsRecovery, key, recoveryId, region, results]);
  const source = recovered || base;
  const availability = source.providers[region];
  const pending = needsRecovery && !(key in results);
  const content = <>
    {(useSeries || recovered?.series) && <p className="streaming-note" role="note"><strong>{d.title.seriesWatch}: {source.name}.</strong> {d.title.seriesWatchNote}</p>}
    {recovered?.recovered && availability?.link && <p className="streaming-note"><a href={availability.link} target="_blank" rel="noopener noreferrer">{d.title.recoveredWatchSource} ↗</a></p>}
    <p className="streaming-note">{d.title.streamingLinksNote}</p>
    <div className="region-list"><div className="region"><span>{d.regions[region]}</span><div>
      {loading || pending ? <p role="status">{d.catalog.loadingAvailability}</p> : availability?.providers.length ? availability.providers.map(provider => <ProviderLink key={provider.provider_id}
        href={provider.watch_url || providerWatchLink(source.kind, source.id, region, provider.provider_id)}
        label={`${source.name} · ${provider.provider_name} · ${d.regions[region]} · ${d.title.watch}`}>
        {provider.logo_path && <Image src={`https://image.tmdb.org/t/p/w92${provider.logo_path}`} alt="" width={24} height={24} />}
        <span>{provider.provider_name}</span><span className="provider-external" aria-hidden="true">↗</span>
      </ProviderLink>) : <p>{anime.providersUnavailable ? d.state.providersError : d.title.noWatchData}</p>}
    </div></div></div>
  </>;
  return collapsible ? <details className="streaming"><summary>{d.title.streaming}<span className="streaming-country-name">{d.regions[region]}</span><span className="streaming-toggle" aria-hidden="true">＋</span></summary>{content}</details> : <div className="streaming streaming-static">{content}</div>;
}
