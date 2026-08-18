import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { CalendarOff, Pencil, ChevronLeft, ChevronRight, ChefHat } from 'lucide-react';
import type { DayOfWeek } from '@weeklyhome/domain';
import type { ApiMeal, ApiPlan } from '../api/types';
import { useApp } from '../state/AppContext';
import { GlassCard } from '../components/GlassCard';
import { MealEditSheet } from '../components/MealEditSheet';
import { cn } from '../lib/cn';
import { estimateKcal } from '../lib/kcal';
import {
  DAY_LABELS,
  DAY_LABELS_FULL,
  MEAL_EMOJI,
  MEAL_LABELS,
  qty,
} from '../lib/format';

// Ordine delle occasioni nella giornata. Più pasti dello stesso tipo (es. due
// snack) restano DISTINTI: li mostriamo tutti, non solo il primo.
const MEAL_RANK: Record<string, number> = {
  BREAKFAST: 0,
  MORNING_SNACK: 1,
  SNACK: 1, // legacy
  LUNCH: 2,
  AFTERNOON_SNACK: 3,
  DINNER: 4,
};

/** Indice del giorno nella convenzione del piano: 0=lunedì … 6=domenica. */
const planDayIndex = (d: Date): DayOfWeek => ((d.getDay() + 6) % 7) as DayOfWeek;

/** Giorni da mostrare nella striscia: alcuni passati (per rivedere cosa si è
 *  mangiato) e i prossimi, da OGGI−3 a OGGI+6. Per ciascuno: il giorno-settimana
 *  del piano, la data reale, se è oggi e se è già passato. */
const PAST_DAYS = 3;
const FUTURE_DAYS = 6;
function calendarDays(): { weekday: DayOfWeek; date: Date; isToday: boolean; isPast: boolean }[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Array.from({ length: PAST_DAYS + 1 + FUTURE_DAYS }, (_, i) => {
    const offset = i - PAST_DAYS;
    const date = new Date(today);
    date.setDate(today.getDate() + offset);
    return { weekday: planDayIndex(date), date, isToday: offset === 0, isPast: offset < 0 };
  });
}

/** Mezzanotte di oggi (timestamp), per inizializzare/identificare il giorno selezionato. */
function todayTime(): number {
  const t = new Date();
  t.setHours(0, 0, 0, 0);
  return t.getTime();
}

function getMealPrepAdvices(plan: ApiPlan, foodMeta: any) {
  const prepKeywords = [
    'riso', 'farro', 'orzo', 'quinoa', 'patate', 'ceci', 'fagioli', 'lenticchie', 'pollo', 'tacchino'
  ];
  
  const occurrences = new Map<string, { days: Set<number> }>();
  
  for (const m of plan.meals) {
    const items = m.items.filter(it => it.optionIndex === m.selectedOption);
    for (const it of items) {
      if (prepKeywords.some(k => it.foodId.includes(k))) {
        const entry = occurrences.get(it.foodId) ?? { days: new Set<number>() };
        entry.days.add(m.day);
        occurrences.set(it.foodId, entry);
      }
    }
  }

  const advices: { name: string, days: number[] }[] = [];
  for (const [foodId, entry] of occurrences.entries()) {
    if (entry.days.size >= 2) {
      advices.push({
        name: foodMeta(foodId).name,
        days: Array.from(entry.days).sort((a,b) => a-b)
      });
    }
  }

  return advices;
}

export function WeekScreen({ onNavigate }: { onNavigate?: (tab: 'import' | 'shop' | 'search' | 'family') => void }) {
  const { plan, foodMeta, overrideFor, editActivePlan } = useApp();
  const week = calendarDays();
  // La selezione è per DATA (timestamp di mezzanotte): in 10 giorni lo stesso
  // giorno-settimana ricorre, quindi non basta il weekday a identificarla.
  const [selectedTime, setSelectedTime] = useState<number>(todayTime);
  const [editing, setEditing] = useState<ApiMeal | null>(null);
  const todayRef = useRef<HTMLButtonElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const scrollBy = (amount: number) => {
    if (scrollRef.current) {
      scrollRef.current.scrollBy({ left: amount, behavior: 'smooth' });
    }
  };

  // All'apertura porta "Oggi" in vista (ha alcuni giorni passati alla sua sinistra).
  useEffect(() => {
    todayRef.current?.scrollIntoView({ inline: 'center', block: 'nearest' });
  }, []);

  if (!plan) return <EmptyState />;

  const selectedDate = new Date(selectedTime);
  const day = planDayIndex(selectedDate);

  const meals = plan.meals
    .filter((m) => m.day === day)
    .sort((a, b) => (MEAL_RANK[a.type] ?? 99) - (MEAL_RANK[b.type] ?? 99));

  // Per ogni pasto: item effettivi (override o opzione selezionata) + stima kcal.
  const mealRows = meals.map((meal) => {
    const override = overrideFor(meal.day, meal.type);
    const items =
      override?.items ?? meal.items.filter((it) => it.optionIndex === meal.selectedOption);
    const est = estimateKcal(items, (id) => foodMeta(id));
    return { meal, override, items, est };
  });
  const dayKcal = mealRows.reduce((sum, r) => sum + r.est.kcal, 0);
  const dayPartial = mealRows.some((r) => r.est.partial);
  const mealPrep = getMealPrepAdvices(plan, foodMeta);

  return (
    <div className="flex flex-col gap-5">
      <header className="px-1">
        <p className="text-sm font-medium text-fg/60">Il tuo piano</p>
        <h1 className="text-3xl font-bold tracking-tight text-fg">{DAY_LABELS_FULL[day]}</h1>
        <p className="mt-0.5 text-sm font-medium text-fg/55">
          {selectedDate.toLocaleDateString('it-IT', { day: 'numeric', month: 'long' })}
        </p>
        {plan.validFrom && (
          <p className="mt-1 text-xs text-fg/45">
            In vigore dal{' '}
            {new Date(plan.validFrom).toLocaleDateString('it-IT', {
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            })}
          </p>
        )}
        {dayKcal > 0 && (
          <p className="mt-1 text-sm font-medium text-fg/55">
            ≈ {dayKcal} kcal stimate{dayPartial ? '+' : ''} nel giorno
          </p>
        )}
        <button
          onClick={async () => {
            await editActivePlan();
            onNavigate?.('import');
          }}
          className="mt-3 flex w-fit items-center gap-1.5 rounded-full bg-accent/15 px-3 py-1.5 text-xs font-semibold text-accent transition-colors hover:bg-accent/25 active:scale-95"
        >
          <Pencil className="size-3.5" /> Modifica intero piano
        </button>
      </header>

      <div className="group relative -mx-5">
        <button
          onClick={() => scrollBy(-150)}
          className="absolute left-1 top-1/2 z-20 -translate-y-1/2 grid size-8 place-items-center rounded-full bg-bg/80 text-fg/70 shadow-sm backdrop-blur transition-opacity opacity-0 group-hover:opacity-100 md:opacity-100"
        >
          <ChevronLeft className="size-5" />
        </button>

        <div ref={scrollRef} className="flex gap-2 overflow-x-auto px-5 pb-1 scrollbar-hide">
          {week.map(({ weekday, date, isToday, isPast }) => {
            const isActive = date.getTime() === selectedTime;
            return (
              <button
                key={date.toISOString()}
                ref={isToday ? todayRef : undefined}
                onClick={() => setSelectedTime(date.getTime())}
                className={cn(
                  'relative flex h-16 w-13 shrink-0 flex-col items-center justify-center rounded-2xl px-3 text-sm font-semibold transition-colors',
                  isActive
                    ? 'text-on-contrast'
                    : cn('glass', isPast ? 'text-fg/40' : 'text-fg/80'),
                )}
              >
                {isActive && (
                  <motion.span
                    layoutId="day-pill"
                    className="absolute inset-0 rounded-2xl bg-contrast"
                    transition={{ type: 'spring', stiffness: 480, damping: 38 }}
                  />
                )}
                <span className="relative z-10 text-[11px] opacity-70">
                  {isToday ? 'Oggi' : DAY_LABELS[weekday]}
                </span>
                <span className="relative z-10 text-lg">{date.getDate()}</span>
              </button>
            );
          })}
        </div>

        <button
          onClick={() => scrollBy(150)}
          className="absolute right-1 top-1/2 z-20 -translate-y-1/2 grid size-8 place-items-center rounded-full bg-bg/80 text-fg/70 shadow-sm backdrop-blur transition-opacity opacity-0 group-hover:opacity-100 md:opacity-100"
        >
          <ChevronRight className="size-5" />
        </button>
      </div>

      {mealPrep.length > 0 && (
        <GlassCard strong className="p-5 border-amber/20 bg-amber/5">
          <div className="flex items-center gap-2 mb-3 text-amber-600 dark:text-amber-400">
            <ChefHat className="size-5" />
            <h2 className="font-semibold text-sm">Consigli Meal Prep</h2>
          </div>
          <ul className="text-sm text-fg/80 space-y-2">
            {mealPrep.map((adv, i) => {
              const d1 = DAY_LABELS_FULL[adv.days[0]].toLowerCase();
              const d2 = DAY_LABELS_FULL[adv.days[1]].toLowerCase();
              return (
                <li key={i}>
                  Mangi <strong>{adv.name.toLowerCase()}</strong> il {d1} e il {d2}. 
                  Cuoci le porzioni in anticipo per risparmiare tempo!
                </li>
              );
            })}
          </ul>
        </GlassCard>
      )}

      <div className="flex flex-col gap-4">
        {mealRows.map(({ meal, override, items, est }, idx) => {
          return (
            <GlassCard
              key={meal.id}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.05 }}
              className="p-5"
            >
              <div className="mb-3 flex items-center gap-2">
                <span className="text-xl">{MEAL_EMOJI[meal.type]}</span>
                <h2 className="text-base font-semibold text-fg">{MEAL_LABELS[meal.type]}</h2>
                {override && (
                  <span className="rounded-full bg-accent/20 px-2 py-0.5 text-[10px] font-semibold text-accent">
                    variato
                  </span>
                )}
                {est.kcal > 0 && (
                  <span className="ml-auto shrink-0 text-xs font-medium text-fg/45">
                    ≈ {est.kcal} kcal{est.partial ? '+' : ''}
                  </span>
                )}
                <button
                  onClick={() => setEditing(meal)}
                  aria-label={`Modifica ${MEAL_LABELS[meal.type]}`}
                  className={cn(
                    'grid size-8 shrink-0 place-items-center rounded-full bg-fill text-fg/70 transition-colors hover:text-fg',
                    est.kcal > 0 ? 'ml-2' : 'ml-auto',
                  )}
                >
                  <Pencil className="size-3.5" />
                </button>
              </div>
              <ul className="flex flex-col gap-2.5">
                {items.map((item) => {
                  const food = foodMeta(item.foodId, item.name);
                  return (
                    <li key={item.id} className="flex items-center gap-3">
                      <span className="grid size-9 place-items-center rounded-xl bg-fill text-lg">
                        {food.emoji}
                      </span>
                      <span className="flex-1 text-sm text-fg/90">{food.name}</span>
                      <span className="text-sm font-medium text-fg/60">
                        {qty({ value: item.value, unit: item.unit })}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </GlassCard>
          );
        })}
      </div>

      <MealEditSheet meal={editing} onClose={() => setEditing(null)} />
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col gap-5">
      <header className="px-1">
        <p className="text-sm font-medium text-fg/60">Il tuo piano</p>
        <h1 className="text-3xl font-bold tracking-tight text-fg">Settimana</h1>
      </header>
      <GlassCard strong className="flex flex-col items-center gap-3 p-8 text-center">
        <span className="grid size-14 place-items-center rounded-2xl bg-fill">
          <CalendarOff className="size-7 text-fg/60" />
        </span>
        <p className="text-sm text-fg/70">
          Nessun piano attivo. Vai nella scheda <strong className="text-fg">Import</strong> per
          caricarne uno.
        </p>
      </GlassCard>
    </div>
  );
}
