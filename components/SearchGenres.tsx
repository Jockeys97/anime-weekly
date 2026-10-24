'use client';

import { useState } from 'react';
import { SEARCH_GENRES, type AnimeFilters } from '@/lib/anime-search';
import { getDictionary, type Locale } from '@/lib/i18n';

export function SearchGenres({ selected, locale }: { selected: AnimeFilters['genres']; locale: Locale }) {
  const [genres, setGenres] = useState(selected);
  const d = getDictionary(locale).explore;
  return <div className="search-genres">
    <span id="search-genres-label">{d.genre}</span>
    <details>
      <summary aria-labelledby="search-genres-label search-genres-value"><span id="search-genres-value">{genres.length ? genres.map(genre => d.genres[genre]).join(' + ') : d.allGenres}</span><span aria-hidden="true">⌄</span></summary>
      <div className="search-genres-options" role="group" aria-labelledby="search-genres-label" aria-describedby="search-genres-hint">
        <p id="search-genres-hint">{d.genresHint}</p>
        {SEARCH_GENRES.map(genre => <label key={genre}><input type="checkbox" name="genre" value={genre} aria-label={d.genres[genre]} checked={genres.includes(genre)} onChange={event => setGenres(current => event.target.checked ? [...current, genre] : current.filter(value => value !== genre))} /><span>{d.genres[genre]}</span></label>)}
      </div>
    </details>
  </div>;
}
