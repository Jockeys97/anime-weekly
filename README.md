# Anime Weekly

A multilingual, mobile-first weekly anime guide built with Next.js App Router, TypeScript, Tailwind CSS and ESLint. No sample releases or estimated ratings are displayed.

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
- Anime scores require a conservative AniList GraphQL match: search TMDB original_name/original_title first, then name/title. Only ANIME with TV, TV_SHORT or ONA for TV, or MOVIE for movies, qualifies. Matching normalizes half fractions, accents, punctuation and season suffixes across romaji, English, native titles and synonyms; a unique base-title match may omit a colon subtitle when the year is known; when TMDB first_air_date/release_date supplies a year, AniList startDate must be within ±1 year. Original-title matches and closer years rank first; equally good distinct matches are rejected. No fuzzy guesses are used.
- Matched AniList idMal values are looked up through Jikan for MyAnimeList score and members, displayed as `MAL 8.12 · 1.2M members`. Missing member counts are omitted. If the MAL score is unavailable, the actual AniList averageScore appears as `AniList 81%`; otherwise `n/a`. Neither service needs a key, and these scores work without OMDb.
- “If you liked X” uses the first real title from TMDB recommendations, falling back to similar. It is hidden if neither supplies a title.
- Watch availability combines and deduplicates `flatrate`, `free` and `ads` providers, with provider buttons opening country-specific title links through `/api/watch`. Rental and purchase providers are excluded. The 36 supported regions are defined once in `lib/config.ts`. Availability is current, not a historical snapshot or a guarantee of episode availability.
- Upstream failures produce an unavailable state, partial discovery notice, or missing optional fields. No fake data is used.

## Caching and Vercel Hobby

The home and week routes use static/ISR output with a 15-minute interval; historical routes generate on demand. Their render path never reads request cookies, headers or search parameters. Language/country selection and visitor date formatting run in the browser, with Italian and Europe/Rome defaults. The server sends one compact title list (synopses capped at 900 characters), rather than repeating complete titles and provider maps through nested RSC boundaries. Ratings and default-country streaming providers render in the initial HTML from the cron snapshot. All supported countries are included for immediate browser-side filtering without a provider request. Recommendations, calendar date fallbacks and translated text still load separately after hydration.

The authenticated daily cron precomputes IMDb, AniList and MAL scores plus confirmed AniList IDs and broadcast schedules in one weekly `unstable_cache` snapshot, with `revalidate: 604800` and the independent `weekly-ratings` tag. All catalog, search and detail pages read IMDb scores by exact ID from the shared daily IMDb dataset index, then the preserved cross-week/OMDb cache. Cache keys are independent of the interface language and selected week. Weekly pages read snapshots only: neither page rendering, scrolling nor retries call a rating provider. A cold snapshot shows neutral `n/a` and the localized “No offers found” message; only cron fills ratings and weekly providers. Missing anime scores no longer trigger `/api/weekly-ratings` on a visit. A missing exact IMDb match or genuinely unrated title can still have no score. No new credentials or paid services are needed. Failed raw rating responses are fetched without caching, and error bodies/statuses are never stored in the snapshot. Valid AniList fallback scores survive Jikan failures; quota errors leave IMDb neutral.

Import this repository into Vercel: the Next.js defaults require no custom build configuration. Set credentials and a long random `CRON_SECRET` in **Vercel Project Settings > Environment Variables**, or with:

```sh
vercel env add TMDB_API_KEY
vercel env add OMDB_API_KEY
vercel env add CRON_SECRET
```

Redeploy after changing environment variables. `vercel.json` schedules `0 6 * * 1` (Monday 06:00 UTC) at `/api/revalidate`, within Hobby's daily cron limit. Vercel sends `Authorization: Bearer <CRON_SECRET>`. The route returns 401 for absent/incorrect authorization, or 500 if the secret is unset. It expires discovery data and the home path before warming scores, then invalidates weekly HTML through a separate `weekly-page-output` tag. This order preserves newly written rating snapshots and refreshes all week pages on their next visit. The job is bounded within the 300-second Hobby function limit.

Manual check (with a running server and the variable exported in your shell):

```sh
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/revalidate
```

The 40-title cap and IMDb-ID deduplication limit OMDb requests to at most 40 per weekly cron, independent of visitor traffic. Separate queues serialize AniList and Jikan attempts with at least 800ms and 1100ms between starts, respectively. HTTP 429 responses honor Retry-After (seconds or HTTP date) with exponential backoff, up to three attempts; long cooldowns also suppress subsequent queued calls. Cron 5xx responses retry with backoff. These process-local queues do not coordinate independent server instances. Queued client enrichment, response bodies and retries have deadlines and explicit failure/retry states.

## I miei anime

`/my-anime` è una pagina personale separata, dinamica e non indicizzata. La guida
settimanale, le stagioni e la ricerca mantengono il proprio comportamento di
rendering e cache. Il link **I miei anime** nel menu dipende esclusivamente dalla
configurazione del server, senza leggere cookie nel layout condiviso.

Configura le seguenti variabili sul server (mai con prefisso `NEXT_PUBLIC_`):

| Variabile | Uso |
| --- | --- |
| `AUTH_COOKIE_SECRET` | Obbligatoria: segreto casuale lungo, almeno 32 byte consigliati, per derivare la chiave AES-256-GCM. |
| `TRAKT_CLIENT_ID` | ID dell'applicazione Trakt; abilita il pulsante Trakt. |
| `TRAKT_CLIENT_SECRET` | Facoltativo: le applicazioni Trakt solo PKCE non lo richiedono. Se configurato, viene inviato insieme a PKCE. |
| `MAL_CLIENT_ID` | ID dell'applicazione MyAnimeList; abilita il pulsante MAL. |
| `MAL_CLIENT_SECRET` | Facoltativo, per applicazioni MAL che richiedono un segreto. |

La funzionalità richiede `AUTH_COOKIE_SECRET` e almeno un provider configurato.
Per Trakt basta `TRAKT_CLIENT_ID`, anche senza `TRAKT_CLIENT_SECRET`; MAL rimane
nascosto finché non viene configurato `MAL_CLIENT_ID`.
In caso contrario, `/my-anime` e gli endpoint di autenticazione restituiscono
404 e il menu nasconde il link. Ogni pulsante appare solo con le credenziali del
relativo provider. Ridistribuisci l'app dopo aver modificato la configurazione,
per aggiornare anche il menu delle pagine statiche.

Registra esattamente questi redirect URI nelle applicazioni dei provider per la produzione:

- Trakt: `https://weeklyanime.com/api/auth/trakt/callback`
- MyAnimeList: `https://weeklyanime.com/api/auth/mal/callback`

I redirect vengono calcolati dall'origine della richiesta; quando l'host coincide con il dominio canonico, usano l'origine canonica. Per usare OAuth su host legacy o di anteprima, registra anche i relativi callback: stato e cookie restano sullo stesso host. Usa HTTPS anche per
lo sviluppo OAuth: i cookie sono sempre `Secure`, `HttpOnly` e `SameSite=Lax`.
Trakt usa sempre authorization code con stato casuale e PKCE `S256`, con o senza
client secret; MAL usa PKCE con metodo `plain`, come richiesto dal servizio.
Il `code_verifier` casuale (43–128 caratteri) viene cifrato insieme allo stato nel
cookie `HttpOnly`: l'autorizzazione invia il `code_challenge`, lo scambio del codice
invia il verifier. Stato e verifier scadono dopo 10 minuti. Senza segreto Trakt,
scambio del codice, refresh e revoca omettono `client_secret`.
Token di accesso e refresh sono cifrati in cookie separati per provider, con durata
massima di 90 giorni. Le route `/api/auth/{provider}/refresh` rinnovano i token in
scadenza e aggiornano i cookie; se il rinnovo fallisce, chiedono di ricollegare
l'account. Cambiare `AUTH_COOKIE_SECRET` invalida tutte le sessioni esistenti.

Gli endpoint `/api/auth/{provider}/logout` accettano solo POST dalla stessa origine
(header `Origin` obbligatorio), eliminano i cookie e tentano la revoca Trakt senza
impedire la disconnessione locale. MAL viene scollegato localmente.

Il calendario copre lunedì–domenica in `Europe/Rome`, inclusi i cambi d'ora.
Mostra gli eventi del calendario personale Trakt, legge la watchlist e il titolo
attualmente in visione da `/users/me/watching`, e unisce gli anime MAL con stato
`watching` o `plan_to_watch`. Le corrispondenze usano gli ID dello snapshot
settimanale, `idMal` di AniList e nomi esatti non ambigui; gli anime MAL confermati
su AniList possono comparire anche fuori dalla selezione settimanale del sito.
Gli orari MAL arrivano da `airingSchedule` AniList: il giorno di broadcast da solo
non viene trasformato in un episodio stimato. Le corrispondenze verificate hanno
un link a `/anime/ID`; dati mancanti o servizi indisponibili hanno messaggi dedicati.

La cache personale `unstable_cache` dura 600 secondi ed è separata per hash dei
token e settimana: nessun token è passato come argomento o chiave della cache.
Le richieste autenticate ai provider usano `no-store`. Il pulsante di aggiornamento
rilegge la cache senza aggirarne il TTL. Le code del modulo `rate-limited-fetch`
distanziano Trakt di 350 ms (sotto 1000 richieste/5 minuti per processo), MAL di
1000 ms e rispettano `Retry-After`. Come le code esistenti, non coordinano istanze
server diverse. Paginazione e attese sono limitate: liste molto grandi o limiti del
provider possono produrre risultati parziali, indicati nella pagina.

## Checks

```sh
npm run lint
npm test
npm run build
```

Vitest covers ISO week ranges, year boundaries, strict week parsing/formatting, navigation, conservative anime matching, score/member/vote formatting, and mocked lookup caching, throttling, retries and failure recovery. Build and render work without any environment keys. Live TMDB and OMDb behavior requires credentials; live AniList and Jikan checks require network access.

## Extending

UI dictionaries live in `messages/` for English, Italian, Spanish, French, German and Portuguese. `lib/i18n.ts` exposes `getDictionary(locale)`, `defaultLocale` and `locales`. Data titles and provider names remain upstream source content.

`components/SponsorSlot.tsx` remains an unobtrusive placeholder. No ads or affiliate links are enabled. The optional support section and footer link are controlled by `NEXT_PUBLIC_KOFI_URL`: set it to your HTTPS Ko-fi page and redeploy. Missing, malformed or non-HTTPS values hide both entirely. Links open in a new tab with `rel="noopener noreferrer"`. Support copy is available in all six dictionaries; no embed, tracking script or extra dependency is added.

Credits appear in the footer: TMDB disclaimer, JustWatch streaming attribution, OMDb IMDb rating credit, AniList and MyAnimeList via Jikan.

API references: [TMDB TV discovery](https://developer.themoviedb.org/reference/discover-tv), [movie discovery](https://developer.themoviedb.org/reference/discover-movie), [watch providers](https://developer.themoviedb.org/reference/tv-series-watch-providers), [OMDb](https://www.omdbapi.com/), [AniList GraphQL](https://graphql.anilist.co), [Jikan](https://docs.api.jikan.moe/), [Next.js tag revalidation](https://nextjs.org/docs/app/api-reference/functions/revalidateTag), [Vercel cron limits](https://vercel.com/docs/cron-jobs/usage-and-pricing).

## Verification status in the supplied workspace

For the canonical-domain/provider-snapshot update, the requested `npx tsc --noEmit`, `npm run lint` and `npm test` could not run in the supplied workspace: dependencies are absent, and `npm ci --offline` fails because the local cache lacks required packages. No network requests or env-file changes were made. Run these checks after restoring the locked dependencies. Added offline tests cover canonical URLs/redirects, snapshot providers and retention/refresh, initial HTML ratings/providers, OAuth host behavior and support gating.

Production build and live upstream checks were not run for this update under the offline constraint. A fallback check parsed all TypeScript/TSX sources and tests and exercised canonical URLs, redirect host patterns, compact provider storage/validation, support gating, and mocked cron reuse/refresh/failure retention. These checks passed; they do not replace TypeScript, ESLint, Vitest or a production build with the locked dependencies.

## Rating source links and logos

Rating cards link directly to the matched IMDb, MyAnimeList or AniList title in a new tab. When both MAL and AniList scores exist, both appear alongside IMDb; missing scores remain neutral. IMDb links remain available when TMDB supplies an ID even without an OMDb key; unknown IDs render non-clickable cards. Vote counts and MAL members appear beneath their scores.

Brand marks in `public/logos` are bundled from [Simple Icons](https://github.com/simple-icons/simple-icons), distributed under CC0. Brand names and logos remain the property of their respective owners.

## Regional streaming links

Provider buttons call `/api/watch` with the exact TMDB media type, title ID, provider ID and displayed country. On click, the server reads the public regional TMDB watch page and selects its published JustWatch click-out only when the country, provider ID and subscription/free/ad-supported offer match. Original JustWatch URLs and attribution are preserved; rental and purchase offers are excluded. No provider title URLs are guessed and no additional API key is needed.

Successful streaming destinations are cached for one hour by media type, title ID, country and provider. The resolver first checks the regional TMDB watch page. If the page is blocked or has no matching click-out, it reads the exact title and IMDb identity through the existing TMDB API credentials and checks JustWatch. Only an offer with the same IMDb title, provider ID, country and subscription/free/ad-supported type qualifies. Localized regional paths are taken from the verified source page; direct service URLs and their tracking parameters are preserved. The same resolution supports TV and movie titles. Missing links and outages are not stored as successful destinations and still open the exact regional TMDB watch page. Access depends on actual location and subscription; clicking a different country does not change account entitlements.

## Streaming country selector

The guide has one country selector, defaulting to United States. Every title displays only the selected country's streaming providers and uses that same country in its provider links. The selector supports 36 countries, including Spain, Portugal, Canada, Australia, Brazil and Mexico. United States stays first; the other countries are sorted alphabetically in the page language. Selecting a country updates all cards immediately without refetching title data. The root layout keeps the selection during client-side week navigation; a full reload starts with United States. Titles without providers in that country keep the existing unavailable message.

## Visitor language and localized synopses

The weekly browser UI resolves language from a supported `anime-language` preference (read through a separate endpoint), then browser languages including regional variants such as `it-IT` and `pt-BR`. The shared HTML defaults to Italian. Catalog/detail segments continue to read request locale independently. A header selector offers six languages and saves a manual choice for one year. Streaming country remains an independent preference, defaulting to Italy for Italian and US otherwise. Weekly HTML is shared and cached; request-specific catalog/detail HTML remains separate.

Weekly static discovery uses English titles; translated synopses load lazily for the selected language. AniList descriptions are English; catalog and detail pages fetch matching TMDB translations lazily as synopsis blocks enter the viewport. Matching requires exact normalized title aliases, Japanese animation metadata when available, and a release year within one year. Uncertain matches, distinct seasons, missing translations and unavailable upstreams keep the original English synopsis with an explicit translated notice. The lookup never calls the English text a translation, does not guess an adaptation, and needs no new API credentials beyond existing TMDB configuration. Country names use localized ISO display names.

Existing TMDB translations are preferred. The optional DeepL fallback below can translate English-only AniList synopses. Live authenticated lookups still require the appropriate source credentials.
## Weekly calendar by day

The weekly guide groups confirmed releases into Monday–Sunday sections, with jump links and counts. TV episodes use AniList `airingSchedules` for the conservatively matched AniList IDs; an exact timestamp and episode number are shown when supplied. Multiple episodes can put one series on several days. Broadcast grouping and displayed times use the visitor timezone and locale, defaulting to Europe/Rome and it-IT; date-only releases retain their source calendar date. These are broadcast schedules, not promises of a Netflix/Crunchyroll release in a particular country. Movies use the actual TMDB primary release date, without an estimated time.

Titles without a confirmed date stay visible under “Date to be confirmed”; missing schedules never invent a weekday or time. The cron reads at most four pages of 50 AniList events for the selected titles and preserves valid events on partial failures. Visitor schedule endpoints read those cached events, falling back to cached TMDB episode dates without making AniList calls. Schedule and streaming failures show retry controls; these lookups never hold back HTML or rating tiles.

## Progressive anime details

Anime detail pages render the title, synopsis, cover and facts as soon as AniList resolves. Optional ratings and streaming availability load in separate Suspense boundaries, with explicit loading states instead of delaying the whole page. Both sections share one availability lookup per request. Alternate TMDB title searches run in parallel within each media type; all candidates are still considered for conservative matching.

Exact AniList detail results use Next's persistent data cache for 24 hours, tagged for the existing revalidation endpoint. Cache hits bypass the process-wide upstream queue. Transient upstream errors are not cached as missing anime. A route-specific skeleton replaces the generic weekly loading screen.

## Catalog card parity

Season and search cards use the same branded IMDb and AniList rating tiles as the weekly guide. The existing AniList score links to the exact catalog ID; IMDb ratings/votes and links require a conservative TMDB match and a real IMDb ID. No ratings or season matches are estimated.

A card near the viewport loads its summary through `/api/anime-card/[id]`. Browser requests are deduplicated and limited to two concurrent lookups; successful summaries are briefly cached, while failures permit an explicit retry. Titles and synopses render without waiting for enrichment. The same country selector and streaming-link resolver work across weekly, seasonal and search views.

Weekly cards now offer internal detail navigation. Confirmed AniList IDs open `/anime/[id]`; titles without a confirmed ID open a title search rather than a guessed detail page.
## IMDb scores for separate anime seasons

AniList may publish a separate entry for each season while TMDB/IMDb represent the complete TV series. If a season detail has no direct IMDb ID, follow up to eight confirmed AniList PREQUEL relations only for TV/TV_SHORT/ONA entries whose normalized base titles match after removing explicit season/cour suffixes. Use the confirmed original entry's titles and original release year with the existing conservative TMDB matcher. Ambiguity, cycles, films, different named sequels and unavailable parent data keep the score unavailable.

Inherited IMDb ratings and links are labelled as the original series rating. MAL/AniList scores still belong to the selected season. Series-wide streaming providers are not inherited, because they do not establish availability of that season.

## Progressive weekly guide

The shared weekly shell streams a compact TMDB catalog behind Suspense and remains eligible for ISR. Rating tiles display cached cron results immediately, or `n/a` on a cold cache; they have no client rating lookup or retry request. Visible cards fetch recommendations and calendar date fallbacks separately, with two browser requests at a time, bounded queue and body deadlines, error states and retry controls. Switching language updates interface text and lazy synopsis translations without making the weekly render request-specific.

Weekly rating matching has a twelve-second budget per title, including queue time. The cron uses a 260-second overall budget and preserves confirmed scores/matches when an optional source fails. Expired queued requests are skipped rather than consuming upstream quota later. Long service cooldowns suppress subsequent lookups instead of retrying early.

## Optional DeepL API Free fallback

Set the server-only `DEEPL_AUTH_KEY` variable to a DeepL **API Free** key (ending in `:fx`) and redeploy. This integration uses only `https://api-free.deepl.com`; paid API keys are ignored. No key is sent to the browser. Missing keys, exhausted quotas, timeouts and errors preserve the English source and its existing notice.

When TMDB has no confirmed translation, the synopsis route uses the canonical AniList ID to retrieve and sanitize its actual English description, then translates it to the selected language. It never translates client-submitted prose or replaces a season with a parent-series synopsis. Machine translations carry an explicit localized “Automatic translation · DeepL” notice.

Successful translations are cached for 30 days by source text and language, independently of weekly data revalidation. Identical concurrent requests within one server process share one call; cold calls across separate server processes can still duplicate before the shared cache fills. Source text is capped at 12,000 characters and each process allows at most four concurrent translation requests. Translation POSTs are not automatically retried, and failed/empty results never enter the persistent translation cache. AniList and DeepL remain external dependencies, so this increases coverage without guaranteeing a translation for every title.

Create an API Free account at [DeepL for Developers](https://www.deepl.com/en/developers), add the key directly in Vercel Project Settings → Environment Variables as `DEEPL_AUTH_KEY`, then redeploy. Do not paste the key into chat, source control or a public environment variable.

Weekly cards also retrieve missing text lazily from the canonical TMDB ID. Localized TMDB text is preferred, then English or Japanese source synopses can be translated by DeepL with an explicit source language. Official localized/English titles take priority over literal Japanese-title translations. If no source synopsis exists, the missing-synopsis message remains. Translation failures retain the actual source-language notice. This also supports Japanese-to-English translation, without delaying the initial weekly page.

## Newsletter

The newsletter is optional and hidden by default. All signup/status text and digest copy use the existing six dictionaries, defaulting to Italian. The home page shows the signup below the weekly hero; another form appears in the footer. The saved language is used for future digests. Consent is required; subscriptions are immediate (no double opt-in).

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_NEWSLETTER_ENABLED` | Set exactly to `1` to show forms and accept subscriptions. Public, embedded at build time: redeploy after changing. Otherwise forms are hidden and subscription POSTs return 503. |
| `KV_REST_API_URL` | Upstash Redis REST URL from the Vercel Marketplace free plan. |
| `KV_REST_API_TOKEN` | Server-only read/write REST token for the same Redis database. |
| `NEWSLETTER_SECRET` | Long random server-only HMAC secret for unsubscribe links. Required for sending; rotating it invalidates previous links. |
| `RESEND_API_KEY` | Server-only Resend API key. |
| `NEWSLETTER_FROM` | Sender address on a verified Resend domain, e.g. `Anime Weekly <news@example.com>`. |
| `CRON_SECRET` | Existing server-only secret, required as `Authorization: Bearer <CRON_SECRET>` for sending. |
| `NEWSLETTER_SITE_URL` | Optional canonical site origin for email links, e.g. `https://example.com`. Defaults to the authenticated send request's origin. Set this for production to avoid preview/local links. |

No additional packages are needed: Redis and Resend use REST through `fetch`. `POST /api/newsletter/subscribe` accepts JSON `{email, consent: true, website: "", locale: "it"}`. The empty `website` field is a honeypot. Email addresses are normalized, deduplicated in the Redis set `newsletter:subscribers`, and associated with their latest language in `newsletter:locales` (hash). Missing Redis configuration returns 503 with the localized “Newsletter in arrivo” state. Storage failures show a retry message. Requests are limited to five per IP per fifteen minutes in a bounded, process-local map; this is best effort across restarts/instances and depends on the hosting proxy's forwarded IP headers.

Every message includes `/api/newsletter/unsubscribe?email=...&token=...&locale=...`, which validates an address-specific SHA-256 HMAC and removes both stored entries. Repeating a valid cancellation succeeds; cancellation remains available when signup is disabled. Tokens have no expiry so old newsletters remain usable. Keep `NEWSLETTER_SECRET` configured while subscribers exist.

Call `POST /api/newsletter/send` (GET is also supported for future cron use) with the bearer secret. Missing Resend, sender, HMAC or Redis configuration returns `{skipped: "not configured"}` without external requests. Configured sends use the current ISO week's first ten titles from the existing weekly discovery order, each linking to the site's detail/search page, plus the weekly guide and unsubscribe links. Missing, partial or empty weekly data is skipped. Sends use private, individual messages in Resend batches of at most 100 and return accepted `sent` and `failed` counts; provider acceptance does not guarantee inbox delivery. Provider failures return 502 and are not retried automatically. Resend idempotency keys protect identical batch retries within its retention window; this is not a persistent once-per-week delivery ledger. Review results before rerunning a partially failed send, especially after the subscriber list changes.

No newsletter cron is added to `vercel.json`; sending must be triggered manually until scheduling is explicitly configured. Existing revalidation cron behavior is unchanged.

## Filtri

Le pagine settimanali e stagionali filtrano nel browser per genere, piattaforma nel paese selezionato e «Solo la mia lista». I generi provengono dai dati TMDB/AniList disponibili; le piattaforme compaiono quando vengono caricati i provider. Sulle pagine stagionali i filtri si applicano ai titoli della pagina corrente. Cambiare paese azzera il filtro piattaforma.

Le fonti attuali non forniscono lingue di doppiaggio o sottotitoli per titolo e provider: questi filtri non sono disponibili.

La watchlist senza account usa `localStorage`, chiave `aw:watchlist`, con ID `anilist:ID` (oppure `tv:ID` / `movie:ID` per titoli settimanali senza abbinamento). La lista resta nel browser e si sincronizza fra le sue schede.

La Top 5 usa esclusivamente voti IMDb di episodi verificati nello snapshot giornaliero. Le immagini Open Graph e `/api/ics/week/[week]` leggono solo lo snapshot; nomi ed eventi diventano disponibili con il successivo cron. Senza cache l'immagine è generica e il calendario settimanale è vuoto. Gli eventi settimanali sono le trasmissioni AniList nella settimana UTC, senza orari inventati per date prive di orario. `/api/ics/anime/[id]` legge gli episodi futuri di AniList con cache di un'ora. I download usano UTC e UID stabili, condivisi tra calendario settimanale e calendario del titolo.

## Daily episode ranking

The weekly Top 5 uses confirmed episodes already released in Japan during the
selected week. TMDB supplies exact episode and parent-series IMDb IDs, episode
release dates, English episode names where available and posters. A daily job
streams IMDb's official `title.ratings.tsv.gz` and `title.episode.tsv.gz` files,
retaining episode identities for up to 60 selected episode IDs and indexing validated score/vote pairs for every rated IMDb title. An episode rating requires
an exact matching parent in `title.episode`, a valid score and positive vote
count. IMDb's season/episode numbering is used; series ratings, movies, future
episodes and unverified identities cannot fill missing positions.

The authenticated job runs daily at `0 6 * * *`. Metadata collection is bounded
to 60 seconds, 60 matched targets and 120 identity attempts. The two parallel gzip
streams have a 45-second deadline and a 1 GiB decompressed limit per file; the
full TSV files and title metadata are never stored in Next's cache. Only compact score/vote pairs are divided into 256 compressed private Vercel Runtime Cache partitions, each capped at 1 MiB uncompressed. Readers verify and load one partition for the exact IMDb ID, including inside nested Next cache callbacks. Each write is awaited and read back before a completion manifest with SHA-256 checksums is published; Next's deferred cache writes are no longer used for this index. After the full gzip passes integrity checks and all partitions are verified, the last complete index remains readable for up to seven days during an outage.
Header changes, duplicate target rows and corrupt/truncated gzip data fail the
attempt instead of publishing a partially parsed dataset.

A separate data-cache entry keyed solely by date retains the small daily result
or failed attempt. Changing the candidate list, repeating the job or redeploying
does not fetch the datasets again on a cache hit. Process-local in-flight calls
are also deduplicated. Newly identified episodes wait until the next day. The
weekly snapshot exposes up to five confirmed rated episodes. The UI shows the available count (for example, 1/5) and explains incomplete rankings while retaining the selected calendar week; it never fills missing positions with unrated episodes or other weeks. Collection time
and the rating file's Last-Modified timestamp identify the cache and data dates.
Previously confirmed values survive incomplete metadata or dataset outages;
a complete daily file removes a matched candidate whose rating cannot be verified.

Episode ranking consumes **zero OMDb requests**. Public pages, language changes
and filters read the weekly snapshot and never download either IMDb file.
Series and movie IMDb scores now use the same daily dataset index, even for titles outside the weekly catalog. The preserved OMDb/cross-week cache remains a fallback. Reads never download a dataset or fill a missing rating through OMDb. A cache-only endpoint in the collector bundle covers route-isolated Vercel caches. A same-day snapshot from the previous collector can be migrated once
without warming OMDb scores again. The first collector-version migration initializes the new index once; manual repeats reuse it.

Official data source and conditions:
[IMDb Non-Commercial Datasets](https://data.imdb.com/non-commercial-datasets/),
[IMDb non-commercial terms](https://help.imdb.com/article/imdb/general-information/can-i-use-imdb-data-in-my-software/G5JTRESSHJBBHTGX).
The project owner requested this dataset configuration after review of those
conditions. No separate written IMDb authorization was obtained by this change.
Required IMDb attribution is shown in the footer; the ranking links to the
source and shows the file date. Full TSV files are not redistributed.

IMDb index migration: an authenticated cron may repair a pre-migration incomplete index once per date, reusing legacy partitions if complete or streaming only the rating file once. It does not call OMDb or redownload episode metadata. Success and failure attempts are cached; normal collection remains daily. JustWatch recovery preserves each verified package icon and uses its own image host, separately from TMDB logo paths.


## Canonical production domain

`https://weeklyanime.com` is the production origin. `lib/seo.ts` uses it when `NEXT_PUBLIC_SITE_URL` is unset in production; local development defaults to `http://localhost:3000`. An explicit `NEXT_PUBLIC_SITE_URL` overrides the SEO base. Sitemap URLs, robots' Sitemap URL, metadataBase, page-specific absolute canonical/Open Graph URLs and detail JSON-LD use the same base. Twitter images resolve through metadataBase. Locale preferences share URLs, so no hreflang alternates are advertised.

Next redirects the legacy `anime-weekly.vercel.app` host and `anime-weekly-[a-z0-9-]+.vercel.app` preview hosts with HTTP 308 to the canonical domain, preserving paths and query parameters. `/api/` paths are excluded, including cron, snapshot/IMDb reads and Trakt/MAL callbacks. The favicon redirect remains in place. Server self-fetches in `lib/weekly-ratings.ts` and `lib/imdb.ts` deliberately continue using `VERCEL_PROJECT_PRODUCTION_URL` independently of `NEXT_PUBLIC_SITE_URL`.

## Weekly availability snapshots

The cron stores `availability` beside weekly ratings: each TMDB title has `fetchedAt` and country-to-provider-ID arrays, with one shared provider-ID-to-name/logo table. Only supported countries and subscription/free/ad-supported offers are stored; no rental or purchase offers are added. The cross-week ratings store also keeps availability by media type/ID and `lastSeenAt`. Entries refresh after seven days, including previously empty successful results. Fresh entries are reused across weeks, stale offers survive upstream failures without renewing `fetchedAt`, and omitted work resumes on later cron runs. Availability uses up to four concurrent TMDB requests within a 50-second share of the existing cron budget, before rating work; it never calls OMDb, AniList or Jikan. Unseen store entries expire after 120 days and unused provider-table entries are pruned.

Old snapshots/stores without availability remain readable. The next authenticated cron migrates them even if episode collection already completed that day. Provider-only successes can be saved if rating services fail. Storage still happens through the separate authenticated POST after tag invalidation, and invalid provider references are rejected before either cache is written. Weekly HTML is invalidated only after the snapshot is available. Season cards reuse cached weekly matches/scores/providers by confirmed AniList ID where available; their existing discovery/enrichment remains available for other titles. Detail ratings and watch availability already render through server components and retain that flow. Language detection and preferences are unchanged.
