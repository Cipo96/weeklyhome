# Backlog — WeeklyHome

**Generato il:** 2026-06-08 | **Ultima modifica:** 2026-06-09

## Riepilogo
- Epic totali: 5
- Storie totali: 15
- Storie TODO: 1 | PLANNED: 0 | IN_PROGRESS: 1 | REVIEW: 13 | DONE: 0

## Stato implementazione (run autonomo 2026-06-08)
Monorepo npm: `packages/domain` (logica pura, **23 test verdi**) + `apps/web` (PWA Vite+React+Tailwind+Framer Motion, **build verde**, **collegata all'API**, offline/installabile) + `apps/api` (**NestJS + Prisma/PostgreSQL su Neon**, build verde + **smoke test e2e verde su Neon**). DB migrato da SQLite a **Postgres/Neon** (2026-06-09): provider `postgresql` + `directUrl`, migrazione `init` applicata, `migrate:dev`/`migrate:deploy`; smoke test su Neon OK (register→famiglia→import→refresh 35 prezzi→lista 16 prodotti, geo reale). Il frontend consuma gli endpoint reali (`/auth`, `/family`, `/plan`, `/shopping`, `/prices`): login/registrazione, creazione nucleo, import (PDF o esempio), dosi persistite con ricalcolo live, toggle ottimizzazione e raggio. CORS verificato.
- **REVIEW** (implementate + verificate in questo run):
  - Backend + UI: US-001 (auth JWT + login/registrazione), US-002 (nucleo famiglia + invite + onboarding), US-003 (dosi per membro persistite), US-004 (import + persistenza piano).
  - Dominio/PWA: US-006 (piano settimana da API), US-007 (consumo condiviso), US-008 (modifica pasto: override persistito su DB + ricalcolo live), US-009 (varianti AI iso-macro applicabili), US-010 (lista spesa), US-011 (geo/raggio: API + controllo nel frontend), US-013 (ottimizzazione toggle), US-015 (design system Liquid Glass + tema **Light/Dark/Auto**).
  - Prezzi: US-012 — recupero **automatico** dei prezzi reali Conad dal catalogo e-commerce (vedi sotto), validato dal vivo (11 alimenti su 16) + fallback baseline.
  - *(US-007/008/010/013 con test unitari nel dominio; auth/famiglia/dosi/import/prezzi/spesa/override verificati end-to-end via HTTP + contratto PWA.)*
- **IN_PROGRESS**:
  - US-005 — import con **revisione/correzione** (2026-06-09). **Estrazione text-first** (`extraction/pdf-text.ts` + `gemini-extractor.ts`): se il PDF ha un layer di testo si manda il TESTO a Gemini (chiamata leggera), vision solo come fallback per i PDF grafici → risparmio quota free tier. Deciso di usare il PDF di **Alessia** (testo) vs nutrizionista (Canva, grafico). **Flusso revisione**: import → bozza `REVIEW` (NON auto-conferma) → UI di correzione (`ImportScreen` DraftReview: modifica nome/quantità/unità, aggiungi/rimuovi voci) → conferma. Endpoint: `GET /plan/draft`, `PATCH /plan/items/:id`, `DELETE /plan/items/:id`, `POST /plan/meals/:mealId/items`. **Giornata-tipo → 7 giorni** espansa alla conferma. e2e non-AI verde (import→draft→edit→add→confirm); validazione estrazione Aic su PDF reale di Alessia in attesa di quota Gemini (reset giornaliero).
- **US-014 — offline/installabilità (completato 2026-06-09):** PWA installabile (manifest standalone + icone + theme). Service worker (Workbox) con **precache della shell** + **runtime caching `NetworkFirst` delle GET `/api/`** (cache `wh-api`, timeout 5s) → piano/lista/negozi/prezzi consultabili **offline** (ultima copia); `navigateFallback: index.html` per le route SPA offline. Token auth persistito in `localStorage` → reload offline resta loggato. Banner **"Sei offline"** (`OfflineBanner`). Build verde, SW verificato.

#### US-009 — varianti pasto AI REALI (completato 2026-06-09)
- Sostituito il mock statico (`data/variants.ts` rimosso) con generazione **AI vera**: `apps/api/src/plan/variants.ts` (`generateMealVariants`) chiama Gemini in **modalità testo** (leggera) chiedendo 3 alternative iso-macro, mappa i nomi a `canonicalFoodId`, con retry sui 503. Endpoint `POST /plan/variants` (503 pulito se AI occupata/quota).
- Frontend `MealEditSheet`: varianti **on-demand** via pulsante "Genera" (non automatiche, per risparmiare quota) + **cache di sessione** per firma del pasto; applicare una variante crea un override del pasto. Wiring verificato e2e (endpoint mappato, errore AI gestito con 503 amichevole); resa AC reale da validare a Gemini disponibile.

#### US-011 — geolocalizzazione REALE (completato 2026-06-09)
- `Store` ora ha **coordinate reali** (`lat`/`lon`) dei punti vendita vicino a Spoltore (PE), ricavate da scraper + geocoding Nominatim: Conad Superstore Via Fellini 2 (42.45566, 14.17783), Oasi (42.45416, 14.18878), Lidl Pescara (42.45658, 14.20751), Eurospin Pescara (42.484, 14.188), Todis Pescara (42.46702, 14.21604), Tigre Spoltore (42.42665, 14.16034).
- `getStores`/`buildOffers`/`shopping.compute` accettano la **posizione del dispositivo** (`lat`/`lon`) e calcolano la **distanza reale** (haversine); il filtro raggio usa quella. Senza posizione, fallback alla `distanceKm` di default da casa.
- Frontend: `AppContext.requestLocation()` (`navigator.geolocation`) + pulsante **"Usa la mia posizione"** nella ShopScreen con indicatore; le distanze nei chip negozio diventano reali. Verificato e2e: casa→Conad 0/Oasi 0.9/…; Roma raggio 5km→0 negozi.

#### US-012 — prezzi automatici (completato in questo run, 2026-06-09)
- **Architettura** su DB con freschezza (`Store`/`Price`, `fetchedAt`/`validTo`), `PriceProvider` astratto, refresh `@Cron` giornaliero (06:00) + `POST /prices/refresh`, offerte filtrate per raggio e per validità.
- **Adapter catalogo Conad automatico** (`apps/api/src/price/catalog/conad-catalog.ts`): legge `spesaonline.conad.it` via HTTP GET, fa il parse del JSON `data-product` (SSR) — **nessun upload, nessun browser, nessun token/OCR**. Selezione `PRICE_PROVIDER=conad-catalog`.
  - Mapping **per-categoria gated da regex** sul nome (no matching globale → niente falsi positivi tipo "Tonno all'olio" → olio).
  - Normalizzazione corretta €/kg · €/l · €/pz; **uova trattate a pezzo** (numero letto dal nome, non dal peso).
  - **Paginazione SSR** (`?page=N`) per gli alimenti non in prima pagina (es. parmigiano).
  - **Validato dal vivo (2026-06-09)**: 11/16 alimenti con prezzo reale (pasta 1,05 €/kg, riso 1,75, latte 0,95 €/l, yogurt 5,67 €/kg, parmigiano 14,95 €/kg, uova 0,26 €/pz, pollo 9,25 €/kg, tonno 10,59 €/kg, sugo 1,18, mandorle 17,90 €/kg, pane 2,13). Persistenza nel DB verificata end-to-end (`source: conad-online`).
  - **Fallback graceful**: gli alimenti non raggiungibili via HTTP anonimo (olio EVO e freschi hanno `basePrice 0` finché non si fissa il punto vendita; mela/banana/avena/insalata fuori scope catalogo) mantengono il prezzo baseline (`source: mock`).
- **Volantino Conad AUTOMATICO** (`apps/api/src/price/volantino/`, `POST /prices/volantino/auto`, cron settimanale) — **fonte prezzi PRIMARIA** (le offerte sono il cuore dell'app): scoperta volantini dalla pagina dello store → download pagine da Yumpu → vision AI → offerte. **Nessun upload.** `source: volantino:conad`, scadenza = validità del volantino.
  - **Catena scoperta (2026-06-09):** i volantini Conad sono su **Yumpu** (non ShopFully). La pagina del PV (`conad.it/ricerca-negozi/...--<storeId>`) incorpora un JSON con i volantini attivi (`title`, `validFrom/validTo`, **`yumpuId`**). Da `yumpu.com/it/document/json/<yumpuId>` (pubblico, no token) si ricavano pagine e dimensioni; le immagini sono pubbliche su `img.yumpu.com/<id>/<pag>/<dim>/x.jpg`. Store di Spoltore: **009890**, owner Yumpu `conad`.
  - **Priorità prezzi:** l'offerta volantino vince sul listino base; il refresh catalogo (`refresh()`) **non sovrascrive** un'offerta volantino ancora valida (`foodsWithActiveOffer`).
  - **Validato (2026-06-09):** discovery (3 volantini attivi: SOTTOCOSTO 28pp, BASSI E PROFUMATI 6pp, -10% freschissimi 1pp; polizza scartata) + download immagini + estrazione vision (9 prodotti reali da 2 pagine SOTTOCOSTO: Tonno Rio Mare 6,79€, Passata Mutti 0,89€, Latte Granarolo 0,79€/L, Yogurt Activia 1,69€…). Wiring DB+priorità: compila, percorso upsert eseguito.
  - **⚠️ Limite free tier Gemini:** `gemini-2.5-flash` free = **20 richieste/giorno** (+ 503 "high demand" sotto carico). Strategia: blocchi grandi (`VOLANTINO_PAGE_CHUNK=14`) per minimizzare le richieste + retry sui 503/429. Per uso affidabile serve una **chiave Gemini a pagamento** (o altro provider con quota). Il refresh completo non è stato ri-eseguito end-to-end oggi perché la quota giornaliera era esaurita dai test.
- **Offerte Lidl AUTOMATICHE** (`apps/api/src/price/catalog/lidl-offers.ts`, `LidlOffersProvider`) — **senza AI**: le pagine raccolta `lidl.it/c/...-kw-NN-AA/...` sono SSR e incorporano i prodotti in `data-grid-data="{JSON}"` con prezzo, prezzo base (`basePrice.text` "1 kg = X €"), validità e `regions`. Discovery delle pagine food dalla home + parsing diretto. **Validato (2026-06-09):** tonno 10,91 €/kg, pollo 3,49, pane 6,98 (le altre staple questa settimana erano solo piatti pronti, esclusi dal filtro derivati).
- **Offerte Oasi/Tigre AUTOMATICHE** (`apps/api/src/price/catalog/oasi-offers.ts`, `OasiOffersProvider`) — **senza AI**, Gruppo Gabrielli. Catena scoperta (2026-06-09): store locator **RetailTune** (`storegabrielli.retailtune.com/store/list.json.php`) → store id (Oasi Spoltore = **566**); volantino via servlet `/bin/gabrielli/servlet/leaflet?storeId=<id>` → documento **Calaméo** (ma hi-res protetto/403, OCR non praticabile sulle pubbliche 100–300px); **catalogo+promo su Doofinder** (`eu1-search.doofinder.com/6/<hashid>/_search`) con prezzi PER NEGOZIO (`priceValue<id>`/`pricePromoValue<id>`) e validità. Lo store 566 non fa e-commerce → non indicizzato; si usa il più vicino indicizzato **410 = Oasi Montesilvano** (stessa insegna/provincia, ~10 km) come riferimento di zona. Query mirate + vincolo foodId + solo unità KG/LT. **Validato:** 11 alimenti (tonno 12,60 €/kg, mandorle 11,98, olio EVO 4,98 €/L (3L), riso 1,69, yogurt 2,76…).
- **Offerte Eurospin AUTOMATICHE** (`apps/api/src/price/catalog/eurospin-offers.ts`, `EurospinOffersProvider`) — **senza AI**. Il volantino è un "digital flyer" con **API REST strutturata** (`digitalflyer.eurospin.it`): OAuth client-credentials (`/oauth/token`, authCode nel bundle JS) → `/stores` → `/stores/<alias>/promotions` (promo nazionale attiva) → `/promotions/<promo>/stores/<store>/products` (paginati) con `END-PRICE`, `END-KG-LT-PRICE`, `MEASURE-UNIT`, validità. **Validato (2026-06-09):** 10 alimenti (parmigiano 11,99 €/kg, olio EVO 4,49 €/L, yogurt 1,95, sugo 0,93, avena 2,58, pollo 4,49…). Store nazionale (default `montesilvano-1`, PE).
- **Volantino Todis AUTOMATICO** (`apps/api/src/price/volantino/todis-volantino-source.ts` + `refreshTodisVolantino`) — discovery via WP REST (`/wp-json/wp/v2/volantini`), seleziona il volantino regionale (Abruzzo, aggiornato di recente) → URL **PDF** dalla pagina (dFlip) → vision AI. **Validato:** discovery + download PDF (7,67MB, "Bassi e Bloccati Abruzzo…" agg. 8/6); estrazione vision **quota-gated** come Conad (Gemini free 20/dì). `source: volantino:todis`.
- **Refresh multi-catena** (`selectPriceProviders`): `PRICE_PROVIDER=conad-catalog,lidl-offers,oasi,eurospin` → `refresh()` esegue tutti i provider e fa upsert combinato. **Verificato (2026-06-09): 35 prezzi reali su 4 insegne** (Todis si aggiunge via vision quando c'è quota). Confronto "dove conviene" cross-insegna reale, es.: pollo Lidl 3,49 < Eurospin 4,49 < Conad 9,25 < Oasi 14,14; yogurt Eurospin 1,95 < Oasi 2,76 < Conad 5,67; sugo Eurospin 0,93 < Conad 1,18; olio Eurospin 4,49 < Oasi 4,98.
- **Filtro qualità match** (`catalogFoodId` in `food-catalog.ts`): per gli scraper scarta i nomi che sono piatti/derivati ("Arancini di riso", "Pomodori essiccati", "Tonno all'olio", "Pasta e broccoli") che il match a substring sbaglierebbe. L'import PDF resta su `canonicalFoodId` (match morbido).
- **Estrazione volantino da upload** (`POST /prices/volantino`): canale manuale/complementare per catene senza e-commerce o senza Yumpu.
- **Lista spesa ↔ confronto prezzi (frontend, 2026-06-09):** `buildOffers` arricchisce ogni offerta con `unitPrice`, `source`, `kind` (offerta/listino/stima) e `fetchedAt`; lo shopping payload espone `pricesUpdatedAt`. La `ShopScreen` mostra per ogni alimento il confronto multi-insegna con tag fonte, prezzo unitario (€/kg·l·pz), badge "più economico" e "risparmi €X", più pulsante **"Aggiorna prezzi"** (→ `POST /prices/refresh`) con stato di caricamento e riga di freschezza. Verificato e2e: 16 prodotti, 78 offerte su 4+ insegne, totale ottimizzato.
- **Stato insegne prezzi (tutte le insegne dell'utente coperte):** ✅ Conad (catalogo HTTP + volantino Yumpu/vision), ✅ Lidl (SSR data-grid, no AI), ✅ Oasi/Tigre (Doofinder, no AI), ✅ Eurospin (digital flyer API, no AI), ✅ Todis (PDF/vision, quota-gated). **4 su 5 senza AI.**
- **Aperti (fase 2):** chiave AI a pagamento per i volantini PDF/immagine (Conad, Todis) — gli altri 3 non ne hanno bisogno; prezzi base store-specifici via pinning PV Conad (olio EVO, freschi); raffinamenti di zona (Lidl `regions`, Oasi store 566 non indicizzato → proxy 410, Eurospin store nazionale).

### Note tecniche prezzi (discovery 2026-06-08)
- Conad ufficiale: nessun PDF/dato pubblico (app/JS). Aggregatori (DoveConviene/Tiendeo = ShopFully): pagine volantino sono **immagini pubbliche** su `it-it-media.shopfully.cloud`, ma l'elenco pagine è dietro **API token-gated (401)** + sfogliatore JS. E-commerce `spesaonline.conad.it`: **SSR con prezzi nell'HTML** per i confezionati → **scelto e implementato** come fonte automatica primaria (il fresco/olio EVO richiede pinning del negozio).
- **Esito (2026-06-09):** catalogo Conad SSR confermato come strada più affidabile e automatica → `ConadCatalogProvider` implementato e validato dal vivo (11/16 alimenti). Il volantino vision resta canale complementare per le catene senza e-commerce.
- **Struttura catalogo Conad** (per manutenzione): prodotti in card con attributo `data-product="{JSON}"`; chiavi utili `nome`, `basePrice`, `netQuantity`, `netQuantityUm` (KG/LT/L/GR/ML/CL/PZ…). `basePrice: 0` = prezzo store-dipendente (richiede pinning PV). Paginazione `?page=N`. Tassonomia categorie sotto `/c/<slug>--<codice>` (es. pasta `--1004`, riso `--1005`, latte `--0404`, formaggi `--0401`, uova `--0406`, pollo `--0204`, tonno `--0809`, sughi `--0804`, olio `--0801`, frutta secca `--0102`, forno `--09`).

### Attivazione bloccanti esterni
- Estrattori AI multi-provider dietro interfaccia (`createPdfExtractor`, `createVolantinoExtractor`): ordine **Gemini → Anthropic → mock**. Consigliato `GEMINI_API_KEY` (tier gratuito, https://aistudio.google.com/apikey); `gemini-2.5-flash` default. Anthropic resta alternativa a pagamento.
- Per i prezzi automatici (US-012): **adapter catalogo Conad implementato** (`PRICE_PROVIDER=conad-catalog`). Per estendere la copertura (olio EVO/freschi, altre catene) restano il pinning del PV Conad e/o l'acquisizione headless del volantino (ShopFully è JS + API token-gated).

> "REVIEW" qui = costruito e dimostrabile in questo run; la promozione a DONE resta una decisione umana dopo la tua review.

---

## EP-001 — Account & nucleo famiglia
*Permette ad Andrea e Alessia di accedere, condividere lo stesso nucleo e impostare ciascuno le proprie dosi: è la base del modello di consumo condiviso.*

#### US-001: Registrazione e accesso

**Epic:** EP-001 | **Priority:** HIGH | **Story Points:** 5 | **Status:** TODO
**Blocked by:** -

**Story**
Come Andrea, voglio registrarmi e accedere con un account, così che i miei dati di piano e spesa siano salvati e sincronizzati sul cloud.

**Demonstrates**
Un utente crea un account, effettua logout e login da un secondo dispositivo ritrovando i propri dati.

**Acceptance Criteria**
- [ ] È possibile registrarsi con email e password (o provider scelto) e ricevere conferma di account creato.
- [ ] Login con credenziali valide apre l'app sull'ultimo stato dell'utente; credenziali errate mostrano un messaggio chiaro.
- [ ] La sessione persiste alla riapertura della PWA finché non si fa logout.
- [ ] I dati dell'account sono sincronizzati: login da un secondo dispositivo mostra gli stessi dati.

**Out of scope**
- Recupero password avanzato (può essere base), 2FA, SSO aziendale.

**Open questions**
- Quale metodo di autenticazione primario (email/password vs social login)?

---

#### US-002: Creare e gestire il nucleo famiglia

**Epic:** EP-001 | **Priority:** HIGH | **Story Points:** 5 | **Status:** TODO
**Blocked by:** US-001

**Story**
Come Andrea, voglio creare un nucleo famiglia e invitare Alessia, così che condividiamo lo stesso piano e la stessa lista della spesa.

**Demonstrates**
Andrea crea il nucleo, invita Alessia che accetta; entrambi vedono lo stesso nucleo con due membri.

**Acceptance Criteria**
- [ ] Un utente può creare un nucleo famiglia di cui diventa membro.
- [ ] Il creatore può invitare un altro utente (es. via link/codice) che entra nello stesso nucleo.
- [ ] Tutti i membri del nucleo vedono l'elenco dei membri.
- [ ] Un membro può essere rimosso dal nucleo dal creatore.

**Out of scope**
- Ruoli/permessi granulari oltre creatore vs membro; nuclei multipli per utente.

**Open questions**
- Un utente può appartenere a più nuclei contemporaneamente?

---

#### US-003: Impostare le dosi personali per membro

**Epic:** EP-001 | **Priority:** HIGH | **Story Points:** 3 | **Status:** TODO
**Blocked by:** US-002

**Story**
Come Alessia, voglio impostare le mie dosi personali, così che il mio consumo rifletta le mie porzioni e non quelle "per 1" del piano.

**Demonstrates**
Alessia imposta un fattore/dosi diverse da Andrea; il consumo calcolato per i due membri risulta differente.

**Acceptance Criteria**
- [ ] Ogni membro può impostare le proprie dosi (es. fattore di porzione o quantità per pasto/alimento).
- [ ] Le dosi di un membro non modificano quelle degli altri membri.
- [ ] Le dosi impostate sono persistite e visibili al rientro nell'app.

**Out of scope**
- Calcolo nutrizionale automatico delle dosi in base a obiettivi (vedi Open question del PRD sullo scaling).

**Open questions**
- Le dosi si esprimono come fattore (x1.2) o come quantità assolute per alimento?

---

## EP-002 — Import del piano nutrizionale
*Trasforma il PDF del nutrizionista in un piano strutturato e corretto, gestendo i layout variabili con AI e una revisione umana obbligatoria.*

#### US-004: Caricare un PDF ed estrarre il piano con AI

**Epic:** EP-002 | **Priority:** HIGH | **Story Points:** 8 | **Status:** TODO
**Blocked by:** US-001

**Story**
Come Andrea, voglio caricare il PDF del piano settimanale ed estrarne automaticamente pasti, alimenti e quantità, così da non doverlo trascrivere a mano.

**Demonstrates**
Caricando un PDF reale, l'app produce una struttura giorni → pasti → alimenti → quantità in stato "da revisionare".

**Acceptance Criteria**
- [ ] L'utente può caricare un file PDF dall'app (mobile).
- [ ] Il sistema estrae via AI/OCR una struttura settimanale (giorni → pasti → alimenti → quantità).
- [ ] Il piano estratto è salvato con stato "da revisionare" e non ancora attivo.
- [ ] Se l'estrazione fallisce o è parziale, l'utente riceve un messaggio chiaro e può ritentare.

**Out of scope**
- Conferma e correzione del contenuto (US-005); supporto a formati diversi dal PDF.

**Open questions**
- Limiti di dimensione/numero pagine del PDF da supportare nell'MVP?

---

#### US-005: Revisionare e correggere l'import

**Epic:** EP-002 | **Priority:** HIGH | **Story Points:** 5 | **Status:** TODO
**Blocked by:** US-004

**Story**
Come Andrea, voglio rivedere e correggere gli alimenti/quantità interpretati male prima di confermare, così che il piano attivo sia accurato.

**Demonstrates**
Su un piano "da revisionare" con un errore di estrazione, Andrea corregge un alimento e una quantità, conferma, e il piano diventa attivo con i valori corretti.

**Acceptance Criteria**
- [ ] L'utente vede l'elenco di pasti/alimenti estratti, evidenziando quelli a bassa confidenza.
- [ ] È possibile modificare nome alimento, quantità e mapping a un alimento canonico.
- [ ] È possibile aggiungere o rimuovere un alimento da un pasto.
- [ ] Alla conferma il piano passa da "da revisionare" ad attivo per il nucleo.

**Out of scope**
- Modifica dei pasti post-attivazione (US-008); generazione varianti (US-009).

**Open questions**
- Come si costruisce/popola il catalogo alimenti canonico per il mapping (vedi PRD)?

---

## EP-003 — Piano, pasti e consumo condiviso
*Visualizza il piano settimanale, calcola il consumo condiviso del nucleo e consente correzioni e varianti che ricalcolano tutto di conseguenza.*

#### US-006: Visualizzare il piano settimanale

**Epic:** EP-003 | **Priority:** HIGH | **Story Points:** 5 | **Status:** TODO
**Blocked by:** US-005

**Story**
Come Andrea, voglio vedere il piano della settimana per giorno e pasto, così da avere il quadro di cosa si mangia e in quali quantità.

**Demonstrates**
Con un piano attivo, l'app mostra una vista settimanale navigabile con i pasti di ogni giorno e i relativi alimenti.

**Acceptance Criteria**
- [ ] La vista mostra i 7 giorni con colazione, pranzo, merenda e cena.
- [ ] Selezionando un pasto si vedono alimenti e quantità.
- [ ] La vista è leggibile e usabile su schermo telefono (mobile-first).

**Out of scope**
- Modifica dei pasti (US-008), varianti (US-009), calcolo consumo (US-007).

**Open questions**
- I tipi di pasto sono fissi (4) o configurabili?

---

#### US-007: Calcolo del consumo condiviso del nucleo

**Epic:** EP-003 | **Priority:** HIGH | **Story Points:** 5 | **Status:** TODO
**Blocked by:** US-003, US-006

**Story**
Come nucleo famiglia, vogliamo che il consumo settimanale sia la somma automatica delle dosi pianificate di tutti i membri, così che la spesa rifletta tutti senza interventi manuali.

**Demonstrates**
Con Andrea e Alessia che hanno dosi diverse sullo stesso piano, il consumo settimanale di un alimento risulta pari alla somma delle due dosi.

**Acceptance Criteria**
- [ ] Il consumo settimanale di ogni alimento è calcolato come somma delle dosi pianificate dei membri del nucleo.
- [ ] Di default, senza modifiche, il consumo segue esattamente il piano attivo.
- [ ] Aggiungere/rimuovere un membro o variarne le dosi aggiorna il consumo totale.

**Out of scope**
- Correzioni temporanee rispetto al reale (US-008); generazione lista spesa (US-010).

**Open questions**
- Come gestire un membro che salta del tutto un pasto in modo ricorrente?

---

#### US-008: Correggere/modificare un pasto con ricalcolo

**Epic:** EP-003 | **Priority:** HIGH | **Story Points:** 5 | **Status:** TODO
**Blocked by:** US-007

**Story**
Come Alessia, voglio modificare un pasto (in modo temporaneo o permanente) registrando cosa ho davvero mangiato, così che consumo e lista della spesa condivisi si ricalcolino di conseguenza.

**Demonstrates**
Alessia sostituisce una cena con un'alternativa; il consumo del nucleo e la lista della spesa si aggiornano automaticamente per riflettere il cambiamento.

**Acceptance Criteria**
- [ ] Un membro può modificare/sostituire un singolo pasto, scegliendo se la modifica è temporanea o permanente.
- [ ] Una modifica temporanea vale solo per l'occorrenza indicata; quella permanente aggiorna il piano.
- [ ] Dopo la modifica, il consumo del nucleo e la lista della spesa si ricalcolano automaticamente.
- [ ] La modifica è attribuita al membro che l'ha fatta e visibile agli altri membri.

**Out of scope**
- Suggerimento automatico delle alternative (US-009).

**Open questions**
- Una modifica permanente di un membro impatta solo le sue dosi o l'intero piano del nucleo?

---

#### US-009: Varianti AI del pasto

**Epic:** EP-003 | **Priority:** MEDIUM | **Story Points:** 5 | **Status:** TODO
**Blocked by:** US-006

**Story**
Come Andrea, voglio vedere varianti consigliate per ogni pasto che rispettino calorie e macro originali, così da variare senza rompere il piano nutrizionale.

**Demonstrates**
Su un pasto, l'app propone alternative iso-macro/iso-caloriche; applicandone una con un tap il pasto cambia e i valori restano equivalenti.

**Acceptance Criteria**
- [ ] Per un pasto, l'app mostra una o più varianti generate da AI con macro/calorie comparabili all'originale.
- [ ] Ogni variante indica gli alimenti proposti e l'equivalenza nutrizionale rispetto all'originale.
- [ ] Applicare una variante aggiorna il pasto (riusando il flusso di modifica US-008).

**Out of scope**
- Garanzia clinica/nutrizionale formale delle varianti.

**Open questions**
- Tolleranza accettabile sullo scostamento di macro/calorie per definire una variante "valida"?

---

## EP-004 — Lista della spesa, prezzi e convenienza
*Aggrega il consumo in una lista d'acquisto e, per ogni alimento, indica dove conviene comprarlo nel raggio scelto, ottimizzando secondo la preferenza dell'utente.*

#### US-010: Generare la lista della spesa aggregata

**Epic:** EP-004 | **Priority:** HIGH | **Story Points:** 5 | **Status:** TODO
**Blocked by:** US-007

**Story**
Come Andrea, voglio una lista della spesa che aggreghi gli alimenti della settimana con le quantità totali, così da sapere esattamente cosa comprare.

**Demonstrates**
Da un piano con consumo calcolato, l'app produce una lista d'acquisto con un'unica riga per alimento e la quantità totale settimanale.

**Acceptance Criteria**
- [ ] La lista aggrega gli alimenti del piano della settimana sommando le quantità di tutti i membri.
- [ ] Ogni alimento compare una sola volta con la quantità totale necessaria.
- [ ] La lista si aggiorna quando cambiano piano, dosi o modifiche ai pasti.
- [ ] L'utente può spuntare gli articoli come acquistati.

**Out of scope**
- Prezzi e negozi (US-012); ottimizzazione (US-013).

**Open questions**
- Le unità di misura vanno normalizzate (es. g/kg, pz) per l'aggregazione?

---

#### US-011: Impostare posizione e raggio di ricerca

**Epic:** EP-004 | **Priority:** HIGH | **Story Points:** 3 | **Status:** TODO
**Blocked by:** US-001

**Story**
Come Andrea, voglio impostare la mia posizione e un raggio in km, così da considerare solo i negozi vicini a me.

**Demonstrates**
Andrea imposta posizione e raggio; l'app mostra l'elenco/mappa dei negozi supportati entro quel raggio.

**Acceptance Criteria**
- [ ] L'utente può impostare la posizione (geolocalizzazione o inserimento manuale).
- [ ] L'utente può configurare un raggio in km.
- [ ] L'app elenca/mostra i negozi supportati entro il raggio impostato.
- [ ] Le impostazioni di posizione/raggio sono persistite.

**Out of scope**
- Recupero prezzi (US-012); calcolo percorso/navigazione tra negozi.

**Open questions**
- Range minimo/massimo del raggio e default sensato per città vs provincia?

---

#### US-012: Prezzi e "dove conviene" per alimento

**Epic:** EP-004 | **Priority:** HIGH | **Story Points:** 8 | **Status:** TODO
**Blocked by:** US-010, US-011

**Story**
Come Andrea, voglio vedere per ogni alimento i prezzi nei negozi vicini con un suggerito, così da sapere dove conviene comprarlo.

**Demonstrates**
Per un alimento della lista, l'app mostra i prezzi disponibili in più negozi del raggio e indica il negozio suggerito.

**Acceptance Criteria**
- [ ] Per ogni alimento della lista, il sistema recupera i prezzi/offerte disponibili dai negozi nel raggio.
- [ ] Le fonti sono prioritizzate: prima i siti dei supermercati (Conad, Oasi, Lidl, Eurospin, Todis, Tigre), poi gli aggregatori (DoveConviene/PromoQui).
- [ ] L'alimento mostra i prezzi per negozio e un negozio "suggerito".
- [ ] Gli alimenti senza prezzo disponibile sono indicati chiaramente come tali.
- [ ] I prezzi mostrano un riferimento temporale/aggiornamento.

**Out of scope**
- Strategia di ottimizzazione multi-negozio (US-013); acquisto/checkout.

**Open questions**
- Fallback per alimenti senza prezzo nel raggio (media nazionale vs esclusione)?
- Frequenza di aggiornamento e gestione scadenza offerte (vedi PRD).

---

#### US-013: Ottimizzazione spesa con toggle "spendo meno / meno tappe"

**Epic:** EP-004 | **Priority:** MEDIUM | **Story Points:** 5 | **Status:** TODO
**Blocked by:** US-012

**Story**
Come Andrea, voglio scegliere tra "spendo meno" e "meno tappe", così da decidere il compromesso tra risparmio e numero di negozi da visitare.

**Demonstrates**
Cambiando il toggle, la lista riorganizza i negozi suggeriti: "spendo meno" può proporre più negozi al prezzo minimo, "meno tappe" concentra gli acquisti in 1-2 negozi.

**Acceptance Criteria**
- [ ] È presente un toggle "spendo meno" / "meno tappe".
- [ ] "Spendo meno" assegna ogni alimento al negozio col prezzo più basso nel raggio.
- [ ] "Meno tappe" minimizza il numero di negozi bilanciando il risparmio (es. 1-2 negozi).
- [ ] L'app mostra il totale stimato e il numero di negozi per la strategia scelta.

**Out of scope**
- Ottimizzazione del percorso/navigazione tra i negozi.

**Open questions**
- Soglia massima di tappe per la modalità "meno tappe" (fissa o configurabile)?

---

## EP-005 — Piattaforma PWA & Liquid Glass
*Rende l'esperienza installabile, utilizzabile offline per la consultazione e coerente con l'estetica "Liquid Glass" iOS, riusando la suite EQP.*

#### US-014: PWA installabile con consultazione offline

**Epic:** EP-005 | **Priority:** MEDIUM | **Story Points:** 3 | **Status:** TODO
**Blocked by:** US-006

**Story**
Come Andrea, voglio installare l'app sul telefono e consultare piano e lista anche offline, così da usarla comodamente al supermercato senza connessione stabile.

**Demonstrates**
L'app è installabile dalla home del telefono e, offline, mostra piano e lista della spesa già caricati.

**Acceptance Criteria**
- [ ] L'app è installabile come PWA (manifest + service worker) con icona e splash.
- [ ] Offline è possibile consultare il piano e la lista della spesa già scaricati.
- [ ] Le azioni che richiedono rete (prezzi, import, sync) degradano con un messaggio chiaro quando offline.

**Out of scope**
- Sincronizzazione offline avanzata con risoluzione conflitti.

**Open questions**
- Quali dati vanno resi disponibili offline oltre a piano e lista?

---

#### US-015: Design system "Liquid Glass"

**Epic:** EP-005 | **Priority:** MEDIUM | **Story Points:** 5 | **Status:** TODO
**Blocked by:** -

**Story**
Come Andrea, voglio un'interfaccia fluida e moderna in stile "Liquid Glass" iOS, così che l'esperienza mobile sia piacevole e coerente.

**Demonstrates**
Le schermate principali adottano un tema glassmorphism coerente (sfondi sfocati, trasparenze, profondità) costruito con Tailwind e Framer Motion.

**Acceptance Criteria**
- [ ] Esiste un tema/design system "Liquid Glass" (token Tailwind + componenti glass riutilizzabili).
- [ ] Le schermate chiave (piano, lista, prezzi) usano lo stesso linguaggio visivo glassmorphism.
- [ ] Il tema è leggibile e accessibile (contrasto sufficiente) su mobile.

**Out of scope**
- Tema chiaro/scuro multiplo e personalizzazione utente del tema.

**Open questions**
- Serve una validazione visiva con mockup (`/eq-design`) prima dell'implementazione?

---

> **PROSSIMO PASSO:** scegli una user story dalla lista sopra (priorità HIGH per prima) ed esegui `/eq-plan US-001` per la pianificazione tecnica. Per un riepilogo dello stato corrente, esegui `/eq-next`.
