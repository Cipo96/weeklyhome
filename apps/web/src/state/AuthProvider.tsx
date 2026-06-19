import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { setAuthToken, setUnauthorizedHandler } from '../api/client';
import { authApi } from '../api/endpoints';
import type { ApiUser } from '../api/types';

const TOKEN_KEY = 'wh-token';
const USER_KEY = 'wh-user';

interface AuthState {
  token: string | null;
  user: ApiUser | null;
  /** True se l'ultima sessione è stata chiusa da un 401 (token scaduto), non da
   *  un logout manuale: la schermata di accesso lo segnala all'utente. */
  sessionExpired: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string) => Promise<void>;
  logout: () => void;
}

const Ctx = createContext<AuthState | null>(null);

function readUser(): ApiUser | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as ApiUser) : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  // Inizializza il token nel client PRIMA che i figli effettuino fetch.
  const [token, setToken] = useState<string | null>(() => {
    const stored = localStorage.getItem(TOKEN_KEY);
    setAuthToken(stored);
    return stored;
  });
  const [user, setUser] = useState<ApiUser | null>(() => readUser());
  const [sessionExpired, setSessionExpired] = useState(false);

  const clearSession = useCallback(() => {
    setAuthToken(null);
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    setToken(null);
    setUser(null);
  }, []);

  // Un 401 su richiesta autenticata (token scaduto) chiude la sessione e
  // riporta al login segnalando la scadenza — invece di mostrare "crea nucleo".
  useEffect(() => {
    setUnauthorizedHandler(() => {
      clearSession();
      setSessionExpired(true);
    });
    return () => setUnauthorizedHandler(null);
  }, [clearSession]);

  const persist = useCallback(
    (t: string, u: ApiUser) => {
      setAuthToken(t);
      localStorage.setItem(TOKEN_KEY, t);
      localStorage.setItem(USER_KEY, JSON.stringify(u));
      setToken(t);
      setUser(u);
      setSessionExpired(false);
    },
    [],
  );

  const login = useCallback(
    async (email: string, password: string) => {
      const res = await authApi.login(email, password);
      persist(res.token, res.user);
    },
    [persist],
  );

  const register = useCallback(
    async (email: string, password: string, name: string) => {
      const res = await authApi.register(email, password, name);
      persist(res.token, res.user);
    },
    [persist],
  );

  const logout = useCallback(() => {
    clearSession();
    setSessionExpired(false);
  }, [clearSession]);

  return (
    <Ctx.Provider value={{ token, user, sessionExpired, login, register, logout }}>
      {children}
    </Ctx.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAuth deve essere usato dentro <AuthProvider>');
  return ctx;
}
