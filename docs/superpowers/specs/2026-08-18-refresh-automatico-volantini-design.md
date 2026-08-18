# Refresh automatico dei volantini

**Data:** 2026-08-18
**Stato:** implementato

## Problema

I volantini si aggiornano solo quando qualcuno preme «Aggiorna volantini» o lancia
`scripts/refresh-volantini.mjs` da locale — e il `.env` locale punta al DB Neon di
produzione, quindi l'aggiornamento di produzione dipende da un intervento manuale
su una macchina di sviluppo.

Non era, però, un problema di scheduler mancante. Lo scheduling esisteva già in due
forme (il `@Cron('0 6 * * 4')` in-process e l'endpoint `POST /cron/weekly` per
scheduler esterni) e nessuna delle due funzionava, senza che nulla lo segnalasse.

### Diagnosi

| Verifica | Esito |
|---|---|
| `git rev-list --left-right --count origin/main...main` | `0 0` — nessun disallineamento; il lavoro non deployato erano 13 file non committati |
| `GET /api/health` | `200`, uptime 3.603.776s ≈ 41 giorni |
| Commit `742dceb` (cron settimanale) | 2026-07-07, precedente all'avvio dell'istanza → **il codice deployato è aggiornato** |
| `POST /api/cron/weekly` senza token | `503` = *"CRON_SECRET non configurato"* (un token errato darebbe `403`) → **la env manca su Render** |
| Bundle di `weeklyhome.vercel.app` | punta a `https://weeklyhome.onrender.com/api` → Vercel serve solo la SPA |

L'istanza non dorme, quindi il `@Cron` in-process *scattava*. Ma la sua prima riga era

```ts
if (!process.env.GEMINI_API_KEY && !process.env.ANTHROPIC_API_KEY) return;
```

— un return muto. Senza chiavi AI nelle env di Render, ogni giovedì il refresh
usciva in silenzio, per settimane, senza una riga di log.

**La causa vera non è il trigger: è l'invisibilità del fallimento.** Aggiungere un
terzo scheduler cieco avrebbe riprodotto lo stesso problema fra un mese.

## Decisioni

### Scheduler: GitHub Actions

| Opzione | Perché scartata |
|---|---|
| Vercel Cron | Su Hobby: max 1 esecuzione/giorno, finestra di ~1h, e richiederebbe una serverless function in un progetto oggi 100% statico solo per fare un `curl` verso Render |
| Render Cron Jobs | Tipo di servizio a pagamento, non disponibile sul free |
| cron-job.org | Config fuori dal repo, non versionata, e **cieca**: `/cron/weekly` risponde `{started:true}` prima che la vision parta, quindi vedrebbe sempre 200 anche a estrazione fallita |
| **GitHub Actions** ✅ | Gratis, versionato, log consultabili, rilancio manuale, mail al fallimento. L'unico che può fare sveglia → trigger → **polling dell'esito** → verdetto |

Neo accettato: GitHub sospende gli schedule dopo 60 giorni senza attività sul repo.

### Giorni: lunedì + giovedì

I volantini nuovi escono il lunedì. Il giro del giovedì recupera un lunedì fallito
e prende i volantini Conad di metà settimana; non costa quota AI perché con
`force=false` trova i dati di lunedì ancora validi e salta. Due tentativi al prezzo
di uno.

### Freschezza: 14 giorni, non 7

Con `force=false` un volantino ancora valido viene saltato, quindi `fetchedAt` può
legittimamente restare fermo per tutta la durata del volantino. Una soglia a 7
giorni darebbe falsi allarmi sui volantini quindicinali.

Un'insegna è `fresh` se **ha offerte ancora valide** *e* **è stata estratta entro
14 giorni**. La prima condizione da sola non basterebbe (una pipeline morta lascia
offerte vecchie ma valide); la seconda nemmeno (un'estrazione recente che non
produce nulla di utilizzabile è comunque un fallimento).

## Implementazione

**`GET /api/cron/status`** — protetto dallo stesso `CRON_SECRET`. Nessuna tabella
nuova, nessuna migration: `VolantinoProduct.fetchedAt` è già la traccia di quando
un'insegna è stata estratta. Due `groupBy` (ultimo `fetchedAt`, conteggio offerte
con `validTo > now`) per insegna vision (`conad`, `todis`). Espone
`aiKeyConfigured` come **booleano** — la chiave non esce mai dall'endpoint.

**`POST /api/cron/weekly?force=true`** — force opzionale, per il rilancio manuale
quando si sospetta un'estrazione andata male ma non ancora scaduta.

**`.github/workflows/volantini.yml`** — `cron: '0 6 * * 1'` e `'0 6 * * 4'`, più
`workflow_dispatch` con input `force`. Cinque step: verifica del secret → sveglia
(10 tentativi × 15s, copre il cold start) → controllo `aiKeyConfigured` con
messaggi distinti per 503/403 → trigger → **polling di `/cron/status` ogni 60s per
20 minuti**. Il polling tiene anche sveglia l'istanza Render durante l'estrazione.
`concurrency` impedisce due giri sovrapposti.

**`scheduledVolantinoRefresh`** — il return muto diventa un `logger.warn` esplicito,
e l'esito viene loggato per insegna (aggiornato / saltato / fallito con errore).
Schedule allineato a `'0 6 * * 1,4'`.

## Fuori scope, ma da sapere

`TO_BASE.qb = 1` con dimensione `count`: un "Pasto libero" da `0 qb` entra
nell'ottimizzatore come quantità 0 — innocuo oggi, ma un ipotetico `2 qb` verrebbe
trattato come 2 pezzi.

Durante il lavoro è emerso che `node_modules/@weeklyhome/*` puntava a
`C:\Users\andre\Desktop\WeeklyHome`, percorso non più esistente: il repo è stato
spostato in `source\repos` portandosi dietro il vecchio `node_modules`. Il build
API falliva solo in locale (la CI fa `npm ci` da zero). Risolto con `npm install`.

## Test

`apps/api/src/cron.controller.test.ts` — 7 test: guardia del token (503 senza
secret, 403 con token errato o assente) e logica di freschezza (entrambe fresche,
insegna mai estratta, estrazione recente senza offerte valide, quindicinale a 13
giorni ancora fresco, oltre i 14 giorni rotto, `aiKeyConfigured` senza leak).

Gli script bash del workflow sono verificati con `bash -n`; il test end-to-end
reale è il primo `workflow_dispatch` dopo il deploy.

## Configurazione richiesta (manuale, una tantum)

| Dove | Variabile | Stato alla stesura |
|---|---|---|
| Render → Environment | `CRON_SECRET` | mancante (provato dal 503) |
| Render → Environment | `GEMINI_API_KEY` o `ANTHROPIC_API_KEY` | da verificare — causa più probabile del cron muto |
| GitHub → Secrets → Actions | `CRON_SECRET`, stesso valore | da creare |

L'URL dell'API non è un secret: è già pubblico nel bundle JS, sta come `env` nel
workflow.
