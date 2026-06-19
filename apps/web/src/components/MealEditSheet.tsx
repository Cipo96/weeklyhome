import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X, RotateCcw, Check, Sparkles, Loader2, Pencil, Plus, Trash2, Ban } from 'lucide-react';
import type { Unit } from '@weeklyhome/domain';
import type { ApiMeal, ApiMealVariant, OverrideItemInput } from '../api/types';
import { planApi } from '../api/endpoints';
import { useApp } from '../state/AppContext';
import { MEAL_LABELS, qty } from '../lib/format';

const UNITS: Unit[] = ['g', 'kg', 'ml', 'l', 'pz'];

interface EditRow {
  foodId?: string;
  name: string;
  value: string;
  unit: Unit;
}

/** Cache di sessione delle varianti per firma del pasto (risparmia quota AI). */
const variantCache = new Map<string, ApiMealVariant[]>();

export function MealEditSheet({ meal, onClose }: { meal: ApiMeal | null; onClose: () => void }) {
  const { setMealOverride, clearMealOverride, overrideFor, foodMeta } = useApp();
  const [busy, setBusy] = useState(false);
  const [variants, setVariants] = useState<ApiMealVariant[] | null>(null);
  const [loadingV, setLoadingV] = useState(false);
  const [errV, setErrV] = useState<string | null>(null);
  const [manual, setManual] = useState(false);
  const [rows, setRows] = useState<EditRow[]>([]);

  // reset stato quando cambia il pasto selezionato
  useEffect(() => {
    setVariants(null);
    setErrV(null);
    setManual(false);
    setRows([]);
  }, [meal?.day, meal?.type]);

  const override = meal ? overrideFor(meal.day, meal.type) : undefined;
  const currentItems =
    override?.items ??
    meal?.items.filter((it) => it.optionIndex === meal.selectedOption) ??
    [];

  const sig = currentItems
    .map((it) => `${it.foodId}:${it.value}${it.unit}`)
    .sort()
    .join('|');

  const generate = async () => {
    if (variantCache.has(sig)) {
      setVariants(variantCache.get(sig)!);
      return;
    }
    setLoadingV(true);
    setErrV(null);
    try {
      const { variants: vs } = await planApi.variants(
        currentItems.map((it) => ({
          name: foodMeta(it.foodId, it.name).name,
          value: it.value,
          unit: it.unit,
        })),
      );
      variantCache.set(sig, vs);
      setVariants(vs);
    } catch (e) {
      setErrV(e instanceof Error ? e.message : 'Varianti non disponibili');
    } finally {
      setLoadingV(false);
    }
  };

  const apply = async (items: OverrideItemInput[]) => {
    if (!meal) return;
    setBusy(true);
    try {
      await setMealOverride(meal.day, meal.type, items);
      onClose();
    } finally {
      setBusy(false);
    }
  };

  const reset = async () => {
    if (!meal) return;
    setBusy(true);
    try {
      await clearMealOverride(meal.day, meal.type);
      onClose();
    } finally {
      setBusy(false);
    }
  };

  /** Apre l'editor manuale pre-compilato con il pasto attuale. */
  const startManual = () => {
    setRows(
      currentItems.map((it) => ({
        foodId: it.foodId,
        name: foodMeta(it.foodId, it.name).name,
        value: String(it.value),
        unit: it.unit,
      })),
    );
    setManual(true);
  };

  const setRow = (i: number, patch: Partial<EditRow>) =>
    setRows((rs) =>
      rs.map((r, idx) =>
        idx === i
          ? // se cambia il nome, azzera il foodId: lo ri-deriva il server
            { ...r, ...patch, ...(patch.name !== undefined ? { foodId: undefined } : {}) }
          : r,
      ),
    );
  const addRow = () => setRows((rs) => [...rs, { name: '', value: '100', unit: 'g' }]);
  const removeRow = (i: number) => setRows((rs) => rs.filter((_, idx) => idx !== i));

  /** Salva la sostituzione manuale come override del pasto. */
  const saveManual = () => {
    const items: OverrideItemInput[] = rows
      .map((r) => ({
        foodId: r.foodId,
        name: r.name.trim(),
        value: Number(r.value.replace(',', '.')),
        unit: r.unit,
      }))
      .filter((r) => r.name.length > 0 && Number.isFinite(r.value) && r.value > 0);
    void apply(items);
  };

  /** "Non l'ho mangiato": override vuoto → il pasto non entra in spesa/consumo. */
  const skip = () => void apply([]);

  return (
    <AnimatePresence>
      {meal && (
        <>
          <motion.div
            className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={busy ? undefined : onClose}
          />
          <motion.div
            className="glass-strong fixed inset-x-0 bottom-0 z-50 rounded-t-[28px] p-5 pb-[max(22px,env(safe-area-inset-bottom))]"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 380, damping: 38 }}
          >
            <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-fill" />

            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-fg/55">Modifica pasto</p>
                <h2 className="text-lg font-semibold text-fg">{MEAL_LABELS[meal.type]}</h2>
              </div>
              <button
                onClick={onClose}
                aria-label="Chiudi"
                className="grid size-9 place-items-center rounded-full bg-fill text-fg/70 transition-colors hover:text-fg"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="mb-4 rounded-2xl bg-fill p-3">
              <p className="mb-1 text-xs font-medium text-fg/55">In programma</p>
              <p className="text-sm text-fg/90">
                {currentItems
                  .map((it) => `${foodMeta(it.foodId, it.name).name} ${qty({ value: it.value, unit: it.unit })}`)
                  .join(' · ')}
              </p>
            </div>

            {/* Sostituzione manuale del pasto (senza AI) */}
            {!manual ? (
              <div className="mb-4 grid grid-cols-2 gap-2">
                <button
                  onClick={startManual}
                  disabled={busy}
                  className="flex items-center justify-center gap-1.5 rounded-full bg-fill px-3 py-2.5 text-sm font-semibold text-fg transition-transform active:scale-95 disabled:opacity-60"
                >
                  <Pencil className="size-4" /> Sostituisci a mano
                </button>
                <button
                  onClick={skip}
                  disabled={busy}
                  className="flex items-center justify-center gap-1.5 rounded-full bg-fill px-3 py-2.5 text-sm font-semibold text-fg/80 transition-transform active:scale-95 disabled:opacity-60"
                >
                  <Ban className="size-4" /> Non l'ho mangiato
                </button>
              </div>
            ) : (
              <div className="mb-4 rounded-2xl bg-fill p-2.5">
                <p className="mb-2 px-1 text-xs font-medium text-fg/55">Cosa hai mangiato davvero</p>
                <div className="flex flex-col gap-1.5">
                  {rows.map((r, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <input
                        value={r.name}
                        onChange={(e) => setRow(i, { name: e.target.value })}
                        placeholder="Alimento"
                        className="min-w-0 flex-1 rounded-lg bg-bg px-2 py-1.5 text-sm text-fg outline-none placeholder:text-fg/30"
                      />
                      <input
                        value={r.value}
                        onChange={(e) => setRow(i, { value: e.target.value })}
                        inputMode="decimal"
                        className="w-14 rounded-lg bg-bg px-2 py-1.5 text-right text-sm text-fg outline-none"
                      />
                      <select
                        value={r.unit}
                        onChange={(e) => setRow(i, { unit: e.target.value as Unit })}
                        className="rounded-lg bg-bg px-1.5 py-1.5 text-sm text-fg outline-none"
                      >
                        {UNITS.map((u) => (
                          <option key={u} value={u}>
                            {u}
                          </option>
                        ))}
                      </select>
                      <button
                        onClick={() => removeRow(i)}
                        aria-label="Rimuovi"
                        className="grid size-7 shrink-0 place-items-center rounded-full text-fg/40 transition-colors hover:text-rose active:scale-95"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                  ))}
                  {rows.length === 0 && (
                    <p className="px-1 py-1 text-xs text-fg/40">Aggiungi gli alimenti che hai consumato.</p>
                  )}
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <button
                    onClick={addRow}
                    className="flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs font-medium text-accent active:scale-95"
                  >
                    <Plus className="size-3.5" /> Aggiungi
                  </button>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setManual(false)}
                      disabled={busy}
                      className="rounded-full px-3 py-1.5 text-xs font-medium text-fg/60 active:scale-95 disabled:opacity-60"
                    >
                      Annulla
                    </button>
                    <button
                      onClick={saveManual}
                      disabled={busy}
                      className="flex items-center gap-1.5 rounded-full bg-contrast px-3.5 py-1.5 text-xs font-semibold text-on-contrast active:scale-95 disabled:opacity-60"
                    >
                      {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />} Salva
                    </button>
                  </div>
                </div>
              </div>
            )}

            <div className="mb-2 flex items-center justify-between">
              <p className="flex items-center gap-1.5 text-sm font-semibold text-fg">
                <Sparkles className="size-4 text-accent" />
                Varianti AI
              </p>
              {variants === null && (
                <button
                  onClick={() => void generate()}
                  disabled={loadingV || currentItems.length === 0}
                  className="flex items-center gap-1.5 rounded-full bg-fill px-3 py-1.5 text-xs font-semibold text-accent active:scale-95 disabled:opacity-60"
                >
                  {loadingV ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
                  {loadingV ? 'Genero…' : 'Genera'}
                </button>
              )}
            </div>

            <div className="flex flex-col gap-2.5">
              {errV && <p className="rounded-2xl bg-fill p-3 text-sm text-rose">{errV}</p>}
              {variants === null && !loadingV && !errV && (
                <p className="rounded-2xl bg-fill p-3 text-sm text-fg/55">
                  Tocca "Genera" per ottenere alternative iso-macro create dall'AI.
                </p>
              )}
              {variants !== null && variants.length === 0 && (
                <p className="rounded-2xl bg-fill p-3 text-sm text-fg/60">
                  Nessuna variante trovata per questo pasto.
                </p>
              )}
              {(variants ?? []).map((v, i) => (
                <button
                  key={i}
                  disabled={busy}
                  onClick={() =>
                    void apply(
                      v.items.map((it) => ({
                        foodId: it.foodId,
                        name: it.name,
                        value: it.value,
                        unit: it.unit,
                      })),
                    )
                  }
                  className="glass flex items-center gap-3 rounded-2xl p-3.5 text-left transition-transform active:scale-[0.98] disabled:opacity-60"
                >
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-fill text-lg">
                    {foodMeta(v.items[0]?.foodId ?? '', v.items[0]?.name).emoji}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-fg">{v.label}</p>
                    <p className="text-xs text-fg/55">
                      {v.items
                        .map((it) => `${it.name} ${qty({ value: it.value, unit: it.unit })}`)
                        .join(' · ')}
                    </p>
                    {v.note && <p className="mt-0.5 truncate text-[11px] text-fg/40">{v.note}</p>}
                  </div>
                  <Check className="size-4 shrink-0 text-fg/40" />
                </button>
              ))}
            </div>

            {override && (
              <button
                onClick={() => void reset()}
                disabled={busy}
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-fill py-3 text-sm font-semibold text-fg transition-transform active:scale-95 disabled:opacity-60"
              >
                {busy ? <Loader2 className="size-4 animate-spin" /> : <RotateCcw className="size-4" />}
                Ripristina l'originale
              </button>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
