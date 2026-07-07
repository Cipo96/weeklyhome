import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { DayOfWeek, MealType } from '@weeklyhome/domain';
import { familyApi, planApi, priceApi, shoppingApi } from '../api/endpoints';
import type {
  ApiFamily,
  ApiMealOverride,
  ApiPlan,
  ApiShopping,
  OptimizeMode,
  OverrideItemInput,
} from '../api/types';
import { FOODS, type FoodMeta } from '../data/seed';

interface AppState {
  loading: boolean;
  busy: boolean;
  error: string | null;
  family: ApiFamily | null;
  plan: ApiPlan | null;
  draft: ApiPlan | null;
  shopping: ApiShopping | null;
  mode: OptimizeMode;
  radiusKm: number;
  setMode: (m: OptimizeMode) => void;
  setRadius: (km: number) => void;
  userPos: { lat: number; lon: number } | null;
  locating: boolean;
  requestLocation: () => Promise<void>;
  setDoseFactor: (memberId: string, factor: number) => Promise<void>;
  addMember: (name: string, doseFactor?: number) => Promise<void>;
  createFamily: (name: string) => Promise<void>;
  importPlan: (file?: File) => Promise<void>;
  confirmDraft: (validFrom?: string) => Promise<void>;
  discardDraft: () => void;
  updateDraftItem: (itemId: string, patch: { name?: string; value?: number; unit?: string }) => Promise<void>;
  deleteDraftItem: (itemId: string) => Promise<void>;
  addDraftItem: (mealId: string, body: { name: string; value: number; unit: string; optionIndex?: number }) => Promise<void>;
  selectDraftOption: (mealId: string, selectedOption: number) => Promise<void>;
  setMealOverride: (day: DayOfWeek, type: MealType, items: OverrideItemInput[]) => Promise<void>;
  clearMealOverride: (day: DayOfWeek, type: MealType) => Promise<void>;
  overrideFor: (day: DayOfWeek, type: MealType) => ApiMealOverride | undefined;
  refreshingPrices: boolean;
  refreshPrices: () => Promise<void>;
  refreshingVolantini: boolean;
  volantiniStarted: boolean;
  refreshVolantini: () => Promise<void>;
  reload: () => Promise<void>;
  foodMeta: (foodId: string, name?: string | null) => FoodMeta;
}

const Ctx = createContext<AppState | null>(null);

const round1 = (n: number) => Math.round(n * 10) / 10;

export function AppProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [family, setFamily] = useState<ApiFamily | null>(null);
  const [plan, setPlan] = useState<ApiPlan | null>(null);
  const [draft, setDraft] = useState<ApiPlan | null>(null);
  const [shopping, setShopping] = useState<ApiShopping | null>(null);
  const [mode, setModeState] = useState<OptimizeMode>('cheapest');
  const [radiusKm, setRadiusState] = useState<number>(5);
  const [refreshingPrices, setRefreshingPrices] = useState(false);
  const [refreshingVolantini, setRefreshingVolantini] = useState(false);
  const [volantiniStarted, setVolantiniStarted] = useState(false);
  const [userPos, setUserPos] = useState<{ lat: number; lon: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const posRef = useRef<{ lat: number; lon: number } | null>(null);
  posRef.current = userPos;

  const loadShopping = useCallback(
    async (m: OptimizeMode, r: number, hasPlan: boolean) => {
      if (!hasPlan) {
        setShopping(null);
        return;
      }
      setShopping(await shoppingApi.get(m, r, posRef.current ?? undefined));
    },
    [],
  );

  /** Chiede la posizione del dispositivo e ricarica la spesa con le distanze reali. */
  const requestLocation = useCallback(async () => {
    if (!('geolocation' in navigator)) {
      setError('Geolocalizzazione non disponibile sul dispositivo.');
      return;
    }
    setLocating(true);
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 10000,
        }),
      );
      const p = { lat: pos.coords.latitude, lon: pos.coords.longitude };
      posRef.current = p;
      setUserPos(p);
      await loadShopping(mode, radiusKm, Boolean(plan));
    } catch {
      setError('Impossibile ottenere la posizione (permesso negato?).');
    } finally {
      setLocating(false);
    }
  }, [loadShopping, mode, radiusKm, plan]);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const fam = await familyApi.get();
      setFamily(fam);
      if (fam) {
        const activePlan = await planApi.getActive();
        setPlan(activePlan);
        await loadShopping(mode, radiusKm, Boolean(activePlan));
      } else {
        setPlan(null);
        setShopping(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Errore di caricamento');
    } finally {
      setLoading(false);
    }
  }, [loadShopping, mode, radiusKm]);

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setMode = useCallback(
    (m: OptimizeMode) => {
      setModeState(m);
      void loadShopping(m, radiusKm, Boolean(plan));
    },
    [loadShopping, radiusKm, plan],
  );

  const setRadius = useCallback(
    (km: number) => {
      const r = Math.max(0.5, round1(km));
      setRadiusState(r);
      void loadShopping(mode, r, Boolean(plan));
    },
    [loadShopping, mode, plan],
  );

  const setDoseFactor = useCallback(
    async (memberId: string, factor: number) => {
      const value = round1(factor);
      // aggiornamento ottimistico
      setFamily((prev) =>
        prev
          ? {
              ...prev,
              members: prev.members.map((m) =>
                m.id === memberId ? { ...m, doseFactor: value } : m,
              ),
            }
          : prev,
      );
      await familyApi.updateMember(memberId, value);
      await loadShopping(mode, radiusKm, Boolean(plan));
    },
    [loadShopping, mode, radiusKm, plan],
  );

  const addMember = useCallback(
    async (name: string, doseFactor = 1) => {
      const member = await familyApi.addMember(name.trim(), round1(doseFactor));
      // Un nuovo membro aumenta il consumo del nucleo → ricarica famiglia e spesa.
      setFamily((prev) =>
        prev ? { ...prev, members: [...prev.members, member] } : prev,
      );
      await loadShopping(mode, radiusKm, Boolean(plan));
    },
    [loadShopping, mode, radiusKm, plan],
  );

  const createFamily = useCallback(async (name: string) => {
    setBusy(true);
    setError(null);
    try {
      const fam = await familyApi.create(name);
      setFamily(fam);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Errore creazione nucleo');
    } finally {
      setBusy(false);
    }
  }, []);

  // Import: NON conferma subito — apre la bozza in revisione (US-005).
  const importPlan = useCallback(async (file?: File) => {
    setBusy(true);
    setError(null);
    try {
      const imported = await planApi.import(file);
      setDraft(imported);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore durante l'import");
      throw e;
    } finally {
      setBusy(false);
    }
  }, []);

  const confirmDraft = useCallback(async (validFrom?: string) => {
    if (!draft) return;
    setBusy(true);
    try {
      await planApi.confirm(draft.id, validFrom);
      const activePlan = await planApi.getActive();
      setPlan(activePlan);
      setDraft(null);
      await loadShopping(mode, radiusKm, Boolean(activePlan));
    } finally {
      setBusy(false);
    }
  }, [draft, loadShopping, mode, radiusKm]);

  const updateDraftItem = useCallback(
    async (itemId: string, patch: { name?: string; value?: number; unit?: string }) => {
      setDraft(await planApi.updateItem(itemId, patch));
    },
    [],
  );
  const deleteDraftItem = useCallback(async (itemId: string) => {
    setDraft(await planApi.deleteItem(itemId));
  }, []);
  const addDraftItem = useCallback(
    async (mealId: string, body: { name: string; value: number; unit: string; optionIndex?: number }) => {
      setDraft(await planApi.addItem(mealId, body));
    },
    [],
  );
  const selectDraftOption = useCallback(async (mealId: string, selectedOption: number) => {
    setDraft(await planApi.selectOption(mealId, selectedOption));
  }, []);
  const discardDraft = useCallback(() => setDraft(null), []);

  const setMealOverride = useCallback(
    async (day: DayOfWeek, type: MealType, items: OverrideItemInput[]) => {
      const updated = await planApi.setOverride(day, type, items);
      setPlan(updated);
      await loadShopping(mode, radiusKm, true);
    },
    [loadShopping, mode, radiusKm],
  );

  const clearMealOverride = useCallback(
    async (day: DayOfWeek, type: MealType) => {
      const updated = await planApi.clearOverride(day, type);
      setPlan(updated);
      await loadShopping(mode, radiusKm, true);
    },
    [loadShopping, mode, radiusKm],
  );

  const overrideFor = useCallback(
    (day: DayOfWeek, type: MealType): ApiMealOverride | undefined =>
      plan?.overrides?.find((o) => o.day === day && o.type === type && o.memberId == null),
    [plan],
  );

  const refreshPrices = useCallback(async () => {
    setRefreshingPrices(true);
    try {
      await priceApi.refresh();
      await loadShopping(mode, radiusKm, Boolean(plan));
    } finally {
      setRefreshingPrices(false);
    }
  }, [loadShopping, mode, radiusKm, plan]);

  // Fire-and-forget: la vision dura minuti, quindi l'API avvia il lavoro e torna
  // subito. Mostriamo un avviso; i prezzi vanno ricaricati manualmente dopo qualche minuto.
  const refreshVolantini = useCallback(async () => {
    setRefreshingVolantini(true);
    try {
      await priceApi.refreshVolantini();
      setVolantiniStarted(true);
    } finally {
      setRefreshingVolantini(false);
    }
  }, []);

  const foodMeta = useCallback((foodId: string, name?: string | null): FoodMeta => {
    const known = FOODS[foodId];
    if (known) return known;
    // Alimento fuori catalogo: usa il nome del piano; in mancanza, abbellisci lo
    // slug dell'id (es. "x-fagioli-ceci" → "Fagioli ceci").
    const pretty =
      name?.trim() ||
      foodId.replace(/^x-/, '').replace(/-/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
    return { id: foodId, name: pretty, unit: 'g', emoji: '🛒' };
  }, []);

  const value: AppState = {
    loading,
    busy,
    error,
    family,
    plan,
    draft,
    shopping,
    mode,
    radiusKm,
    setMode,
    setRadius,
    userPos,
    locating,
    requestLocation,
    setDoseFactor,
    addMember,
    createFamily,
    importPlan,
    confirmDraft,
    discardDraft,
    updateDraftItem,
    deleteDraftItem,
    addDraftItem,
    selectDraftOption,
    setMealOverride,
    clearMealOverride,
    overrideFor,
    refreshingPrices,
    refreshPrices,
    refreshingVolantini,
    volantiniStarted,
    refreshVolantini,
    reload,
    foodMeta,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useApp(): AppState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useApp deve essere usato dentro <AppProvider>');
  return ctx;
}
