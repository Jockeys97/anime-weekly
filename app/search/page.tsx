import { connection } from 'next/server';
import { CatalogCard } from '@/components/CatalogCard';
import { SearchBox } from '@/components/SearchBox';
import { searchAnime } from '@/lib/anilist';
import { getDictionary } from '@/lib/i18n';

export const revalidate = 86400;

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string | string[] }> }) {
  await connection();
  const { q } = await searchParams;
  const query = (typeof q === 'string' ? q : '').trim().slice(0, 200);
  const d = getDictionary('it').catalog;
  const results = query ? await searchAnime(query) : [];
  return <main className="catalog-page" lang="it">
    <h1>{d.searchTitle}</h1>
    <SearchBox query={query} id="catalog-search" />
    {query ? <>
      <h2 className="search-results-heading">{d.searchResults} «{query}»</h2>
      {results.length ? <div className="anime-grid">{results.map(anime => <CatalogCard key={anime.id} anime={anime} />)}</div> : <div className="empty-state" role="status"><p>{d.noResults}</p></div>}
    </> : <p className="catalog-intro">{d.searchPrompt}</p>}
  </main>;
}
