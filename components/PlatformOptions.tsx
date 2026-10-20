'use client';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { getDictionary } from '@/lib/i18n';
import { useLocale } from '@/components/LanguageSelector';
import { useStreamingCountry } from '@/components/StreamingCountry';
import { POPULAR_PLATFORMS } from '@/lib/title-filters';

// Lets a platform select placed outside the results (the search form) use the
// platforms found in those results. Filtering itself stays in SeasonContent.
type Options = { platforms: [string, string][]; pending: boolean };
const PlatformOptionsContext = createContext<{ options: Options; setOptions: (options: Options) => void } | null>(null);

export function PlatformOptionsProvider({ children }: { children: ReactNode }) {
  const [options, setOptions] = useState<Options>({ platforms: [], pending: true });
  return <PlatformOptionsContext.Provider value={{ options, setOptions }}>{children}</PlatformOptionsContext.Provider>;
}

export function usePublishPlatformOptions(platforms: [string, string][], pending: boolean): boolean {
  const context = useContext(PlatformOptionsContext);
  const key = JSON.stringify(platforms);
  const setOptions = context?.setOptions;
  useEffect(() => { setOptions?.({ platforms: JSON.parse(key) as [string, string][], pending }); }, [setOptions, key, pending]);
  return Boolean(context);
}

export function SearchPlatformSelect() {
  const dictionary = getDictionary(useLocale());
  const context = useContext(PlatformOptionsContext);
  const { platformFilter, setPlatformFilter } = useStreamingCountry();
  const choices = [...new Map([...POPULAR_PLATFORMS, ...(context?.options.platforms ?? [])]).entries()];
  // No `name`: applies instantly to the visible results and is not submitted.
  return <label>{dictionary.features.platform}<select value={platformFilter} aria-busy={context?.options.pending} onChange={event => setPlatformFilter(event.target.value)}>
    <option value="">{dictionary.features.all}</option>{choices.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
  </select></label>;
}
