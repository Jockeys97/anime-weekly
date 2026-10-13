'use client';

import Image from 'next/image';
import { getDictionary } from '@/lib/i18n';
import type { AnimeTitle } from '@/lib/tmdb';
import { providerWatchLink } from '@/lib/provider-watch-link';
import { ProviderLink } from '@/components/ProviderLink';
import { useStreamingCountry } from '@/components/StreamingCountry';

export function StreamingAvailability({ anime, seriesWatch, locale = 'en', collapsible = true, loading = false }: { anime: Pick<AnimeTitle, 'id' | 'kind' | 'name' | 'providers' | 'providersUnavailable'>; seriesWatch?: Pick<AnimeTitle, 'id' | 'kind' | 'name' | 'providers' | 'providersUnavailable'>; locale?: string; collapsible?: boolean; loading?: boolean }) {
  const { region } = useStreamingCountry();
  const d = getDictionary(locale);
  const useSeries = !anime.providers[region]?.providers.length && Boolean(seriesWatch?.providers[region]?.providers.length);
  const source = useSeries && seriesWatch ? seriesWatch : anime;
  const availability = source.providers[region];
  const content = <>
    {useSeries && <p className="streaming-note" role="note"><strong>{d.title.seriesWatch}: {source.name}.</strong> {d.title.seriesWatchNote}</p>}
    <p className="streaming-note">{d.title.streamingLinksNote}</p>
    <div className="region-list"><div className="region"><span>{d.regions[region]}</span><div>
      {loading ? <p role="status">{d.catalog.loadingAvailability}</p> : availability?.providers.length ? availability.providers.map(provider => <ProviderLink key={provider.provider_id}
        href={providerWatchLink(source.kind, source.id, region, provider.provider_id)}
        label={`${source.name} · ${provider.provider_name} · ${d.regions[region]} · ${d.title.watch}`}>
        {provider.logo_path && <Image src={`https://image.tmdb.org/t/p/w92${provider.logo_path}`} alt="" width={24} height={24} />}
        <span>{provider.provider_name}</span><span className="provider-external" aria-hidden="true">↗</span>
      </ProviderLink>) : <p>{anime.providersUnavailable ? d.state.providersError : d.state.noProviders}</p>}
    </div></div></div>
  </>;
  return collapsible ? <details className="streaming"><summary>{d.title.streaming}<span className="streaming-country-name">{d.regions[region]}</span><span className="streaming-toggle" aria-hidden="true">＋</span></summary>{content}</details> : <div className="streaming streaming-static">{content}</div>;
}
