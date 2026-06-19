import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { CalendarOff, Pencil } from 'lucide-react';
import type { DayOfWeek } from '@weeklyhome/domain';
import type { ApiMeal } from '../api/types';
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

export function WeekScreen() {
  const { plan, foodMeta, overrideFor } = useApp();
  const week = calendarDays();
  // La selezione è per DATA (timestamp di mezzanotte): in 10 giorni lo stesso
  // giorno-settimana ricorre, quindi non basta il weekday a identificarla.
  const [selectedTime, setSelectedTime] = useState<number>(todayTime);
  const [editing, setEditing] = useState<ApiMeal | null>(null);
  const todayRef = useRef<HTMLButtonElement>(null);

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
      </header>

      <div className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1">
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
