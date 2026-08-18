import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  MapPin,
  Store as StoreIcon,
  ChevronDown,
  Minus,
  Plus,
  ShoppingCart,
  RefreshCw,
  Navigation,
  Newspaper,
  Share,
} from 'lucide-react';
import {
  optimizeCheapest,
  optimizeFewestStops,
  type PriceOffer,
} from '@weeklyhome/domain';
import { useApp } from '../state/AppContext';
import { GlassCard } from '../components/GlassCard';
import { SegmentedToggle } from '../components/SegmentedToggle';
import { cn } from '../lib/cn';
import { eur, qty, unitEur, timeAgo } from '../lib/format';
import type { ApiOptimization, ApiShopping, OfferKind } from '../api/types';

const KIND_STYLE: Record<OfferKind, { label: string; cls: string }> = {
  offerta: { label: 'offerta', cls: 'bg-mint/20 text-mint' },
  listino: { label: 'listino', cls: 'bg-fill text-fg/60' },
  stima: { label: 'stima', cls: 'bg-amber/20 text-amber' },
};

function KindBadge({ kind }: { kind: OfferKind }) {
  const s = KIND_STYLE[kind];
  return (
    <span className={cn('rounded-full px-1.5 py-0.5 text-[10px] font-semibold', s.cls)}>{s.label}</span>
  );
}

export function ShopScreen() {
  const { shopping, mode, setMode, radiusKm, setRadius, foodMeta } = useApp();
  const [expanded, setExpanded] = useState<string | null>(null);

  if (!shopping || !shopping.hasPlan) {
    return <EmptyState />;
  }

  return (
    <Loaded
      shopping={shopping}
      mode={mode}
      setMode={setMode}
      radiusKm={radiusKm}
      setRadius={setRadius}
      expanded={expanded}
      setExpanded={setExpanded}
      foodMeta={foodMeta}
    />
  );
}

function Loaded({
  shopping,
  mode,
  setMode,
  radiusKm,
  setRadius,
  expanded,
  setExpanded,
  foodMeta,
}: {
  shopping: ApiShopping;
  mode: 'cheapest' | 'fewest';
  setMode: (m: 'cheapest' | 'fewest') => void;
  radiusKm: number;
  setRadius: (km: number) => void;
  expanded: string | null;
  setExpanded: (id: string | null) => void;
  foodMeta: ReturnType<typeof useApp>['foodMeta'];
}) {
  const {
    refreshPrices,
    refreshingPrices,
    refreshVolantini,
    refreshingVolantini,
    volantiniStarted,
    userPos,
    locating,
    requestLocation,
  } = useApp();
  // Filtro negozi (solo vista): i negozi ESCLUSI dalla selezione. Vuoto = tutti
  // attivi. Ricalcoliamo la spesa lato client sui soli negozi attivi, senza rete.
  const [excluded, setExcluded] = useState<Set<string>>(() => new Set());
  const storeById = useMemo(
    () => new Map(shopping.stores.map((s) => [s.id, s])),
    [shopping.stores],
  );

  // Negozi attivi (id). Se l'utente li esclude tutti, torniamo a "tutti".
  const activeIds = useMemo(() => {
    const on = shopping.stores.filter((s) => !excluded.has(s.id)).map((s) => s.id);
    return new Set(on.length > 0 ? on : shopping.stores.map((s) => s.id));
  }, [shopping.stores, excluded]);

  // Ottimizzazione ricalcolata sui soli negozi attivi (riusa l'optimizer del
  // dominio: stesso identico risultato del server quando sono tutti attivi).
  const result = useMemo<ApiOptimization>(() => {
    const foodIds = shopping.list.map((r) => r.foodId);
    const offers = shopping.offers.filter((o) =>
      activeIds.has(o.storeId),
    ) as unknown as PriceOffer[];
    return mode === 'fewest'
      ? optimizeFewestStops(foodIds, offers, 2)
      : optimizeCheapest(foodIds, offers);
  }, [shopping.list, shopping.offers, activeIds, mode]);

  const assignmentByFood = useMemo(
    () => new Map(result.assignments.map((a) => [a.foodId, a])),
    [result],
  );
  const offersByFood = useMemo(() => {
    const map = new Map<string, typeof shopping.offers>();
    for (const o of shopping.offers) {
      if (!activeIds.has(o.storeId)) continue;
      const list = map.get(o.foodId) ?? [];
      list.push(o);
      map.set(o.foodId, list);
    }
    for (const list of map.values()) list.sort((a, b) => a.price - b.price);
    return map;
  }, [shopping.offers, activeIds]);

  const toggleStore = (id: string) =>
    setExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const handleShare = async () => {
    const byStore = new Map<string, { name: string; qty: string }[]>();
    const unavailable: { name: string; qty: string }[] = [];

    for (const row of shopping.list) {
      const food = foodMeta(row.foodId, row.name);
      const assigned = assignmentByFood.get(row.foodId);
      const q = qty(row.quantity);
      if (assigned && activeIds.has(assigned.storeId)) {
        const list = byStore.get(assigned.storeId) ?? [];
        list.push({ name: food.name, qty: q });
        byStore.set(assigned.storeId, list);
      } else {
        unavailable.push({ name: food.name, qty: q });
      }
    }

    let text = '🛒 *Spesa della Settimana*\n\n';

    for (const [storeId, items] of byStore.entries()) {
      const storeName = storeById.get(storeId)?.name ?? 'Sconosciuto';
      text += `📍 *${storeName}*\n`;
      for (const item of items) {
        text += `• ${item.qty} ${item.name}\n`;
      }
      text += '\n';
    }

    if (unavailable.length > 0) {
      text += `❌ *Non disponibili*\n`;
      for (const item of unavailable) {
        text += `• ${item.qty} ${item.name}\n`;
      }
      text += '\n';
    }

    try {
      if (navigator.share) {
        await navigator.share({ text });
      } else {
        await navigator.clipboard.writeText(text);
        alert('Lista copiata negli appunti!');
      }
    } catch (e) {
      // Ignora errori da annullamento condivisione
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <header className="flex items-start justify-between gap-3 px-1">
        <div>
          <p className="text-sm font-medium text-fg/60">La spesa della settimana</p>
          <h1 className="text-3xl font-bold tracking-tight text-fg">
            {shopping.list.length} prodotti
          </h1>
          <p className="mt-1 text-xs text-fg/45">
            {shopping.pricesUpdatedAt
              ? `Prezzi aggiornati ${timeAgo(shopping.pricesUpdatedAt)}`
              : 'Prezzi non ancora aggiornati'}
          </p>
        </div>
        <div className="flex flex-col items-stretch gap-2">
          <button
            onClick={() => void refreshPrices()}
            disabled={refreshingPrices}
            className="glass flex items-center justify-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-semibold text-fg transition active:scale-95 disabled:opacity-60"
          >
            <RefreshCw className={cn('size-4', refreshingPrices && 'animate-spin')} />
            {refreshingPrices ? 'Aggiorno…' : 'Aggiorna prezzi'}
          </button>
          <button
            onClick={() => void refreshVolantini()}
            disabled={refreshingVolantini}
            title="Riestrae i volantini Conad e Todis (richiede qualche minuto)"
            className="glass flex items-center justify-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-semibold text-fg transition active:scale-95 disabled:opacity-60"
          >
            <Newspaper className={cn('size-4', refreshingVolantini && 'animate-pulse')} />
            {refreshingVolantini ? 'Avvio…' : 'Aggiorna volantini'}
          </button>
        </div>
      </header>

      {volantiniStarted && (
        <p className="rounded-2xl bg-fg/5 px-4 py-3 text-xs text-fg/70">
          Aggiornamento volantini avviato: richiede qualche minuto. Tra poco tocca di nuovo
          «Aggiorna prezzi» per vedere le nuove offerte.
        </p>
      )}

      <GlassCard strong className="p-5">
        <div className="flex items-end justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-fg/55">Totale stimato</p>
            <p className="text-4xl font-bold text-fg">{eur(result?.total ?? 0)}</p>
          </div>
          <div className="flex items-center gap-1.5 rounded-full bg-fill px-3 py-1.5 text-sm font-medium text-fg/85">
            <StoreIcon className="size-4" />
            {result?.storeCount ?? 0} {(result?.storeCount ?? 0) === 1 ? 'negozio' : 'negozi'}
          </div>
        </div>

        <div className="mt-4">
          <SegmentedToggle
            segments={[
              { id: 'cheapest', label: 'Spendo meno' },
              { id: 'fewest', label: 'Meno tappe' },
            ]}
            value={mode}
            onChange={setMode}
            layoutId="shop-mode"
          />
        </div>

        <div className="mt-3 flex items-center justify-between rounded-2xl bg-fill px-4 py-2.5">
          <span className="flex items-center gap-1.5 text-sm text-fg/75">
            <MapPin className="size-4" /> Raggio
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setRadius(radiusKm - 0.5)}
              className="grid size-8 place-items-center rounded-full bg-fill text-fg transition-colors hover:text-fg active:scale-95"
              aria-label="Riduci raggio"
            >
              <Minus className="size-4" />
            </button>
            <span className="w-14 text-center text-sm font-bold text-fg">{radiusKm} km</span>
            <button
              onClick={() => setRadius(radiusKm + 0.5)}
              className="grid size-8 place-items-center rounded-full bg-fill text-fg transition-colors hover:text-fg active:scale-95"
              aria-label="Aumenta raggio"
            >
              <Plus className="size-4" />
            </button>
          </div>
        </div>

        <button
          onClick={() => void requestLocation()}
          disabled={locating}
          className="mt-2 flex w-full items-center justify-between rounded-2xl bg-fill px-4 py-2.5 text-left active:scale-[0.99] disabled:opacity-60"
        >
          <span className="flex items-center gap-1.5 text-sm text-fg/75">
            <Navigation className={cn('size-4', locating && 'animate-pulse')} />
            {userPos ? 'Distanze reali dalla tua posizione' : 'Usa la mia posizione'}
          </span>
          <span className="text-xs font-medium text-accent">
            {locating ? 'localizzo…' : userPos ? 'attiva' : 'attiva'}
          </span>
        </button>
        {!userPos && (
          <p className="mt-1.5 px-1 text-[11px] text-fg/40">
            Senza posizione, le distanze sono stimate da Spoltore (Via Fellini).
          </p>
        )}

        {(result?.unavailable.length ?? 0) > 0 && (
          <p className="mt-3 text-sm text-rose">
            {result!.unavailable.length} prodotti senza offerte nel raggio
          </p>
        )}

        {(shopping.unitConflicts?.length ?? 0) > 0 && (
          <p className="mt-3 text-sm text-amber">
            {shopping.unitConflicts!.length} alimenti con unità incoerenti
            ({shopping.unitConflicts!.map((id) => foodMeta(id).name).join(', ')}):
            ricontrolla grammi/pezzi nella revisione del piano.
          </p>
        )}

        <button
          onClick={() => void handleShare()}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-mint/20 px-4 py-3 text-sm font-semibold text-mint-900 transition-colors hover:bg-mint/30 active:scale-[0.99] dark:text-mint-400"
        >
          <Share className="size-4" /> Invia su WhatsApp
        </button>
      </GlassCard>

      {shopping.stores.length > 0 && (
        <div>
          <p className="mb-2 px-1 text-xs font-medium uppercase tracking-wide text-fg/45">
            Negozi · tocca per filtrare
          </p>
          <div className="-mx-5 flex gap-2 overflow-x-auto px-5">
            {shopping.stores.map((s) => {
              const on = !excluded.has(s.id);
              return (
                <button
                  key={s.id}
                  onClick={() => toggleStore(s.id)}
                  aria-pressed={on}
                  className={cn(
                    'flex shrink-0 items-center gap-2 rounded-full py-2 pl-2 pr-3.5 transition active:scale-95',
                    on ? 'glass text-fg' : 'border border-line text-fg/40',
                  )}
                >
                  <span
                    className={cn('size-6 rounded-full transition-opacity', !on && 'opacity-30')}
                    style={{ backgroundColor: s.brandColor }}
                    aria-hidden
                  />
                  <span className="text-sm font-semibold">{s.name}</span>
                  <span
                    className={cn(
                      'flex items-center gap-0.5 text-xs',
                      on ? 'text-fg/55' : 'text-fg/30',
                    )}
                  >
                    <MapPin className="size-3" />
                    {s.distanceKm} km
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2.5">
        {shopping.list.map((row, idx) => {
          const food = foodMeta(row.foodId, row.name);
          const assigned = assignmentByFood.get(row.foodId);
          const store = assigned ? storeById.get(assigned.storeId) : undefined;
          const isOpen = expanded === row.foodId;
          const others = offersByFood.get(row.foodId) ?? [];
          const bestOffer = assigned
            ? others.find((o) => o.storeId === assigned.storeId)
            : undefined;
          const savings =
            others.length > 1 ? others[others.length - 1].price - others[0].price : 0;

          return (
            <GlassCard
              key={row.foodId}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(idx * 0.025, 0.3) }}
              className="overflow-hidden"
            >
              <button
                onClick={() => setExpanded(isOpen ? null : row.foodId)}
                className="flex w-full items-center gap-3 p-4 text-left"
              >
                <span className="grid size-11 place-items-center rounded-2xl bg-fill text-xl">
                  {food.emoji}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-fg">{food.name}</p>
                  <p className="text-xs text-fg/55">{qty(row.quantity)}</p>
                </div>
                <div className="text-right">
                  {assigned && store ? (
                    <>
                      <p className="text-sm font-bold text-fg">{eur(assigned.price)}</p>
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-fg/70">
                        <span className="size-2 rounded-full" style={{ backgroundColor: store.brandColor }} />
                        {store.name}
                        {bestOffer && <KindBadge kind={bestOffer.kind} />}
                      </span>
                    </>
                  ) : (
                    <span className="text-xs font-medium text-rose">non disponibile</span>
                  )}
                </div>
                <ChevronDown
                  className={cn('size-4 shrink-0 text-fg/50 transition-transform', isOpen && 'rotate-180')}
                />
              </button>

              <AnimatePresence initial={false}>
                {isOpen && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.22 }}
                  >
                    <div className="border-t border-line px-4 py-3">
                      <div className="mb-2 flex items-center justify-between">
                        <p className="text-xs font-medium uppercase tracking-wide text-fg/45">
                          Prezzi vicino a te
                        </p>
                        {savings > 0.01 && (
                          <span className="rounded-full bg-mint/15 px-2 py-0.5 text-[11px] font-semibold text-mint">
                            risparmi {eur(savings)}
                          </span>
                        )}
                      </div>
                      {others.length === 0 && (
                        <p className="text-sm text-fg/50">Nessuna offerta nel raggio.</p>
                      )}
                      <ul className="flex flex-col gap-1.5">
                        {others.map((o, i) => {
                          const st = storeById.get(o.storeId);
                          const isBest = assigned?.storeId === o.storeId;
                          return (
                            <li key={o.storeId} className="flex flex-col gap-1">
                              <div className="flex items-center justify-between text-sm">
                                <span className="flex items-center gap-2 text-fg/80">
                                  <span className="size-2.5 rounded-full" style={{ backgroundColor: st?.brandColor }} />
                                  {st?.name}
                                  <KindBadge kind={o.kind} />
                                  {i === 0 && others.length > 1 && (
                                    <span className="rounded-full bg-mint/20 px-2 py-0.5 text-[10px] font-semibold text-mint">
                                      più economico
                                    </span>
                                  )}
                                </span>
                                <span className="flex items-baseline gap-1.5">
                                  <span className="text-[11px] text-fg/40">
                                    {unitEur(o.unitPrice, row.quantity.unit)}
                                  </span>
                                  <span className={cn('font-medium', isBest ? 'text-fg' : 'text-fg/55')}>
                                    {eur(o.price)}
                                  </span>
                                </span>
                              </div>
                              {o.products && o.products.length > 0 && (
                                <ul className="ml-4 flex flex-col gap-0.5 border-l border-line pl-2.5">
                                  {o.products.map((pr, j) => (
                                    <li key={j} className="flex items-center justify-between gap-2 text-xs text-fg/55">
                                      <span className="min-w-0 truncate">
                                        {pr.brand && <strong className="text-fg/80">{pr.brand}</strong>}
                                        {pr.brand ? ' · ' : ''}
                                        {pr.name}
                                      </span>
                                      <span className="shrink-0 text-[11px] text-fg/45">
                                        {unitEur(pr.unitPrice, row.quantity.unit)}
                                      </span>
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </GlassCard>
          );
        })}
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col gap-5">
      <header className="px-1">
        <p className="text-sm font-medium text-fg/60">La spesa della settimana</p>
        <h1 className="text-3xl font-bold tracking-tight text-fg">Spesa</h1>
      </header>
      <GlassCard strong className="flex flex-col items-center gap-3 p-8 text-center">
        <span className="grid size-14 place-items-center rounded-2xl bg-fill">
          <ShoppingCart className="size-7 text-fg/60" />
        </span>
        <p className="text-sm text-fg/70">
          Importa un piano per generare la lista della spesa ottimizzata.
        </p>
      </GlassCard>
    </div>
  );
}
