'use client';

import Image from 'next/image';
import { getDictionary } from '@/lib/i18n';
import type { AnimeTitle } from '@/lib/tmdb';
import { providerWatchLink } from '@/lib/provider-watch-link';
import { ProviderLink } from '@/components/ProviderLink';
import { useStreamingCountry } from '@/components/StreamingCountry';

export function StreamingAvailability({ anime }: { anime: Pick<AnimeTitle, 'id' | 'kind' | 'name' | 'providers' | 'providersUnavailable'> }) {
  const { region } = useStreamingCountry();
  const d = getDictionary();
  const availability = anime.providers[region];
  return <details className="streaming">
    <summary>{d.title.streaming}<span className="streaming-country-name">{d.regions[region]}</span><span className="streaming-toggle" aria-hidden="true">＋</span></summary>
    <p className="streaming-note">{d.title.streamingLinksNote}</p>
    <div className="region-list"><div className="region"><span>{d.regions[region]}</span><div>
      {availability?.providers.length ? availability.providers.map(provider => <ProviderLink key={provider.provider_id}
        href={providerWatchLink(anime.kind, anime.id, region, provider.provider_id)}
        label={`${anime.name} · ${provider.provider_name} · ${d.regions[region]} · ${d.title.watch}`}>
        {provider.logo_path && <Image src={`https://image.tmdb.org/t/p/w92${provider.logo_path}`} alt="" width={24} height={24} />}
        <span>{provider.provider_name}</span><span className="provider-external" aria-hidden="true">↗</span>
      </ProviderLink>) : <p>{anime.providersUnavailable ? d.state.providersError : d.state.noProviders}</p>}
    </div></div></div>
  </details>;
}
