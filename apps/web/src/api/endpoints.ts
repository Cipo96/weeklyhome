import { apiFetch } from './client';
import type { DayOfWeek, MealType } from '@weeklyhome/domain';
import type {
  ApiFamily,
  ApiMealVariant,
  ApiMember,
  ApiPlan,
  ApiProductSearchResult,
  ApiShopping,
  ApiStore,
  AuthResponse,
  OptimizeMode,
  OverrideItemInput,
} from './types';

export const authApi = {
  register: (email: string, password: string, name: string) =>
    apiFetch<AuthResponse>('/auth/register', { method: 'POST', body: { email, password, name } }),
  login: (email: string, password: string) =>
    apiFetch<AuthResponse>('/auth/login', { method: 'POST', body: { email, password } }),
};

export const familyApi = {
  get: () => apiFetch<ApiFamily | null>('/family'),
  create: (name: string) => apiFetch<ApiFamily>('/family', { method: 'POST', body: { name } }),
  addMember: (name: string, doseFactor: number) =>
    apiFetch<ApiMember>('/family/members', { method: 'POST', body: { name, doseFactor } }),
  updateMember: (id: string, doseFactor: number) =>
    apiFetch<ApiMember>(`/family/members/${id}`, { method: 'PATCH', body: { doseFactor } }),
};

export const planApi = {
  getActive: () => apiFetch<ApiPlan | null>('/plan/active'),
  import: (file?: File) => {
    if (file) {
      const form = new FormData();
      form.append('file', file);
      return apiFetch<ApiPlan>('/plan/import', { method: 'POST', form });
    }
    return apiFetch<ApiPlan>('/plan/import', { method: 'POST' });
  },
  confirm: (id: string, validFrom?: string) =>
    apiFetch<ApiPlan>(`/plan/${id}/confirm`, {
      method: 'POST',
      body: validFrom ? { validFrom } : {},
    }),
  draft: () => apiFetch<ApiPlan | null>('/plan/draft'),
  updateItem: (itemId: string, body: { name?: string; value?: number; unit?: string }) =>
    apiFetch<ApiPlan>(`/plan/items/${itemId}`, { method: 'PATCH', body }),
  deleteItem: (itemId: string) =>
    apiFetch<ApiPlan>(`/plan/items/${itemId}`, { method: 'DELETE' }),
  addItem: (
    mealId: string,
    body: { name: string; value: number; unit: string; optionIndex?: number },
  ) => apiFetch<ApiPlan>(`/plan/meals/${mealId}/items`, { method: 'POST', body }),
  selectOption: (mealId: string, selectedOption: number) =>
    apiFetch<ApiPlan>(`/plan/meals/${mealId}/option`, {
      method: 'PATCH',
      body: { selectedOption },
    }),
  variants: (items: { name: string; value: number; unit: string }[]) =>
    apiFetch<{ variants: ApiMealVariant[] }>('/plan/variants', { method: 'POST', body: { items } }),
  setOverride: (day: DayOfWeek, type: MealType, items: OverrideItemInput[]) =>
    apiFetch<ApiPlan>('/plan/overrides', { method: 'POST', body: { day, type, items } }),
  clearOverride: (day: DayOfWeek, type: MealType) =>
    apiFetch<ApiPlan>(`/plan/overrides?day=${day}&type=${type}`, { method: 'DELETE' }),
};

export const shoppingApi = {
  get: (mode: OptimizeMode, radiusKm: number, pos?: { lat: number; lon: number }) =>
    apiFetch<ApiShopping>(
      `/shopping?mode=${mode}&radius=${radiusKm}` +
        (pos ? `&lat=${pos.lat}&lon=${pos.lon}` : ''),
    ),
};

export const priceApi = {
  stores: (radiusKm: number) => apiFetch<ApiStore[]>(`/prices/stores?radius=${radiusKm}`),
  refresh: () => apiFetch<{ provider: string; updated: number }>('/prices/refresh', { method: 'POST' }),
  refreshVolantini: () =>
    apiFetch<{ started: boolean }>('/prices/volantino/refresh-all', { method: 'POST' }),
  search: (q: string) =>
    apiFetch<ApiProductSearchResult[]>(`/prices/search?q=${encodeURIComponent(q)}`),
};
