import { describe, it, expect, beforeEach, vi } from 'vitest';
import { apiFetch, setAuthToken, setUnauthorizedHandler } from './client';

function mockFetch(status: number, body: unknown) {
  return vi.fn(
    async () =>
      new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
      }),
  );
}

describe('apiFetch — gestione 401 (sessione scaduta)', () => {
  beforeEach(() => {
    setAuthToken(null);
    setUnauthorizedHandler(null);
  });

  it('invoca l’handler di logout su 401 quando un token era presente', async () => {
    setAuthToken('expired-token');
    const onUnauth = vi.fn();
    setUnauthorizedHandler(onUnauth);
    vi.stubGlobal('fetch', mockFetch(401, { message: 'Token non valido' }));

    await expect(apiFetch('/family')).rejects.toThrow('Token non valido');
    expect(onUnauth).toHaveBeenCalledTimes(1);
  });

  it('NON invoca l’handler su 401 senza token (es. login con credenziali errate)', async () => {
    const onUnauth = vi.fn();
    setUnauthorizedHandler(onUnauth);
    vi.stubGlobal('fetch', mockFetch(401, { message: 'Credenziali non valide' }));

    await expect(
      apiFetch('/auth/login', { method: 'POST', body: { email: 'x', password: 'y' } }),
    ).rejects.toThrow('Credenziali non valide');
    expect(onUnauth).not.toHaveBeenCalled();
  });

  it('NON invoca l’handler su errori diversi dal 401 con token presente', async () => {
    setAuthToken('valid-token');
    const onUnauth = vi.fn();
    setUnauthorizedHandler(onUnauth);
    vi.stubGlobal('fetch', mockFetch(400, { message: 'Richiesta non valida' }));

    await expect(apiFetch('/plan/active')).rejects.toThrow('Richiesta non valida');
    expect(onUnauth).not.toHaveBeenCalled();
  });
});
