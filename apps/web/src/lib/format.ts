import type { Quantity } from '@weeklyhome/domain';

/** Formatta un importo in euro (it-IT). */
export const eur = (n: number): string =>
  n.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' });

/** Formatta una quantità con la sua unità. */
export const qty = (q: Quantity): string =>
  q.unit === 'qb' ? 'q.b.' : `${q.value.toLocaleString('it-IT', { maximumFractionDigits: 2 })} ${q.unit}`;

/** Prezzo unitario, es. "1,05 €/kg". */
export const unitEur = (n: number, unit: string): string => {
  const per = unit === 'pz' ? 'pz' : unit === 'ml' || unit === 'l' ? 'l' : 'kg';
  return `${eur(n)}/${per}`;
};

/** Tempo trascorso in forma breve italiana (es. "2 h fa", "ieri"). */
export const timeAgo = (iso: string): string => {
  const diff = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(diff) || diff < 0) return 'ora';
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'adesso';
  if (min < 60) return `${min} min fa`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} h fa`;
  const d = Math.floor(h / 24);
  return d === 1 ? 'ieri' : `${d} giorni fa`;
};

export const MEAL_LABELS: Record<string, string> = {
  BREAKFAST: 'Colazione',
  MORNING_SNACK: 'Spuntino',
  LUNCH: 'Pranzo',
  AFTERNOON_SNACK: 'Merenda',
  DINNER: 'Cena',
  SNACK: 'Merenda', // legacy
};

export const MEAL_EMOJI: Record<string, string> = {
  BREAKFAST: '☀️',
  MORNING_SNACK: '🥪',
  LUNCH: '🍽️',
  AFTERNOON_SNACK: '🍏',
  DINNER: '🌙',
  SNACK: '🍏', // legacy
};

export const DAY_LABELS = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];
export const DAY_LABELS_FULL = [
  'Lunedì',
  'Martedì',
  'Mercoledì',
  'Giovedì',
  'Venerdì',
  'Sabato',
  'Domenica',
];
