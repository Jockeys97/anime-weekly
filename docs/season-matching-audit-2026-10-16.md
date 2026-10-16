# Season identity audit — 2026-10-16

Status: local changes only; do not push, create a remote PR or deploy until the
user explicitly writes **"pubblica"**. Preview builds also consume Vercel quota.

## Scope and evidence

Inspected 204 unique AniList records: the first 50 TV/TV_SHORT/ONA results for
fall 2026, summer 2026 and popularity, plus their prequel chains. The public
GraphQL records were collected on 2026-10-16. There are 65 records with TV/ONA
prequels in this sample. The resolver now follows 58 chains; the remaining seven
correctly retain separate identities: One Piece, Naruto Shippuden, Dragon Ball Z,
Dragon Ball Super: Beerus, Magical Girl Raising Project restart, Steel Ball Run
first stage and the first Thousand-Year Blood War installment.

This checks identity resolution, not worldwide subscription availability or a
live IMDb score for every title. TMDB credentials were not available in this
isolated checkout, so end-to-end provider/IMDb tests use explicit offline
fixtures. No OMDb requests or daily IMDb dataset collection were triggered.

## Corrections

- Recognize `Cour 2` as well as `2nd Cour`. This repairs the multi-season
  Mushoku Tensei chain without removing numbers inside a story title.
- Treat a final `(TV)` as catalog metadata only for TV lookup. This repairs
  the Demon Slayer Mugen Train TV chain and the JoJo 2012 root without turning
  a film into a TV season or removing remake-year checks.
- Use explicitly reviewed AniList ID groups for named JoJo and TYBW arcs.
  Still require actual PREQUEL edges, supported formats, unambiguous parents,
  monotonic chronology and the root's known premiere year.
- Stop TYBW at its own 2022 series, rather than inheriting Bleach 2004 offers.
  Keep Steel Ball Run outside the JoJo 2012 group. Keep Naruto Shippuden,
  Dragon Ball Z, and Magical Girl Raising Project restart as separate series.
- Share the same resolver between detail/card IMDb enrichment and provider-only
  seasonal filters. Provider-only requests skip IMDb/OMDb and anime ratings.
- Preserve separate exact-season and series-level regional providers, including
  the correct TMDB identity and series attribution in early card rendering.
- Do not cache a missing platform identity as a successful empty platform list.
  The next authorized release also changes the relevant cache/request versions.

## Regression coverage

`tests/fixtures/season-families.json` retains 45 minimal public AniList records
and 33 manually reviewed expected root/separate-identity cases. Tests cover:

- Real prequel chains, cycles, ambiguity, missing parents, wrong returned IDs,
  future parents, and movie/series boundaries.
- IMDb and regional streaming using the same root for Ranma, Mushoku Tensei,
  Demon Slayer, TYBW, and Stone Ocean.
- Provider-only requests making no IMDb or external-ID calls.
- Exact-season offers taking precedence, no cross-country inheritance, early
  series attribution, and retry after a failed platform identity lookup.

Named-arc identity sources reviewed:

- [TYBW IMDb entry](https://www.imdb.com/title/tt14986406/)
- [JoJo 2012 IMDb entry](https://www.imdb.com/title/tt2359704/)
- [JoJo Netflix series](https://www.netflix.com/title/80179831)
- [VIZ Stone Ocean — Season 5](https://www.viz.com/anime/tv-show/jojo-s-bizarre-adventure-video/video-unit/134)
- [Magical Girl Raising Project restart — separate IMDb entry](https://www.imdb.com/title/tt39240299/)

## Release handoff

Checkout: `/private/tmp/anime-weekly-search-imdb`, branch
`codex/season-matching-audit`, based on main's Ranma fix (`4460089`).
Changes are uncommitted and unpushed. Preserve them and batch with any other
ready changes only after the user explicitly requests publication. Run the
local checks, review the complete combined diff and then perform one release.
Do not create previews for each individual fix.

Validation: 792 tests passed; TypeScript, ESLint and production build passed.
