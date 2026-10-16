# Combined release — 2026-10-16

Authorized by the user's explicit request to publish on weeklyanime.com, including pending work from other chats.

## Included

- Season identity audit: conservative series roots for IMDb and country-specific streaming; shared identity resolution in filters, early-card links, remake years, TV labels and cours; verified JoJo/TYBW boundaries.
- MyAnimeList work from `anime-weekly-mal-score`: dedicated tile, source links and vote counts, shared rate limit and validated daily cache, retryable Jikan errors, all six languages. Cached scores render server-side; absent scores are never estimated.
- Trakt dashboard PR #57: anime-only identity checks, poster/calendar cards, private viewing statistics and bounded/resumable imports, refresh cooldown and protected account caches. Keep the canonical-domain OAuth callback code from main.
- Vercel Git deployments enabled on main only. Feature branches no longer create automatic preview deployments; an explicit publication instruction is still required by AGENTS.md.

## Preserved from main

Canonical weeklyanime.com, legacy redirects, sitemap/metadata and snapshot-backed SSR, Ko-fi configuration, daily IMDb collection and quota controls. Existing calendar/day styling, SVG favorites/calendar actions, safe OAuth diagnostics, country search and verified direct watch destinations were already integrated and were not re-applied from older dirty checkouts. The old platform-filter commit was superseded by later streaming preference and source-sharing changes.

All source checkouts were inspected read-only and left intact. No environment secrets or generated preview pages were imported. This release was assembled in an isolated checkout at `/private/tmp/anime-weekly-combined-release`.

Validation: full tests, TypeScript, lint and production build; record the final outcomes in the release response. Full authenticated Trakt sign-in requires the user's account interaction and is not implied by passing offline tests.
