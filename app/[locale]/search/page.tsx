import type { LocaleParams } from '@/lib/request-locale';
import type { SearchParams } from '@/lib/anime-search';
import { SearchView, searchMetadata } from '@/components/SearchView';
export async function generateMetadata({ searchParams, params }: { params?: LocaleParams; searchParams: Promise<SearchParams> }) {
  return searchMetadata({ query: await searchParams, params });
}
// Query-dependent HTML must not become an on-demand static locale page.
// Unlike force-dynamic, revalidate=0 preserves explicitly cached API fetches.
export const revalidate = 0;
export default async function SearchPage({ searchParams, params }: { params?: LocaleParams; searchParams: Promise<SearchParams> }) {
  return <SearchView query={await searchParams} params={params} />;
}
