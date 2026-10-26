import { notFound } from 'next/navigation';
import type { LocaleParams } from '@/lib/request-locale';
import type { SearchParams } from '@/lib/anime-search';
import { SearchView, searchMetadata } from '@/components/SearchView';
import { isSearchPreset, presetSearchParams } from '@/lib/search-presets';

// /search/hentai and /search/mild-nudity: clean, indexable paths that render
// Search with the matching MAL content filter (no redirect, own canonical).
type Props = { params: Promise<{ locale?: string; preset: string }>; searchParams: Promise<SearchParams> };
async function presetQuery({ params, searchParams }: Props) {
  const { preset } = await params;
  if (!isSearchPreset(preset)) notFound();
  return presetSearchParams(preset, await searchParams);
}
export async function generateMetadata(props: Props) {
  return searchMetadata({ query: await presetQuery(props), params: props.params as LocaleParams });
}
export const revalidate = 0;
export default async function SearchPresetPage(props: Props) {
  return <SearchView query={await presetQuery(props)} params={props.params as LocaleParams} />;
}
