# Migrazione a Railway

Next.js 16 self-hosted su **una sola istanza**, mantenendo la build Vercel.
Questi file non pubblicano nulla: push, deploy e modifiche DNS richiedono
l'istruzione esplicita «pubblica».

## Servizio web

1. Dopo l'autorizzazione al rilascio, creare un servizio Railway dal repository
   e da questo branch, con `/railway.json` come Config File Path. Durante la
   preparazione locale mantenere disattivati gli autodeploy.
2. Configurare le variabili indicate sotto prima della build. Mantenere una
   sola replica in una sola regione, senza spegnimento per inattività.
3. Il Dockerfile usa Node 20 Alpine, `npm ci` e `npm run build` in stage separati.
   Copia `.next/standalone`, `.next/static`, `public` e il runner cron nel runtime.
   Avvia `node server.js` come `nextjs` (UID 1001), con host `0.0.0.0` e porta
   `PORT` (default nell'immagine: 3000). Railway può sovrascrivere la porta.
4. Generare un dominio Railway per il web e usarlo inizialmente come `APP_URL`,
   completo di protocollo HTTPS. Il servizio cron deve ricevere lo stesso URL
   del web, non l'indirizzo del servizio cron stesso.
5. L'healthcheck `/api/health` restituisce 200 senza chiamate a fornitori, Blob
   o cache; non certifica che i dati giornalieri siano già pronti. Il web
   riparte su errore fino a tre volte. Lasciare il comando del Dockerfile:
   l'immagine usa il server standalone.

`output: 'standalone'` conserva il comando `next build`; `vercel.json` rimane
invariato e Vercel mantiene il flusso esistente. La copia separata degli asset
segue la [documentazione Next.js standalone](https://nextjs.org/docs/app/api-reference/config/next-config-js/output).
I campi Railway seguono la [configurazione come codice](https://docs.railway.com/config-as-code/reference).

## Variabili d'ambiente

Inventario dei nomi ricavato dagli accessi `process.env` e dagli helper `env`
nel codice applicativo, negli script e in `next.config.ts`. Solo nomi, senza
valori o segreti; le integrazioni opzionali non devono essere tutte abilitate.

Per il servizio web:

```text
APP_URL
CRON_SECRET
NEXT_PUBLIC_SITE_URL
```

Catalogo, dati e traduzione (TMDB accetta alternativamente token o API key):

```text
TMDB_READ_TOKEN
TMDB_API_KEY
OMDB_API_KEY
DEEPL_AUTH_KEY
```

Accesso personale Trakt/MyAnimeList, se utilizzato:

```text
AUTH_COOKIE_SECRET
TRAKT_CLIENT_ID
TRAKT_CLIENT_SECRET
MAL_CLIENT_ID
MAL_CLIENT_SECRET
```

Newsletter e supporto, se utilizzati:

```text
NEXT_PUBLIC_NEWSLETTER_ENABLED
NEXT_PUBLIC_KOFI_URL
KV_REST_API_URL
KV_REST_API_TOKEN
NEWSLETTER_SECRET
NEWSLETTER_FROM
NEWSLETTER_SITE_URL
RESEND_API_KEY
```

Analytics e storage opzionali:

```text
NEXT_PUBLIC_UMAMI_WEBSITE_ID
BLOB_READ_WRITE_TOKEN
```

Variabili di runtime, sviluppo o piattaforma da non copiare da Vercel a Railway:

```text
NODE_ENV
ANIME_WEEKLY_LOCAL_PREVIEW_DATA
VERCEL
VERCEL_ENV
VERCEL_URL
VERCEL_PROJECT_PRODUCTION_URL
```

`NODE_ENV` è già impostato dall'immagine; il flag di anteprima riguarda solo
`next dev`. Railway non deve simulare le variabili `VERCEL*`.

Nomi infrastrutturali usati dall'immagine e, facoltativamente, dal volume:

```text
PORT
HOSTNAME
NEXT_TELEMETRY_DISABLED
RAILWAY_RUN_UID
```

Le quattro variabili `NEXT_PUBLIC_*` del codice sono dichiarate come `ARG`
nello stage builder: Next le incorpora nella build. Una loro modifica richiede
la ricostruzione dell'immagine. I segreti vanno solo nelle variabili runtime,
senza `ARG` o copie di `.env*` nell'immagine.

Impostare `NEXT_PUBLIC_SITE_URL` prima della build al dominio canonico,
`https://weeklyanime.com` in produzione. `APP_URL` può restare il dominio Railway
del web per permettere chiamate interne prima e dopo il cambio DNS. Gli helper
server usano `APP_URL`, con fallback al sito o all'origine della richiesta;
su Vercel conservano gli host di produzione e preview appropriati.
Si usa un'origine configurata: il cron è separato e non può raggiungere il web
tramite il proprio `127.0.0.1`. Il percorso HTTP può generare traffico di rete.

## Cron giornaliero

Creare un **secondo servizio**, dallo stesso repository/immagine, selezionando
esplicitamente `/railway.cron.json` come Config File Path. Il file dedicato usa:

```json
{
  "build": { "builder": "DOCKERFILE", "dockerfilePath": "Dockerfile" },
  "deploy": {
    "numReplicas": 1,
    "cronSchedule": "0 6 * * *",
    "startCommand": "node scripts/cron.mjs",
    "healthcheckPath": null,
    "restartPolicyType": "NEVER"
  }
}
```

Non usare la configurazione web per il cron e non sovrascrivere l'avvio del web.
Al cron servono solo questi nomi di variabili runtime:

```text
APP_URL
CRON_SECRET
```

Il segreto deve coincidere con quello del web. La schedulazione è alle **06:00
UTC**, quindi alle 07:00 o 08:00 in Italia. Il job invia GET a `/api/revalidate`
con `Authorization: Bearer …`, rifiuta redirect, impone un timeout di dieci
minuti ed esce con codice 1 su configurazione mancante, errore di rete/HTTP o
risposta non valida. Non invia e non richiede `x-vercel-cron`. Il processo deve
terminare per consentire le esecuzioni successive, come spiega la
[documentazione Railway cron](https://docs.railway.com/cron-jobs).

Il collector può rispondere 200 con copertura parziale: controllare anche i log
del web e `/api/revalidate?health=1`. Le scritture con `after()` continuano sul
web dopo la risposta; l'uscita del client cron non indica la fine di quelle
scritture. Evitare deploy durante la raccolta.

`vercel.json` resta per il rollback. Al passaggio effettivo mantenere attivo un
solo scheduler: disattivare il cron Vercel nella gestione del vecchio progetto
o sospendere il vecchio servizio, conservandone deployment e configurazione.
Non pianificare `/api/anilist-snapshot`: lo snapshot AniList resta disabilitato,
senza nuove attivazioni o bootstrap.

## Cache e volume opzionale

Il Data Cache Next usa memoria e filesystem in `.next/cache`. `unstable_cache`
e `revalidateTag` restano quelli di Next: `'max'` conserva stale-while-revalidate
e `{ expire: 0 }` scade immediatamente i tag esistenti. Non viene aggiunto un
cache handler né abilitato `cacheComponents`; la cache mantiene i default.
Riferimento: [Next.js self-hosting](https://nextjs.org/docs/app/guides/self-hosting).

Senza volume la cache è **effimera a ogni nuovo container/deploy**. Le prime
visite riscaldano i dati ordinari; indici IMDb, snapshot settimanale e cataloghi
riservati al collector richiedono il cron giornaliero o una sua esecuzione
manuale autorizzata. Le visite pubbliche non avviano i writer protetti. Al primo
avvio eseguire il job e controllare la salute prima del cambio DNS.

Fuori da Vercel, la Runtime Cache usa `.next/cache/runtime`: TTL, namespace,
chiavi hashate, scritture atomiche e invalidazione dei tag personali. Le letture
scadute e una pulizia periodica durante le scritture eliminano le vecchie voci.
Gli indici IMDb sono condivisi tra bundle Next tramite disco. I tag di questo
store sono separati dai tag Next; il refresh personale invalida entrambi.

Facoltativamente montare un volume Railway del **solo web** in
`/app/.next/cache` per conservare Data Cache e cache runtime tra deploy. Non
montare tutta `.next`, che contiene il codice della build. I volumi sono montati
all'avvio e possono appartenere a root: verificare la scrittura come UID 1001;
se necessario usare `RAILWAY_RUN_UID` secondo le indicazioni Railway (UID 0),
oppure predisporre i permessi del volume per UID 1001. Il `chown` nella build
non modifica il volume montato successivamente. Vedere i
[permessi dei volumi Railway](https://docs.railway.com/volumes).

Il volume non conserva automaticamente tutta la Full Route Cache/HTML ISR,
che vive anche in `.next/server`. Dopo modifiche incompatibili svuotare
selettivamente la cache e rifare il warmup. Repliche multiple richiederebbero
una cache condivisa e coordinamento della rivalidazione.

## Dominio e TLS

1. Annotare i record DNS attuali e ridurne il TTL prima del passaggio.
2. Nel web aprire Settings → Networking → Custom Domain e aggiungere
   `weeklyanime.com` e `www.weeklyanime.com`, con la porta del servizio.
3. Railway fornisce il target CNAME e il record TXT di verifica per ciascun
   dominio: creare entrambi come mostrato nel pannello, senza dedurre i target
   dal nome del servizio. Per `www` creare il CNAME e il TXT richiesto.
4. Per l'apex usare un provider con CNAME flattening/ALIAS/ANAME. Se manca,
   servire `www` e configurare un redirect HTTPS dall'apex presso il provider;
   in questa variante adeguare canonical, `NEXT_PUBLIC_SITE_URL` e callback OAuth.
5. Attendere verifica DNS e certificati TLS automatici per entrambi gli host,
   poi provare HTTPS, pagine, asset, robots/sitemap e callback Trakt/MAL. Per un
   solo host canonico predisporre il redirect 308 da `www` all'apex sul
   provider/edge scelto: registrare entrambi non crea quel redirect.

Railway termina TLS; Next ascolta HTTP sulla porta interna.
Riferimento: [domini Railway](https://docs.railway.com/networking/domains/working-with-domains).

## Analytics, Blob e dipendenze

`FilteredAnalytics.tsx` carica Umami Cloud con strategia `afterInteractive`
solo con `NEXT_PUBLIC_UMAMI_WEBSITE_ID` e dopo i filtri user-agent/webdriver
esistenti. Senza variabile non carica script. Non viene imposto `data-domains`,
per permettere la verifica sul dominio temporaneo. L'ID è pubblico e va dato
alla build.

Gli accessi Blob erano già protetti da `BLOB_READ_WRITE_TOKEN`: senza token
nessuna operazione Blob; letture assenti e archivi disabilitati. Il refresh
AniList manuale già esistente segnala storage non configurato senza chiamare
AniList/Blob. Non vengono aggiunti cron o chiamate che attivino quel refresh.
Lasciare il token assente per non usare Blob: questo esclude anche gli archivi
persistenti delle settimane chiuse, distinti dalla cache locale.

Inventario completo degli usi Vercel nel codice applicativo:

| Uso trovato | Gestione |
| --- | --- |
| `@vercel/analytics/next` in `components/FilteredAnalytics.tsx` | Sostituito da Umami con filtro bot prima del caricamento. |
| `@vercel/blob` in `lib/anilist-snapshot.ts`: `get`, `put`, `BlobNotFoundError` | Guardie sul token conservate; snapshot non attivato. |
| `@vercel/blob` in `lib/sitemap-catalog.ts`: `get`, `put` | Letture/scritture opzionali già protette dal token. |
| `@vercel/blob` in `lib/week-archive.ts`: `get`, `head`, `list`, `put`, `BlobNotFoundError` | Archivio opzionale già protetto dal token. |
| Dispatch archivi in `app/api/revalidate/route.ts` | Già protetto dal token Blob; origini adattate a Railway. |
| `@vercel/functions.getCache` in `lib/imdb-rating-index.ts`, `lib/imdb-episode-index.ts`, `lib/my-anime-cache.ts` | Adapter `lib/runtime-cache.ts`: Vercel sulla sua piattaforma, disco altrove. |
| `waitUntil`, geolocalizzazione, `x-vercel-cron` | Nessun uso applicativo trovato; le attività in background usavano già `after()` da `next/server`. |
| `VERCEL_ENV` in `next.config.ts`, `lib/seo.ts` | Redirect Vercel solo nella sua produzione; fallback canonico indipendente. |
| `VERCEL_ENV` / `VERCEL_URL` in `lib/similar-catalog-client.ts` | Risoluzione spostata in `lib/internal-origin.ts`, preservando le preview. |
| `VERCEL_ENV` / `VERCEL_PROJECT_PRODUCTION_URL` in `lib/weekly-ratings.ts`, `lib/imdb.ts`, `lib/imdb-episode-index.ts` | Risoluzione centralizzata; su Railway `APP_URL`, con fallback alla cache locale. |
| Nuovo `VERCEL` in `lib/runtime-cache.ts` | Seleziona il provider Vercel solo sulla sua piattaforma. |

I mock delle dipendenze e gli stub Vercel nei test rimangono dove verificano la
compatibilità; il mock analytics superfluo è rimosso e l'adapter è coperto anche
su filesystem. Le istruzioni Vercel esistenti nel README restano valide per
quella piattaforma; questo documento descrive Railway.

Si può rimuovere successivamente **solo `@vercel/analytics`** dai package file.
`@vercel/blob` serve per le integrazioni opzionali e `@vercel/functions` per la
Runtime Cache Vercel. Manifest e lockfile restano invariati.
`images.unoptimized: true` è già configurato e rimane tale: non serve aggiungere
`sharp` per l'ottimizzazione immagini di questo server.

## Verifiche e rollback

Verifiche locali:

```sh
npx tsc --noEmit
npx vitest run
npm run build
```

Dopo un rilascio autorizzato verificare healthcheck, asset, pagine localizzate,
cron, salute dei dati, refresh personale e una visita reale su Umami.

Rollback: fermare il cron Railway; ripristinare i DNS annotati verso il deployment
Vercel conservato, verificare TLS e riattivare il solo cron Vercel. Ripristinare
eventuali callback OAuth cambiate. Conservare il segreto dei cookie per la
compatibilità delle sessioni, ove possibile. Verificare i dati e riscaldare la
cache Vercel se necessario: il volume Railway non viene trasferito. Conservare
il volume fino alla conferma del ripristino e arrestare il web Railway dopo la
propagazione DNS. Questa preparazione non richiede cambi di schema database.

## Limiti di spesa Railway

Fonte: docs.railway.com/reference/usage-limits e /reference/pricing/plans (consultate il 23/10/2026).

- Hobby costa 5 $/mese e include 5 $ di consumo (CPU 20 $/vCPU/mese, RAM 10 $/GB/mese, egress 0,05 $/GB, volume 0,15 $/GB/mese). Le build sono gratuite.
- **Usage limits** (Workspace → Usage → Set Usage Limits, oppure `railway usage limit set --target workspace --soft X --hard Y`):
  - *Custom email alert* (soft): solo email, nessuno stop. Si può impostare anche a 5 $.
  - *Hard limit*: al superamento Railway spegne tutti i workload. Avvisi al 75%, al 90% e al 100%.
  - **Il minimo impostabile per l'hard limit è 10 $**: un tetto rigido a 5 $ NON è possibile. La spesa massima effettiva è quindi 10 $/mese (5 $ inclusi + 5 $ extra).
  - Per ripartire bisogna alzare o rimuovere il limite; Railway poi ridistribuisce i servizi automaticamente.
- Consigli: soft alert a 5 $, hard limit a 10 $; Replica Limits (Settings → Deploy) ad esempio 1 vCPU / 1 GB; una sola replica; facoltativo "Serverless" (sleep quando è inattivo, con avvio a freddo).

