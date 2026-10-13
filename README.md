# Anime Weekly

An English, mobile-first weekly anime guide built with Next.js App Router, TypeScript, Tailwind CSS and ESLint. No sample releases or estimated ratings are displayed.

## Run locally

Requires Node.js 20.9+ (Node.js 22 LTS recommended).

```sh
npm install
cp .env.example .env.local
npm run dev
```

Visit http://localhost:3000. Without API credentials, the build succeeds and the guide displays **Data source not configured**. Secrets are server-only: never prefix them with `NEXT_PUBLIC_`.

Get a TMDB key or read token at [themoviedb.org/settings/api](https://www.themoviedb.org/settings/api). Set either `TMDB_API_KEY` (v3 `api_key` query) or `TMDB_READ_TOKEN` (Bearer authentication; takes precedence).

Optionally get a free OMDb key at [omdbapi.com/apikey.aspx](https://www.omdbapi.com/apikey.aspx) and set `OMDB_API_KEY`. The free plan permits 1,000 requests per day. Without this key, IMDb rating and IMDb votes show `n/a`, with an explanatory note. Missing IDs, unavailable ratings and failed OMDb lookups also show `n/a`.

## Data and calendar

- `/` shows the current ISO week, calculated in UTC. `/week/2026-42` covers Monday, October 12 through Sunday, October 18, 2026. Previous and next links handle ISO year boundaries. Invalid week identifiers return a 404.
- TV discovery uses `with_genres=16`, `with_origin_country=JP` and `air_date.gte/lte`. Movies use the same genre/country filters and `primary_release_date.gte/lte`. This is a Japanese animation guide based on TMDB classifications, not a curated anime database. TV results include existing series airing during the week; their first-air date is not presented as a weekly release date.
- Fetches read at most two discovery pages per category, interleave TV and movie results, deduplicate by media type and ID, and cap total titles at 40. It is a bounded selection, not an exhaustive calendar.
- IMDb ratings use TMDB `external_ids` → IMDb ID → OMDb `i` lookup. TMDB popularity/vote averages are never substituted for IMDb ratings.
- Anime scores require a conservative AniList GraphQL match: search TMDB original_name/original_title first, then name/title. Only ANIME with TV, TV_SHORT or ONA for TV, or MOVIE for movies, qualifies. Normalized exact matches against romaji, English, native titles or synonyms are required; when TMDB first_air_date/release_date supplies a year, AniList startDate must be within ±1 year. Original-title matches and closer years rank first; equally good distinct matches are rejected. No fuzzy guesses are used.
- Matched AniList idMal values are looked up through Jikan for MyAnimeList score and members, displayed as `MAL 8.12 · 1.2M members`. Missing member counts are omitted. If the MAL score is unavailable, the actual AniList averageScore appears as `AniList 81%`; otherwise `n/a`. Neither service needs a key, and these scores work without OMDb.
- “If you liked X” uses the first real title from TMDB recommendations, falling back to similar. It is hidden if neither supplies a title.
- Watch availability combines and deduplicates `flatrate`, `free` and `ads` providers, with provider buttons opening country-specific title links through `/api/watch`. Rental and purchase providers are excluded. The supported regions are defined once in `lib/config.ts`: IT, US, GB, FR, DE, JP. Availability is current, not a historical snapshot or a guarantee of episode availability.
- Upstream failures produce an unavailable state, partial discovery notice, or missing optional fields. No fake data is used.

## Caching and Vercel Hobby

Both weekly pages export `revalidate = 604800`. All API fetches cache for seven days with the `anime-week` tag, including OMDb, AniList and Jikan. AniList POST requests explicitly use `cache: 'force-cache'` with the same revalidation interval and tag. Historical week pages are generated on demand and use ISR. The home page is refreshed by the Monday cron so it changes to the new week; without a cron it can remain cached until the seven-day interval expires.

Import this repository into Vercel: the Next.js defaults require no custom build configuration. Set credentials and a long random `CRON_SECRET` in **Vercel Project Settings > Environment Variables**, or with:

```sh
vercel env add TMDB_API_KEY
vercel env add OMDB_API_KEY
vercel env add CRON_SECRET
```

Redeploy after changing environment variables. `vercel.json` schedules `0 6 * * 1` (Monday 06:00 UTC) at `/api/revalidate`, within Hobby's daily cron limit. Vercel sends `Authorization: Bearer <CRON_SECRET>`. The route returns 401 for absent/incorrect authorization, or 500 if the secret is unset. It immediately expires tagged data and invalidates the home and week page paths; the next visit regenerates them.

Manual check (with a running server and the variable exported in your shell):

```sh
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/revalidate
```

The cap limits one uncached week to at most 40 OMDb calls; seven-day caching reduces repeats. It is **not a global daily quota**: many distinct week visits can exceed OMDb's free allowance. For heavier public traffic, add a persistent daily quota or upgrade OMDb. API timeouts and five-title enrichment batches bound upstream fan-out. Separate process-local queues serialize AniList and Jikan calls with at least 700ms and 400ms between starts, respectively. HTTP 429 responses honor Retry-After (seconds or HTTP date) with exponential backoff, up to three total attempts. Optional lookup failures never fail the page. These queues do not coordinate separate server processes; cold weeks may take longer to populate.

## Checks

```sh
npm run lint
npm test
npm run build
```

Vitest covers ISO week ranges, year boundaries, strict week parsing/formatting, navigation, conservative anime matching, score/member/vote formatting, and mocked lookup caching, throttling, retries and failure recovery. Build and render work without any environment keys. Live TMDB and OMDb behavior requires credentials; live AniList and Jikan checks require network access.

## Extending

All UI copy is in `messages/en.json`; `lib/i18n.ts` exposes `getDictionary(locale)`, `defaultLocale` and `locales`. Add an Italian dictionary, locale entry and lookup to extend the content system; locale-specific URLs are not implemented in this MVP. Data titles and provider names remain upstream source content.

`components/SponsorSlot.tsx` is an unobtrusive placeholder. `components/ProviderLink.tsx` calls `lib/affiliate.ts`; no affiliate is enabled, but an explicit optional query parameter can be passed later.

Credits appear in the footer: TMDB disclaimer, JustWatch streaming attribution, OMDb IMDb rating credit, AniList and MyAnimeList via Jikan.

API references: [TMDB TV discovery](https://developer.themoviedb.org/reference/discover-tv), [movie discovery](https://developer.themoviedb.org/reference/discover-movie), [watch providers](https://developer.themoviedb.org/reference/tv-series-watch-providers), [OMDb](https://www.omdbapi.com/), [AniList GraphQL](https://graphql.anilist.co), [Jikan](https://docs.api.jikan.moe/), [Next.js tag revalidation](https://nextjs.org/docs/app/api-reference/functions/revalidateTag), [Vercel cron limits](https://vercel.com/docs/cron-jobs/usage-and-pricing).

## Verification status in the supplied workspace

All 95 Vitest tests pass, including the existing calendar tests and new offline anime matching, formatting and mocked API tests. ESLint and `tsc --noEmit` also pass with the existing installed dependencies; no dependency installation was needed.

Production build verification remains incomplete in this restricted workspace: the default Turbopack build fails when its CSS worker tries to bind a local port (`Operation not permitted`), and the webpack fallback fails while parsing TypeScript `--showConfig` output. No live upstream calls were made. Run the production build and live API checks in an environment that permits them.

## Rating source links and logos

Rating cards link directly to the matched IMDb, MyAnimeList or AniList title in a new tab. The displayed anime score retains the existing MAL-first/AniList-fallback policy. IMDb links remain available when TMDB supplies an ID even without an OMDb key; unknown IDs render non-clickable cards. Vote counts and MAL members appear beneath their scores.

Brand marks in `public/logos` are bundled from [Simple Icons](https://github.com/simple-icons/simple-icons), distributed under CC0. Brand names and logos remain the property of their respective owners.

## Regional streaming links

Provider buttons call `/api/watch` with the exact TMDB media type, title ID, provider ID and displayed country. On click, the server reads the public regional TMDB watch page and selects its published JustWatch click-out only when the country, provider ID and subscription/free/ad-supported offer match. Original JustWatch URLs and attribution are preserved; rental and purchase offers are excluded. No provider title URLs are guessed and no additional API key is needed.

The watch-page fetch is cached for seven days with the existing revalidation tag and has an eight-second timeout. Missing links, blocked pages, changed markup and upstream failures redirect to the exact regional TMDB watch page. The UI explains that fallback and that access depends on actual location and subscription; clicking a different country does not change account entitlements.

## Streaming country selector

The guide has one country selector, defaulting to United States. Every title displays only the selected country's streaming providers and uses that same country in its provider links. Italy, United States, United Kingdom, France, Germany and Japan remain supported. Selecting a country updates all cards immediately without refetching title data. The root layout keeps the selection during client-side week navigation; a full reload starts with United States. Titles without providers in that country keep the existing unavailable message.
