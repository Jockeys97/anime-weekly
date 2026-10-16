# MyAnimeList score — local implementation

Status: implemented and tested locally on `codex/myanimelist-score`, based on main `4460089`. No push, pull request, or Vercel deployment was started. Work lives in `work/anime-weekly-mal-score`, separate from the ongoing season-matching audit.

The shared rating summary now displays IMDb, AniList, and MyAnimeList independently. Catalog cards carry their exact AniList-provided MAL ID into the third tile. Weekly cards reuse their stored MAL score or resolve the exact MAL ID from their confirmed AniList ID. Detail pages preserve the existing streamed rating lookup and display both anime-rating sources.

`GET /api/myanimelist?mal=<id>` (or `?anilist=<id>`) returns only the selected anime's MAL score. A shared Jikan queue enforces 1.1-second spacing, with bounded requests. Validated successful and genuinely unrated responses are cached for 24 hours; outages/malformed/mismatched responses return a retryable, non-cacheable error. Browser requests are lazy, deduplicated, and independent of IMDb. Members are never labelled as votes; `scored_by` is used when present.

## Verification

- 770 tests passed across 78 files; TypeScript, ESLint and production build passed. Logs: `/tmp/anime-mal-tests.log`, `/tmp/anime-mal-build.log`.
- UI checked locally for three-source rendering, error handling, retry and narrow-screen layout.
- Live AniList mapping confirmed for A Wild Last Boss Appeared!: AniList 180523 → MAL 59644.
- Jikan requests timed out from this computer during verification. Live MAL retrieval still needs confirmation in the target deployment; visual success state uses labelled test data, never an invented real score.

Integration touches shared rating components, the detail page, catalog extras, rating types, locale messages, CSS, and the Jikan queue. It does not change season/series identity resolution or streaming availability. Preserve concurrent changes when bringing it into the release batch.
