'use client';

import { createContext, useContext, useState, type ReactNode } from 'react';
import { STREAMING_REGIONS, type StreamingRegion } from '@/lib/config';
import { getDictionary } from '@/lib/i18n';

const CountryContext = createContext<{ region: StreamingRegion; setRegion: (region: StreamingRegion) => void } | null>(null);
export function StreamingCountryProvider({ children }: { children: ReactNode }) {
  const [region, setRegion] = useState<StreamingRegion>('US');
  return <CountryContext.Provider value={{ region, setRegion }}>{children}</CountryContext.Provider>;
}
export function useStreamingCountry() {
  const country = useContext(CountryContext);
  if (!country) throw new Error('Streaming country provider is missing');
  return country;
}
export function StreamingCountrySelector({ locale = 'en' }: { locale?: string }) {
  const { region, setRegion } = useStreamingCountry();
  const d = getDictionary(locale);
  const regions = ['US', ...STREAMING_REGIONS.filter(country => country !== 'US')] as const;
  return <div className="country-toolbar">
    <div><label htmlFor="streaming-country">{d.title.streamingCountry}</label><p>{d.title.streamingCountryHint}</p></div>
    <select id="streaming-country" value={region} onChange={event => {
      const value = event.target.value as StreamingRegion;
      if (STREAMING_REGIONS.includes(value)) setRegion(value);
    }}>{regions.map(country => <option key={country} value={country}>{d.regions[country]}</option>)}</select>
  </div>;
}
