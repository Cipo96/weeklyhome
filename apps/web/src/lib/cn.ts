import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Combina classi Tailwind in modo sicuro (dedup + merge). */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
