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

Optionally get a free OMDb key at [omdbapi.com/apikey.aspx](https://www.omdbapi.com/apikey.aspx) and set `OMDB_API_KEY`. The free plan permits 1,000 requests per day. Without this key, IMDb rating, IMDb votes and Metascore show `n/a`, with an explanatory note. Missing IDs, unavailable ratings and failed OMDb lookups also show `n/a`.

## Data and calendar

- `/` shows the current ISO week, calculated in UTC. `/week/2026-42` covers Monday, October 12 through Sunday, October 18, 2026. Previous and next links handle ISO year boundaries. Invalid week identifiers return a 404.
- TV discovery uses `with_genres=16`, `with_origin_country=JP` and `air_date.gte/lte`. Movies use the same genre/country filters and `primary_release_date.gte/lte`. This is a Japanese animation guide based on TMDB classifications, not a curated anime database. TV results include existing series airing during the week; their first-air date is not presented as a weekly release date.
- Fetches read at most two discovery pages per category, interleave TV and movie results, deduplicate by media type and ID, and cap total titles at 40. It is a bounded selection, not an exhaustive calendar.
- Ratings use TMDB `external_ids` → IMDb ID → OMDb `i` lookup. TMDB popularity/vote averages are never substituted for IMDb ratings.
- “If you liked X” uses the first real title from TMDB recommendations, falling back to similar. It is hidden if neither supplies a title.
- Watch availability combines and deduplicates `flatrate`, `free` and `ads` providers, with logos linking to the exact regional TMDB watch page. Rental and purchase providers are excluded. The supported regions are defined once in `lib/config.ts`: IT, US, GB, FR, DE, JP. Availability is current, not a historical snapshot or a guarantee of episode availability.
- Upstream failures produce an unavailable state, partial discovery notice, or missing optional fields. No fake data is used.

## Caching and Vercel Hobby

Both weekly pages export `revalidate = 604800`. All API fetches cache for seven days with the `anime-week` tag, including OMDb. Historical week pages are generated on demand and use ISR. The home page is refreshed by the Monday cron so it changes to the new week; without a cron it can remain cached until the seven-day interval expires.

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

The cap limits one uncached week to at most 40 OMDb calls; seven-day caching reduces repeats. It is **not a global daily quota**: many distinct week visits can exceed OMDb's free allowance. For heavier public traffic, add a persistent daily quota or upgrade OMDb. API timeouts and five-title enrichment batches bound upstream fan-out.

## Checks

```sh
npm run lint
npm test
npm run build
```

Vitest covers ISO week ranges, year boundaries, strict week parsing/formatting, navigation and missing rating/vote formatting. Build and render work without any environment keys. Live API behavior requires credentials.

## Extending

All UI copy is in `messages/en.json`; `lib/i18n.ts` exposes `getDictionary(locale)`, `defaultLocale` and `locales`. Add an Italian dictionary, locale entry and lookup to extend the content system; locale-specific URLs are not implemented in this MVP. Data titles and provider names remain upstream source content.

`components/SponsorSlot.tsx` is an unobtrusive placeholder. `components/ProviderLink.tsx` calls `lib/affiliate.ts`; no affiliate is enabled, but an explicit optional query parameter can be passed later.

Credits appear in the footer: TMDB disclaimer, JustWatch streaming attribution and OMDb rating credit.

API references: [TMDB TV discovery](https://developer.themoviedb.org/reference/discover-tv), [movie discovery](https://developer.themoviedb.org/reference/discover-movie), [watch providers](https://developer.themoviedb.org/reference/tv-series-watch-providers), [OMDb](https://www.omdbapi.com/), [Next.js tag revalidation](https://nextjs.org/docs/app/api-reference/functions/revalidateTag), [Vercel cron limits](https://vercel.com/docs/cron-jobs/usage-and-pricing).

## Verification status in the supplied workspace

Dependency installation was attempted twice and blocked by DNS/network access (`EAI_AGAIN registry.npmjs.org`). Consequently, the requested lint, Vitest and no-credentials production build were attempted but could not run with project dependencies. No package lock could be generated. These checks still need to pass after npm access is restored.

As a supplemental check, all 21 TypeScript/TSX source files parsed successfully with the installed Babel tooling. Standalone assertions against the actual calendar/rating functions passed, including valid ISO weeks for 1990–2040, year transitions, invalid week identifiers and missing ratings. This does not replace TypeScript checking, ESLint, Vitest or a Next.js production build.
