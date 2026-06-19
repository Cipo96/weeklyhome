import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';

export type ThemePref = 'light' | 'dark' | 'auto';
type Resolved = 'light' | 'dark';

const STORAGE_KEY = 'wh-theme';
const THEME_COLOR: Record<Resolved, string> = { dark: '#0b1020', light: '#eaeefb' };

interface ThemeState {
  pref: ThemePref;
  resolved: Resolved;
  setPref: (p: ThemePref) => void;
}

const Ctx = createContext<ThemeState | null>(null);

function systemTheme(): Resolved {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [pref, setPrefState] = useState<ThemePref>(
    () => (localStorage.getItem(STORAGE_KEY) as ThemePref | null) ?? 'auto',
  );
  const [resolved, setResolved] = useState<Resolved>(() =>
    pref === 'auto' ? systemTheme() : pref,
  );

  useEffect(() => {
    const apply = () => {
      const r: Resolved = pref === 'auto' ? systemTheme() : pref;
      setResolved(r);
      document.documentElement.dataset.theme = r;
      document
        .querySelector('meta[name="theme-color"]')
        ?.setAttribute('content', THEME_COLOR[r]);
    };
    apply();

    if (pref === 'auto') {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      mq.addEventListener('change', apply);
      return () => mq.removeEventListener('change', apply);
    }
  }, [pref]);

  const setPref = useCallback((p: ThemePref) => {
    setPrefState(p);
    localStorage.setItem(STORAGE_KEY, p);
  }, []);

  return <Ctx.Provider value={{ pref, resolved, setPref }}>{children}</Ctx.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useTheme(): ThemeState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useTheme deve essere usato dentro <ThemeProvider>');
  return ctx;
}
