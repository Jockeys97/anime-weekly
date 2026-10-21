# AniList outage fallback

The detail page tries the existing AniList live/cache loader first. On upstream
errors it uses a validated Blob copy; if no copy exists, it keeps the transient
error (never a false 404). Confirmed live not-found responses also check the
snapshot before returning 404. Season pages use the same files during outages.
Coverage is limited to the current and previous UTC seasons, not the full catalog.

`GET /api/anilist-snapshot` runs daily at **05:30 UTC** (Hobby-compatible; the
existing 06:00 revalidation cron remains). It requires `Authorization: Bearer
<CRON_SECRET>` and the existing private Blob store's `BLOB_READ_WRITE_TOKEN`.
It fetches fresh AniList pages, at most ten pages of 50 per season, with a bounded
time budget inside a 300-second function. Empty, invalid, unavailable or truncated
collections never replace a good copy. The first successful refresh must happen
while AniList is available; an outage cannot bootstrap missing snapshots.

Files are private, deterministic and overwritten only after validation:

- `anilist/seasons/<year>-<season>.json`: version 1, season identity, `savedAt`,
  `count`, and display fields from `AniListAnime` in `media`.
- `anilist/manifest.json`: version 1, refresh `savedAt`, and `{key,count,savedAt}`
  entries. A partial refresh retains the older season's timestamp.

Validated reads use tagged Next data caches with a five-minute revalidation.
Because fallback reads happen during ISR rendering, Next lowers that render's
revalidation interval to five minutes; live renders retain the normal daily
interval. Reads bypass Blob's CDN cache and do not cache missing/invalid files or
storage errors. Successful writes expire the corresponding data cache tags.
`readAniListSnapshotSeason` and `findSnapshotAnime` are reusable server APIs for
future episode, similar-anime and genre features.

`GET /api/health/anilist-snapshot` is public, dynamic and `no-store`. It returns
`{ok,stale,ageHours,savedAt,seasons:[{key,count}]}` with 200 only when both required
seasons are present and at most 24 hours old, otherwise 503. Age uses the oldest
season file, not the manifest's refresh timestamp. Missing copies have `stale:
true`; when all are missing, `ageHours` and `savedAt` are null.

Refresh responses are 200 for full success, 207 for partial writes (including a
failed manifest update), and 502 when no season was written. Each failure logs
one JSON line with `event: anilist_snapshot_failed`, season and reason. Cron and
health requests log `anilist_snapshot_stale` when a required copy is old/missing.
No payloads, tokens or request authorization headers are logged.
