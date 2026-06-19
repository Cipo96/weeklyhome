const BASE_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:3000/api';

let authToken: string | null = null;
let onUnauthorized: (() => void) | null = null;

/** Imposta (o azzera) il token usato per le richieste autenticate. */
export function setAuthToken(token: string | null): void {
  authToken = token;
}

/**
 * Registra l'handler invocato quando una richiesta AUTENTICATA riceve 401
 * (token scaduto o non valido). L'app lo usa per forzare il logout e riportare
 * l'utente al login, invece di interpretare il 401 come "nessun nucleo" e
 * spingerlo a ricreare la famiglia.
 */
export function setUnauthorizedHandler(fn: (() => void) | null): void {
  onUnauthorized = fn;
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  form?: FormData;
}

/** Wrapper fetch tipizzato verso l'API, con Bearer token e gestione errori. */
export async function apiFetch<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (authToken) headers.Authorization = `Bearer ${authToken}`;

  let body: BodyInit | undefined;
  if (opts.form) {
    body = opts.form;
  } else if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(opts.body);
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    method: opts.method ?? 'GET',
    headers,
    body,
  });

  if (!res.ok) {
    // 401 su una richiesta che PORTAVA un token = sessione scaduta/non valida:
    // notifica l'app perché faccia logout e torni al login. Il guard su
    // `authToken` evita di scattare sui 401 legittimi del login (credenziali
    // errate), dove nessun token viene inviato.
    if (res.status === 401 && authToken) {
      onUnauthorized?.();
    }
    let message = `Errore ${res.status}`;
    try {
      const err = (await res.json()) as { message?: string | string[] };
      if (err.message) message = Array.isArray(err.message) ? err.message.join(', ') : err.message;
    } catch {
      /* corpo non JSON */
    }
    throw new Error(message);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
