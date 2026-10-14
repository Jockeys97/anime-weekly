'use client';

import { createContext, useContext, useId, useState, type ReactNode } from 'react';
import { STREAMING_REGIONS, type StreamingRegion } from '@/lib/config';
import { getDictionary } from '@/lib/i18n';
import { useLocale } from '@/components/LanguageSelector';

const CountryContext = createContext<{ region: StreamingRegion; setRegion: (region: StreamingRegion) => void; platformFilter: string; setPlatformFilter: (platform: string) => void } | null>(null);
export function StreamingCountryProvider({ children }: { children: ReactNode }) {
  const locale = useLocale();
  const [selectedRegion, setRegion] = useState<StreamingRegion | null>(null);
  const [platformFilter, setPlatformFilter] = useState('');
  const region = selectedRegion ?? (locale === 'it' ? 'IT' : 'US');
  return <CountryContext.Provider value={{ region, setRegion, platformFilter, setPlatformFilter }}>{children}</CountryContext.Provider>;
}
export function useStreamingCountry() {
  const country = useContext(CountryContext);
  if (!country) throw new Error('Streaming country provider is missing');
  return country;
}
export function StreamingCountrySelector({ locale = 'en' }: { locale?: string }) {
  const { region, setRegion } = useStreamingCountry();
  const d = getDictionary(locale);
  const [search, setSearch] = useState('');
  const selectorId = useId();
  const searchId = useId();
  const priority: readonly StreamingRegion[] = ['US', 'GB', 'ES', 'FR', 'DE', 'IT', 'JP'];
  const normalize = (value: string) => value.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase(locale).trim();
  const query = normalize(search);
  const regions = [...priority, ...STREAMING_REGIONS.filter(country => !priority.includes(country)).sort((a, b) => normalize(d.regions[a]) < normalize(d.regions[b]) ? -1 : normalize(d.regions[a]) > normalize(d.regions[b]) ? 1 : 0)];
  const matches = regions.filter(country => !query || normalize(d.regions[country]).includes(query) || country.toLowerCase().includes(query));
  const visibleRegions = regions.filter(country => country === region || matches.includes(country));
  return <div className="country-toolbar">
    <div><label htmlFor={selectorId}>{d.title.streamingCountry}</label><p>{d.title.streamingCountryHint}</p></div>
    <div className="country-controls">
      <label className="sr-only" htmlFor={searchId}>{d.title.searchCountry}</label>
      <input id={searchId} type="search" value={search} placeholder={d.title.searchCountry} onChange={event => setSearch(event.target.value)} autoComplete="off" onKeyDown={event => {
        if (event.key === 'Enter' && matches.length === 1) { event.preventDefault(); setRegion(matches[0]); setSearch(''); }
        if (event.key === 'Escape') setSearch('');
      }} />
      {query && matches.length > 0 && <div className="country-search-results">{matches.map(country => <button key={country} type="button" onClick={() => { setRegion(country); setSearch(''); }}>{d.regions[country]}</button>)}</div>}
      <select id={selectorId} value={region} onChange={event => {
      const value = event.target.value as StreamingRegion;
      if (STREAMING_REGIONS.includes(value)) { setRegion(value); setSearch(''); }
    }}>{visibleRegions.map(country => <option key={country} value={country}>{d.regions[country]}</option>)}</select>
      {query && !matches.length && <p className="country-search-status" role="status">{d.title.noMatchingCountry}</p>}
    </div>
  </div>;
}
