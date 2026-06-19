import { useState, type FormEvent, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Loader2, Home } from 'lucide-react';
import { useAuth } from './state/AuthProvider';
import { AppProvider, useApp } from './state/AppContext';
import { BottomNav, type TabId } from './components/BottomNav';
import { ThemeSwitch } from './components/ThemeSwitch';
import { OfflineBanner } from './components/OfflineBanner';
import { GlassCard } from './components/GlassCard';
import { LoginScreen } from './screens/LoginScreen';
import { WeekScreen } from './screens/WeekScreen';
import { ShopScreen } from './screens/ShopScreen';
import { SearchScreen } from './screens/SearchScreen';
import { FamilyScreen } from './screens/FamilyScreen';
import { ImportScreen } from './screens/ImportScreen';

function renderTab(tab: TabId): ReactNode {
  switch (tab) {
    case 'week':
      return <WeekScreen />;
    case 'shop':
      return <ShopScreen />;
    case 'search':
      return <SearchScreen />;
    case 'family':
      return <FamilyScreen />;
    case 'import':
      return <ImportScreen />;
  }
}

function CreateFamily() {
  const { createFamily, busy, error } = useApp();
  const [name, setName] = useState('');

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (name.trim()) void createFamily(name.trim());
  };

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-5">
      <GlassCard strong className="p-7">
        <div className="mb-5 grid size-14 place-items-center rounded-2xl bg-gradient-to-br from-accent to-accent-2">
          <Home className="size-7 text-white" />
        </div>
        <h1 className="text-2xl font-bold text-fg">Crea il tuo nucleo</h1>
        <p className="mt-1 text-sm text-fg/65">
          Dai un nome alla famiglia: condividerete piano e spesa.
        </p>
        <form onSubmit={submit} className="mt-5 flex flex-col gap-3">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Casa Cipollone"
            className="rounded-2xl bg-fill px-4 py-3 text-sm text-fg outline-none placeholder:text-fg/35 focus:ring-2 focus:ring-accent/50"
          />
          {error && <p className="text-sm text-rose">{error}</p>}
          <button
            type="submit"
            disabled={busy || !name.trim()}
            className="flex items-center justify-center gap-2 rounded-full bg-contrast py-3 text-sm font-semibold text-on-contrast transition-transform active:scale-95 disabled:opacity-60"
          >
            {busy && <Loader2 className="size-4 animate-spin" />}
            Crea nucleo
          </button>
        </form>
      </GlassCard>
    </div>
  );
}

function Centered({ children }: { children: ReactNode }) {
  return <div className="grid min-h-dvh place-items-center">{children}</div>;
}

function Shell() {
  const { loading, family } = useApp();
  const [tab, setTab] = useState<TabId>('week');

  if (loading) {
    return (
      <Centered>
        <Loader2 className="size-8 animate-spin text-fg/60" />
      </Centered>
    );
  }

  if (!family) return <CreateFamily />;

  return (
    <div className="mx-auto min-h-dvh w-full max-w-md px-5 pb-28 pt-[max(20px,env(safe-area-inset-top))]">
      <AnimatePresence mode="wait">
        <motion.main
          key={tab}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -12 }}
          transition={{ duration: 0.22, ease: 'easeOut' }}
        >
          {renderTab(tab)}
        </motion.main>
      </AnimatePresence>
      <BottomNav active={tab} onChange={setTab} />
    </div>
  );
}

export default function App() {
  const { token } = useAuth();
  return (
    <>
      <div className="app-aurora" aria-hidden />
      <OfflineBanner />
      <ThemeSwitch />
      {token ? (
        <AppProvider>
          <Shell />
        </AppProvider>
      ) : (
        <LoginScreen />
      )}
    </>
  );
}
