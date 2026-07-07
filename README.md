# WeeklyHome

PWA mobile-first (stile "Liquid Glass") che trasforma il piano nutrizionale settimanale
in PDF nella spesa di famiglia più conveniente: consumo condiviso per membro, lista
aggregata e "dove conviene" comprare ogni alimento nel raggio scelto.

Documenti di prodotto: [`docs/PRD.md`](docs/PRD.md) · [`docs/BACKLOG.md`](docs/BACKLOG.md)

## Struttura (monorepo npm workspaces)

```
packages/domain   Logica di dominio pura in TypeScript (no UI, no rete)
                  → consumo condiviso, lista spesa, ottimizzazione "spendo meno/meno tappe"
                  → coperta da test unitari (vitest)
apps/web          PWA Vite + React + TypeScript + Tailwind v4 + Framer Motion
                  → consuma @weeklyhome/domain, dati di esempio in src/data/seed.ts
apps/api          Backend NestJS + Prisma/SQLite (ESM)
                  → auth JWT, nucleo famiglia, dosi, import piano (mock), spesa
                  → riusa @weeklyhome/domain per consumo/lista/ottimizzazione
```

## Requisiti
Node 20.19+ (o 22.12+).

## Avvio

```bash
npm install                 # dalla root: installa e collega i workspace
npm run build:domain        # compila il package di dominio (richiesto dalla web)

# Frontend
npm --workspace @weeklyhome/web run dev       # dev server (http://localhost:5173)
npm --workspace @weeklyhome/web run build     # build di produzione (PWA)
npm --workspace @weeklyhome/web run preview   # serve la build

# Backend (NestJS + SQLite)
npm --workspace @weeklyhome/api run build         # prisma generate + tsc
npm --workspace @weeklyhome/api run db:push       # crea/aggiorna lo schema SQLite
npm --workspace @weeklyhome/api run start         # API su http://localhost:3000/api

# Test del dominio
npm run test:domain
```

### Endpoint principali (tutti sotto `/api`)
- `POST /auth/register` · `POST /auth/login` → `{ token, user }`
- `POST /family` · `POST /family/join` · `GET /family` · `POST /family/members` · `PATCH /family/members/:id`
- `POST /plan/import` (multipart `file` PDF opzionale → estrazione Claude; senza file → piano di esempio) · `POST /plan/:id/confirm` · `GET /plan/active`
- `POST /plan/overrides` (correzione pasto `{day,type,items}`) · `DELETE /plan/overrides?day=&type=` (ripristina)
- `GET /shopping?mode=cheapest|fewest&radius=<km>` → lista + ottimizzazione (riusa `@weeklyhome/domain`)
- `GET /prices/stores?radius=<km>` · `POST /prices/refresh` (riacquisisce i prezzi base dai provider HTTP: gratis, veloce)
- `POST /prices/volantino/refresh-all?force=` (refresh manuale di TUTTI i volantini vision Conad+Todis; fire-and-forget, risponde subito e lavora in background)
- `POST /prices/volantino/auto?force=` (solo Conad) · `POST /prices/volantino/todis?force=` (solo Todis)
- `POST /prices/volantino?storeId=conad` (multipart `files`: PDF o immagini del volantino → estrazione prezzi con Claude vision → salvataggio)

Le rotte sopra (eccetto auth) richiedono header `Authorization: Bearer <token>`.

**Endpoint pubblici (no JWT):**
- `GET /health` — keep-alive/health-check
- `POST /cron/weekly` — refresh settimanale "di tutto" (base HTTP + volantini vision) innescato da uno scheduler esterno; protetto da `CRON_SECRET` via header `x-cron-token` o query `?token=`

### Variabili d'ambiente (`apps/api/.env`)
- `DATABASE_URL` — SQLite (default `file:./dev.db`)
- `JWT_SECRET` — segreto per i token
- `GEMINI_API_KEY` — **consigliato (gratis)**: abilita l'estrazione AI (volantino + PDF piano) via Gemini. Chiave free su https://aistudio.google.com/apikey
- `GEMINI_MODEL` — opzionale, default `gemini-2.5-flash`
- `ANTHROPIC_API_KEY` — alternativa a Gemini (usata solo se `GEMINI_API_KEY` è vuota); a pagamento
- `EXTRACTION_MODEL` — opzionale (solo Anthropic), default `claude-opus-4-8`

Ordine di scelta del provider: **Gemini → Anthropic → mock** (solo per l'import piano). Senza alcuna chiave, l'estrazione volantino risponde 503 e l'import piano usa il piano di esempio.

### Estrazione prezzi dal volantino (Claude vision)
Imposta `ANTHROPIC_API_KEY` in `apps/api/.env`, avvia l'API, poi invia il volantino
(PDF o foto delle pagine alimentari) del tuo punto vendita:

```bash
curl -X POST "http://localhost:3000/api/prices/volantino?storeId=conad" \
  -H "Authorization: Bearer <token>" \
  -F "files=@volantino-pagina1.jpg" -F "files=@volantino-pagina2.jpg"
# → { extracted, matched, foods: [...] }  e i prezzi finiscono in DB (source: volantino:conad)
```

Poi `GET /shopping?...` userà quei prezzi reali.

### Aggiornamento automatico (cron)
Due `@Cron` in-process (`@nestjs/schedule`): prezzi base ogni giorno alle **6:00**, volantini vision ogni **giovedì alle 6:00**. Su Render free il processo dorme dopo 15 min → il `@Cron` può non scattare all'orario. Perciò lo scheduling **primario è esterno** (cron-job.org, gratis):

1. **Keep-alive** — `GET https://weeklyhome.onrender.com/api/health` ogni ~10 min (tiene sveglio Render).
2. **Refresh settimanale** — `POST https://weeklyhome.onrender.com/api/cron/weekly` una volta a settimana (es. giovedì 06:00), con header `x-cron-token: <CRON_SECRET>`. Fa il refresh base + avvia i volantini vision. È `non-force`: se un volantino è ancora valido salta l'estrazione (risparmio quota Gemini).

Imposta `CRON_SECRET` (stringa lunga e casuale) nelle env di Render e nel job cron-job.org. Dalla UI, il pulsante **«Aggiorna volantini»** in ShopScreen fa lo stesso refresh vision a mano.

### App completa (frontend collegato all'API)
Avvia entrambi (due terminali):

```bash
npm --workspace @weeklyhome/api run start    # API su :3000
npm --workspace @weeklyhome/web run dev      # PWA su :5173
```

Apri http://localhost:5173 → registrati → crea il nucleo → Import (PDF o piano di esempio) →
Spesa. Il frontend punta a `http://localhost:3000/api` (override con `VITE_API_URL` in `apps/web/.env`).

## Stato attuale
Vedi "Stato implementazione" in [`docs/BACKLOG.md`](docs/BACKLOG.md).
In sintesi: dominio (consumo/lista/ottimizzazione) implementato e testato; PWA demo
navigabile con dati seed (Settimana, Spesa con toggle prezzi, Famiglia con dosi live,
Import mock). Backend (auth/famiglia, estrazione AI dei PDF, prezzi reali via scraping)
non ancora implementato: i prezzi della demo vengono da `apps/web/src/data/seed.ts`.

## Prossimi passi
- Backend (NestJS): auth + nucleo famiglia + persistenza (US-001/002/003).
- Estrazione PDF via LLM con revisione (US-004/005).
- Acquisizione prezzi reale (siti supermercati → aggregatori) (US-012) e geo/raggio (US-011).
- UI di correzione pasto (US-008) e varianti AI (US-009).
