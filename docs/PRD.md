# PRD — WeeklyHome

**Data:** 2026-06-08 | **Stato:** v1

## Visione
WeeklyHome è una PWA mobile-first (estetica "Liquid Glass" iOS) che trasforma un
piano nutrizionale settimanale in PDF nella spesa di famiglia più conveniente.
Importa il piano, lo rende modificabile per membro e per pasto, e per ogni
alimento indica dove conviene comprarlo in zona, leggendo offerte e prezzi dai
siti dei supermercati e dai volantini nel raggio scelto.

## Modello di consumo (condiviso)
La spesa è **condivisa a livello di nucleo famiglia**: il consumo settimanale di
risorse è la **somma di ciò che ogni membro ha pianificato** (piano + dosi
personali). Di **default il consumo è automatico** — se nessuno modifica il
piano, ogni membro consuma esattamente quanto scritto e la lista della spesa
condivisa deriva da lì. Le **modifiche temporanee sono correzioni rispetto al
reale**: se un membro mangia qualcosa di diverso da quanto pianificato, registra
ciò che ha effettivamente mangiato e la lista/consumo condivisi si **ricalcolano
di conseguenza**.

## Personas

### Andrea — Capofamiglia "meal-prepper" (attento al budget)
- **Contesto:** segue un piano nutrizionale, organizza la spesa per tutta la famiglia, usa il telefono. Vuole spendere meno ma senza girare 5 supermercati.
- **Pain:** importare a mano il piano è noioso; le offerte sono frammentate tra volantini e siti diversi, confrontarle a mano è impossibile; gira più negozi senza sapere se risparmia davvero.
- **Job-to-be-done:** "Importo il PDF del piano e ottengo una lista della spesa già ottimizzata su prezzi e offerte vicino a me, scegliendo se spendere meno o fare meno tappe."

### Alessia — Membro famiglia con dosi proprie
- **Contesto:** condivide la spesa di famiglia ma ha porzioni/obiettivi diversi da Andrea; ogni tanto cambia un pasto al volo.
- **Pain:** i piani sono pensati "per 1"; non può adattare le proprie dosi né sostituire una cena last-minute senza rifare i conti della spesa condivisa.
- **Job-to-be-done:** "Imposto le mie dosi e correggo un pasto con ciò che ho davvero mangiato, e la lista della spesa condivisa si ricalcola da sola."

## MVP Scope

### In scope
- **Import PDF con AI/OCR** — estrazione del piano settimanale (pasti, alimenti, quantità) da PDF a layout variabile.
- **Revisione/correzione import** — l'utente corregge alimenti/quantità interpretati male prima di confermare.
- **Account famiglia + dosi per membro** — login, nucleo famiglia, ogni membro imposta le proprie dosi; sync multi-device.
- **Consumo condiviso automatico** — la spesa è del nucleo: il consumo settimanale è la somma delle dosi pianificate dei membri e di default segue il piano senza interventi.
- **Modifica temporanea pasto (correzione reale)** — un membro registra cosa ha mangiato di diverso dal piano; lista e quantità condivise si ricalcolano automaticamente.
- **Varianti AI del pasto** — suggerimenti alternativi che rispettano i macro/calorie del pasto originale.
- **Lista della spesa ottimizzata** — aggregazione alimenti della settimana in lista d'acquisto.
- **Prezzi & "dove conviene"** — per ogni alimento, prezzi nei negozi entro il raggio (prima siti supermercati: Conad, Oasi, Lidl, Eurospin, Todis, Tigre; poi aggregatori DoveConviene/PromoQui), con suggerito.
- **Toggle ottimizzazione** — "spendo meno" (prezzo minimo assoluto, anche più negozi) vs "meno tappe" (1-2 negozi).
- **Geolocalizzazione + raggio configurabile** (km).
- **PWA installabile** mobile-first, tema Liquid Glass.

### Out of scope (per ora)
- Ordine/consegna online o carrello presso i supermercati (solo indicazione di prezzo/negozio).
- Pagamenti / abbonamenti.
- Generazione del piano nutrizionale (l'app lo importa, non lo crea).
- App native iOS/Android da store (solo PWA).
- Storico nutrizionale / tracking calorie giornaliero avanzato.
- Copertura nazionale completa di tutte le catene (si parte da quelle elencate).

## Requisiti funzionali (high level)
1. **RF-1 Import:** caricare un PDF ed estrarne via AI/OCR la struttura settimanale (giorni → pasti → alimenti → quantità), con stato "da revisionare".
2. **RF-2 Correzione:** editare alimenti, quantità e mapping a un alimento canonico prima di confermare il piano.
3. **RF-3 Account & dosi:** creare/gestire un nucleo famiglia; ogni membro imposta dosi personali per alimento/pasto; sync su più dispositivi.
4. **RF-4 Consumo condiviso:** calcolare il consumo settimanale del nucleo come somma delle dosi pianificate dei membri; di default automatico dal piano, senza interventi.
5. **RF-5 Modifica/correzione pasto:** un membro può sostituire/modificare un pasto (permanente o temporaneo) registrando cosa ha realmente mangiato; quantità e lista spesa condivise si ricalcolano in automatico.
6. **RF-6 Varianti AI:** per ogni pasto, proporre alternative iso-macro/iso-caloriche generate da AI, applicabili con un tap.
7. **RF-7 Lista spesa:** aggregare gli alimenti della settimana (sommando dosi dei membri) in una lista d'acquisto con quantità totali.
8. **RF-8 Prezzi & negozi:** recuperare prezzi/offerte per ogni alimento dai negozi entro il raggio (priorità: siti supermercati → aggregatori) e mostrare prezzo per negozio + suggerito.
9. **RF-9 Ottimizzazione:** calcolare la spesa secondo il toggle "spendo meno" / "meno tappe".
10. **RF-10 Geo:** impostare posizione e raggio; filtrare negozi disponibili.
11. **RF-11 PWA:** installabilità, offline base (consultazione lista/piano), tema Liquid Glass.

## Architettura proposta (high level)
- **Frontend:** PWA **Vite + React + TypeScript + Tailwind CSS**, con **Framer Motion** per le micro-animazioni fluide e **vite-plugin-pwa** per manifest/service worker (installabilità/offline). Design system custom "Liquid Glass" (glassmorphism) costruito in Tailwind. Consuma il package condiviso `@weeklyhome/domain` per consumo/lista/ottimizzazione. *(Niente librerie EQP in questo progetto.)*
- **Backend:** **Node/NestJS** (TypeScript, full-stack coerente con Angular). Moduli: auth/famiglia (JWT), import & estrazione PDF, catalogo alimenti, motore prezzi/scraping, ottimizzatore spesa, varianti AI.
- **Estrazione PDF & varianti:** integrazione **LLM** (es. Claude) per parsing PDF a layout variabile e generazione varianti iso-macro.
- **Prezzi:** servizio di acquisizione che interroga prima i siti dei supermercati (scraping mirato, es. Playwright) poi gli aggregatori come fallback; normalizzazione su un catalogo alimenti canonico.
- **Dati:** **Postgres + PostGIS** (query geo a raggio sui negozi), object storage per i PDF.
- **Decisione architetturale chiave:** scraping fragile isolato in un servizio dedicato con cache, così che un cambio sito non rompa l'app.

## Metriche di successo
- **Tasso import corretto:** ≥ 85% degli alimenti estratti dal PDF accettati senza correzione manuale (misurato sul flusso di revisione).
- **Risparmio medio dimostrato:** ≥ 10% di risparmio sulla lista ottimizzata vs prezzo medio di riferimento (calcolato dal motore prezzi).
- **Time-to-list:** dall'upload del PDF alla lista spesa con prezzi in < 2 minuti (P90).
- **Copertura prezzi:** ≥ 70% degli alimenti della lista con almeno un prezzo da un negozio nel raggio.

## Open questions
- Legalità/robustezza dello scraping dei siti supermercati e degli aggregatori: ToS, rate limit, antibot — serve verifica per ogni catena prioritaria.
- Catalogo alimenti canonico: costruirlo da zero o partire da una base esistente (es. dataset open / Open Food Facts)?
- Come gestire alimenti senza prezzo nel raggio (fallback prezzo medio nazionale? esclusione?).
- "Dose" del PDF "per 1" → come scalare correttamente per membri con obiettivi diversi (regola macro vs porzione fissa)?
- Frequenza di aggiornamento prezzi/volantini e gestione cache/scadenze offerte.
- Aggiornamento del piano "ogni TOT": settimanale fisso o cadenza libera per import?

## Decisioni esplicite
- **Backend Node/NestJS** invece di .NET: un solo linguaggio (TS) con Angular, ecosistema migliore per scraping (Playwright) e AI; riduce context-switch. .NET resta opzione se emergono vincoli aziendali EQP.
- **Estrazione PDF via AI** (non parser template) perché i PDF hanno layout variabile, con revisione umana obbligatoria prima di confermare.
- **Strategia spesa a toggle** ("spendo meno" / "meno tappe") invece di una singola euristica: l'utente decide il trade-off risparmio/comodità.
- **Frontend Vite + React + Tailwind + Framer Motion** (no EQP): stack più adatto a una UI mobile fluida e animata in stile Liquid Glass, leggero e con ecosistema ricco; consuma il dominio condiviso in TypeScript.
- **Solo PWA** (no app native) per un unico codebase e installabilità cross-device.
- **Fonti prezzi prioritizzate:** siti supermercati prima, aggregatori come fallback, per dati più affidabili dove possibile.

---

> **PROSSIMO PASSO:** invoca `/eq-spec --prd docs/PRD.md` per trasformare questa visione in un backlog di user story.
