import { useRef, useState, type ChangeEvent } from 'react';
import { motion } from 'framer-motion';
import { FileUp, Sparkles, Loader2, Info, Trash2, Plus, Check, X } from 'lucide-react';
import { useApp } from '../state/AppContext';
import { GlassCard } from '../components/GlassCard';
import { MEAL_LABELS, MEAL_EMOJI, DAY_LABELS_FULL } from '../lib/format';
import type { ApiMeal, ApiPlan, ApiPlanItem } from '../api/types';
import type { Unit } from '@weeklyhome/domain';

const UNITS: Unit[] = ['g', 'kg', 'ml', 'l', 'pz'];
const TYPE_ORDER = ['BREAKFAST', 'MORNING_SNACK', 'SNACK', 'LUNCH', 'AFTERNOON_SNACK', 'DINNER'];

export function ImportScreen() {
  const { draft } = useApp();
  return draft ? <DraftReview draft={draft} /> : <Uploader />;
}

function Uploader() {
  const { importPlan, busy, error } = useApp();
  const [fileName, setFileName] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const onFile = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setFileName(file.name);
      void importPlan(file).catch(() => {});
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <header className="px-1">
        <p className="text-sm font-medium text-fg/60">Piano nutrizionale</p>
        <h1 className="text-3xl font-bold tracking-tight text-fg">Importa</h1>
      </header>

      <GlassCard strong className="flex flex-col items-center gap-5 p-8 text-center">
        <motion.div
          className="grid size-20 place-items-center rounded-3xl bg-gradient-to-br from-accent/30 to-accent-2/30"
          animate={busy ? { scale: [1, 1.06, 1] } : { scale: 1 }}
          transition={{ repeat: busy ? Infinity : 0, duration: 1.2 }}
        >
          {busy ? (
            <Loader2 className="size-9 animate-spin text-fg" />
          ) : (
            <FileUp className="size-9 text-fg" />
          )}
        </motion.div>

        <div>
          <h2 className="text-lg font-semibold text-fg">
            {busy ? 'Estrazione in corso…' : 'Carica il tuo piano'}
          </h2>
          <p className="mt-1 text-sm text-fg/65">
            {busy
              ? fileName
                ? `Leggo ${fileName}…`
                : 'Creazione del piano…'
              : 'Carica un PDF (lo leggo e te lo faccio rivedere) oppure prova un piano di esempio.'}
          </p>
        </div>

        {error && <p className="text-sm text-rose">{error}</p>}

        <div className="flex flex-col gap-2.5">
          <button
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            className="flex items-center gap-2 rounded-full bg-contrast px-6 py-3 text-sm font-semibold text-on-contrast transition-transform active:scale-95 disabled:opacity-60"
          >
            <FileUp className="size-4" />
            Carica PDF
          </button>
          <button
            onClick={() => void importPlan().catch(() => {})}
            disabled={busy}
            className="flex items-center gap-2 rounded-full bg-fill px-6 py-3 text-sm font-semibold text-fg transition-transform active:scale-95 disabled:opacity-60"
          >
            <Sparkles className="size-4" />
            Usa piano di esempio
          </button>
          <input ref={fileRef} type="file" accept="application/pdf" className="hidden" onChange={onFile} />
        </div>
      </GlassCard>

      <GlassCard className="flex items-start gap-3 p-4">
        <Info className="mt-0.5 size-5 shrink-0 text-accent" />
        <p className="text-sm leading-relaxed text-fg/70">
          Dopo il caricamento potrai <strong className="text-fg">rivedere e correggere</strong> ciò che
          ho estratto (alimenti e grammi) prima di confermare il piano.
        </p>
      </GlassCard>
    </div>
  );
}

function DraftReview({ draft }: { draft: ApiPlan }) {
  const { confirmDraft, discardDraft, busy } = useApp();
  const days = [...new Set(draft.meals.map((m) => m.day))].sort((a, b) => a - b);
  const single = days.length === 1;
  const itemCount = draft.meals.reduce((n, m) => n + m.items.length, 0);
  const today = new Date().toISOString().slice(0, 10);
  const [validFrom, setValidFrom] = useState(today);

  return (
    <div className="flex flex-col gap-5">
      <header className="flex items-start justify-between gap-3 px-1">
        <div>
          <p className="text-sm font-medium text-fg/60">Revisione import</p>
          <h1 className="text-3xl font-bold tracking-tight text-fg">Rivedi il piano</h1>
          <p className="mt-1 text-xs text-fg/45">
            {itemCount} alimenti estratti · correggi quello che serve, poi conferma
            {single && ' · si applica a tutta la settimana'}
          </p>
        </div>
        <button
          onClick={discardDraft}
          className="grid size-9 shrink-0 place-items-center rounded-full bg-fill text-fg/70 active:scale-95"
          aria-label="Annulla"
        >
          <X className="size-4" />
        </button>
      </header>

      {days.map((day) => (
        <section key={day} className="flex flex-col gap-2.5">
          <h2 className="px-1 text-sm font-semibold text-fg/70">
            {single ? 'Giornata tipo' : DAY_LABELS_FULL[day]}
          </h2>
          {draft.meals
            .filter((m) => m.day === day)
            .sort((a, b) => TYPE_ORDER.indexOf(a.type) - TYPE_ORDER.indexOf(b.type))
            .map((meal) => (
              <MealCard key={meal.id} meal={meal} />
            ))}
        </section>
      ))}

      <GlassCard className="flex items-center justify-between gap-3 p-4">
        <label htmlFor="validFrom" className="text-sm font-medium text-fg/80">
          In vigore dal
        </label>
        <input
          id="validFrom"
          type="date"
          value={validFrom}
          onChange={(e) => setValidFrom(e.target.value)}
          className="rounded-lg bg-fill px-3 py-2 text-sm text-fg outline-none"
        />
      </GlassCard>

      <button
        onClick={() => void confirmDraft(validFrom)}
        disabled={busy || itemCount === 0}
        className="sticky bottom-24 flex items-center justify-center gap-2 rounded-full bg-contrast px-6 py-3.5 text-sm font-semibold text-on-contrast shadow-lg transition active:scale-95 disabled:opacity-60"
      >
        {busy ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
        Conferma piano
      </button>
    </div>
  );
}

/** Indici delle opzioni (alternative) presenti in un pasto, ordinati. */
function optionIndexes(meal: ApiMeal): number[] {
  return [...new Set(meal.items.map((it) => it.optionIndex))].sort((a, b) => a - b);
}

function MealCard({ meal }: { meal: ApiMeal }) {
  const options = optionIndexes(meal);
  const multi = options.length > 1;

  return (
    <GlassCard className="overflow-hidden">
      <div className="flex items-center gap-2 px-4 pt-3.5 pb-1.5">
        <span className="text-base">{MEAL_EMOJI[meal.type]}</span>
        <span className="text-sm font-semibold text-fg">{MEAL_LABELS[meal.type] ?? meal.type}</span>
        {multi && (
          <span className="ml-auto rounded-full bg-accent/15 px-2 py-0.5 text-[11px] font-medium text-accent">
            {options.length} alternative
          </span>
        )}
      </div>

      {multi ? (
        <div className="flex flex-col gap-2 px-3 pb-3 pt-1">
          {options.map((idx) => (
            <OptionBlock key={idx} meal={meal} optionIndex={idx} />
          ))}
        </div>
      ) : (
        <FlatItems meal={meal} optionIndex={options[0] ?? 0} />
      )}
    </GlassCard>
  );
}

/** Pasto senza alternative: lista item editabile + aggiunta. */
function FlatItems({ meal, optionIndex }: { meal: ApiMeal; optionIndex: number }) {
  const { addDraftItem } = useApp();
  const [adding, setAdding] = useState(false);
  const items = meal.items.filter((it) => it.optionIndex === optionIndex);

  return (
    <>
      <div className="flex flex-col">
        {items.map((item) => (
          <ItemRow key={item.id} item={item} />
        ))}
        {items.length === 0 && <p className="px-4 py-2 text-xs text-fg/40">Nessun alimento.</p>}
      </div>
      <div className="px-3 pb-3 pt-1">
        {adding ? (
          <AddItemRow
            onAdd={async (b) => {
              await addDraftItem(meal.id, { ...b, optionIndex });
              setAdding(false);
            }}
            onCancel={() => setAdding(false)}
          />
        ) : (
          <button
            onClick={() => setAdding(true)}
            className="flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs font-medium text-accent active:scale-95"
          >
            <Plus className="size-3.5" /> Aggiungi alimento
          </button>
        )}
      </div>
    </>
  );
}

/**
 * Una singola alternativa di pasto. Quella selezionata è evidenziata e
 * modificabile (è ciò che finisce nella spesa); le altre mostrano un'anteprima
 * e si possono scegliere con un tap.
 */
function OptionBlock({ meal, optionIndex }: { meal: ApiMeal; optionIndex: number }) {
  const { addDraftItem, selectDraftOption } = useApp();
  const [adding, setAdding] = useState(false);
  const selected = meal.selectedOption === optionIndex;
  const items = meal.items.filter((it) => it.optionIndex === optionIndex);
  const label = items.find((it) => it.optionLabel)?.optionLabel ?? `Opzione ${optionIndex + 1}`;

  return (
    <div
      className={
        'rounded-2xl border transition ' +
        (selected ? 'border-accent/60 bg-accent/[0.06]' : 'border-line bg-fill/40')
      }
    >
      <button
        onClick={() => !selected && void selectDraftOption(meal.id, optionIndex)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left"
      >
        <span
          className={
            'grid size-5 shrink-0 place-items-center rounded-full border ' +
            (selected ? 'border-accent bg-accent text-on-contrast' : 'border-fg/30 text-transparent')
          }
        >
          {selected && <Check className="size-3.5" />}
        </span>
        <span className={'text-sm font-medium ' + (selected ? 'text-fg' : 'text-fg/70')}>{label}</span>
        {selected && (
          <span className="ml-auto text-[11px] font-medium text-accent">Pianificata</span>
        )}
      </button>

      {selected ? (
        <>
          <div className="flex flex-col">
            {items.map((item) => (
              <ItemRow key={item.id} item={item} />
            ))}
            {items.length === 0 && (
              <p className="px-4 py-2 text-xs text-fg/40">Nessun alimento.</p>
            )}
          </div>
          <div className="px-3 pb-2.5 pt-1">
            {adding ? (
              <AddItemRow
                onAdd={async (b) => {
                  await addDraftItem(meal.id, { ...b, optionIndex });
                  setAdding(false);
                }}
                onCancel={() => setAdding(false)}
              />
            ) : (
              <button
                onClick={() => setAdding(true)}
                className="flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs font-medium text-accent active:scale-95"
              >
                <Plus className="size-3.5" /> Aggiungi alimento
              </button>
            )}
          </div>
        </>
      ) : (
        <p className="px-3 pb-2.5 text-xs text-fg/50">
          {items.map((it) => it.name ?? it.foodId).join(', ') || 'Nessun alimento'}
        </p>
      )}
    </div>
  );
}

function ItemRow({ item }: { item: ApiPlanItem }) {
  const { updateDraftItem, deleteDraftItem } = useApp();
  const [name, setName] = useState(item.name ?? item.foodId);
  const [value, setValue] = useState(String(item.value));
  const [unit, setUnit] = useState<Unit>(item.unit);

  const commitName = () => {
    const v = name.trim();
    if (v && v !== (item.name ?? item.foodId)) void updateDraftItem(item.id, { name: v });
  };
  const commitValue = () => {
    const n = Number(value.replace(',', '.'));
    if (Number.isFinite(n) && n > 0 && n !== item.value) void updateDraftItem(item.id, { value: n });
  };
  const commitUnit = (u: Unit) => {
    setUnit(u);
    if (u !== item.unit) void updateDraftItem(item.id, { unit: u });
  };

  return (
    <div className="flex items-center gap-2 border-t border-line px-4 py-2 first:border-t-0">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={commitName}
        className="min-w-0 flex-1 bg-transparent text-sm text-fg outline-none placeholder:text-fg/30"
        placeholder="Alimento"
      />
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commitValue}
        inputMode="decimal"
        className="w-14 rounded-lg bg-fill px-2 py-1 text-right text-sm text-fg outline-none"
      />
      <select
        value={unit}
        onChange={(e) => commitUnit(e.target.value as Unit)}
        className="rounded-lg bg-fill px-1.5 py-1 text-sm text-fg outline-none"
      >
        {UNITS.map((u) => (
          <option key={u} value={u}>
            {u}
          </option>
        ))}
      </select>
      <button
        onClick={() => void deleteDraftItem(item.id)}
        className="grid size-7 shrink-0 place-items-center rounded-full text-fg/40 hover:text-rose active:scale-95"
        aria-label="Rimuovi"
      >
        <Trash2 className="size-4" />
      </button>
    </div>
  );
}

function AddItemRow({
  onAdd,
  onCancel,
}: {
  onAdd: (b: { name: string; value: number; unit: Unit }) => void | Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState('');
  const [value, setValue] = useState('100');
  const [unit, setUnit] = useState<Unit>('g');

  const submit = () => {
    const n = Number(value.replace(',', '.'));
    if (name.trim() && Number.isFinite(n) && n > 0) void onAdd({ name: name.trim(), value: n, unit });
  };

  return (
    <div className="flex items-center gap-2 rounded-xl bg-fill/60 px-2 py-1.5">
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="min-w-0 flex-1 bg-transparent px-1 text-sm text-fg outline-none placeholder:text-fg/30"
        placeholder="Nuovo alimento"
      />
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        inputMode="decimal"
        className="w-12 rounded-lg bg-bg px-2 py-1 text-right text-sm text-fg outline-none"
      />
      <select
        value={unit}
        onChange={(e) => setUnit(e.target.value as Unit)}
        className="rounded-lg bg-bg px-1 py-1 text-sm text-fg outline-none"
      >
        {UNITS.map((u) => (
          <option key={u} value={u}>
            {u}
          </option>
        ))}
      </select>
      <button onClick={submit} className="grid size-7 place-items-center rounded-full bg-mint/20 text-mint active:scale-95" aria-label="Aggiungi">
        <Check className="size-4" />
      </button>
      <button onClick={onCancel} className="grid size-7 place-items-center rounded-full text-fg/40 active:scale-95" aria-label="Annulla">
        <X className="size-4" />
      </button>
    </div>
  );
}
