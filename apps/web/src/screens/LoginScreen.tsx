import { useState, type FormEvent } from 'react';
import { motion } from 'framer-motion';
import { Loader2, ShoppingBag } from 'lucide-react';
import { useAuth } from '../state/AuthProvider';
import { GlassCard } from '../components/GlassCard';
import { cn } from '../lib/cn';

type Mode = 'login' | 'register';

export function LoginScreen() {
  const { login, register, sessionExpired } = useAuth();
  const [mode, setMode] = useState<Mode>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === 'login') await login(email, password);
      else await register(email, password, name);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Errore');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-5 py-10">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8 text-center"
      >
        <div className="mx-auto mb-4 grid size-16 place-items-center rounded-3xl bg-gradient-to-br from-accent to-accent-2 text-on-contrast">
          <ShoppingBag className="size-8 text-white" />
        </div>
        <h1 className="text-3xl font-bold tracking-tight text-fg">WeeklyHome</h1>
        <p className="mt-1 text-sm text-fg/60">La spesa di famiglia, dal piano al carrello.</p>
      </motion.div>

      <GlassCard strong className="p-6">
        {sessionExpired && mode === 'login' && (
          <p className="mb-4 rounded-2xl bg-amber/10 px-4 py-3 text-sm text-amber">
            La sessione è scaduta. Accedi di nuovo per ritrovare il tuo nucleo e il piano.
          </p>
        )}
        <div className="mb-5 flex rounded-2xl bg-fill p-1">
          {(['login', 'register'] as Mode[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => {
                setMode(m);
                setError(null);
              }}
              className={cn(
                'relative flex-1 rounded-xl py-2.5 text-sm font-semibold transition-colors',
                mode === m ? 'text-on-contrast' : 'text-fg/70',
              )}
            >
              {mode === m && (
                <motion.span
                  layoutId="auth-pill"
                  className="absolute inset-0 rounded-xl bg-contrast"
                  transition={{ type: 'spring', stiffness: 460, damping: 36 }}
                />
              )}
              <span className="relative z-10">{m === 'login' ? 'Accedi' : 'Registrati'}</span>
            </button>
          ))}
        </div>

        <form onSubmit={submit} className="flex flex-col gap-3">
          {mode === 'register' && (
            <Field
              label="Nome"
              value={name}
              onChange={setName}
              placeholder="Andrea"
              autoComplete="name"
            />
          )}
          <Field
            label="Email"
            type="email"
            value={email}
            onChange={setEmail}
            placeholder="tu@esempio.it"
            autoComplete="email"
          />
          <Field
            label="Password"
            type="password"
            value={password}
            onChange={setPassword}
            placeholder="••••••••"
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          />

          {error && <p className="text-sm text-rose">{error}</p>}

          <button
            type="submit"
            disabled={busy}
            className="mt-2 flex items-center justify-center gap-2 rounded-full bg-contrast py-3 text-sm font-semibold text-on-contrast transition-transform active:scale-95 disabled:opacity-60"
          >
            {busy && <Loader2 className="size-4 animate-spin" />}
            {mode === 'login' ? 'Accedi' : 'Crea account'}
          </button>
        </form>
      </GlassCard>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
  autoComplete,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  autoComplete?: string;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-fg/60">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        required
        className="rounded-2xl bg-fill px-4 py-3 text-sm text-fg outline-none placeholder:text-fg/35 focus:ring-2 focus:ring-accent/50"
      />
    </label>
  );
}
