import { LogOut, Minus, Plus, UserPlus, Users } from 'lucide-react';
import { useState } from 'react';
import { useApp } from '../state/AppContext';
import { useAuth } from '../state/AuthProvider';
import { GlassCard } from '../components/GlassCard';
import { eur } from '../lib/format';

const AVATAR_COLORS = [
  'linear-gradient(135deg,#6ea8ff,#b388ff)',
  'linear-gradient(135deg,#ff8fb1,#ffcb6b)',
  'linear-gradient(135deg,#5ce1b9,#6ea8ff)',
  'linear-gradient(135deg,#b388ff,#ff8fb1)',
];

export function FamilyScreen() {
  const { family, shopping, setDoseFactor, addMember, busy } = useApp();
  const { user, logout } = useAuth();
  const [newName, setNewName] = useState('');

  const submitMember = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    await addMember(name, 1);
    setNewName('');
  };

  return (
    <div className="flex flex-col gap-5">
      <header className="flex items-start justify-between px-1">
        <div>
          <p className="text-sm font-medium text-fg/60">Il nucleo</p>
          <h1 className="text-3xl font-bold tracking-tight text-fg">
            {family?.name ?? 'Famiglia'}
          </h1>
        </div>
        <button
          onClick={logout}
          className="grid size-10 place-items-center rounded-full bg-fill text-fg/70 transition-colors hover:text-fg"
          aria-label="Esci"
          title="Esci"
        >
          <LogOut className="size-4" />
        </button>
      </header>

      <GlassCard className="flex items-start gap-3 p-4">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-fill">
          <Users className="size-5 text-accent" />
        </span>
        <p className="text-sm leading-relaxed text-fg/75">
          La spesa è <strong className="text-fg">condivisa</strong>: il consumo settimanale è la
          somma delle dosi di ogni membro. Cambia una dose e lista e prezzi si ricalcolano.
        </p>
      </GlassCard>

      <div className="flex flex-col gap-3">
        {(family?.members ?? []).map((m, i) => (
          <GlassCard key={m.id} className="p-5">
            <div className="flex items-center gap-3">
              <span
                className="grid size-12 place-items-center rounded-2xl text-lg font-bold text-[#0b1020]"
                style={{ background: AVATAR_COLORS[i % AVATAR_COLORS.length] }}
              >
                {m.name.charAt(0).toUpperCase()}
              </span>
              <div className="flex-1">
                <p className="text-base font-semibold text-fg">{m.name}</p>
                <p className="text-xs text-fg/55">Dose × {m.doseFactor.toFixed(1)}</p>
              </div>
              <div className="glass flex items-center gap-1 rounded-full p-1">
                <button
                  onClick={() => void setDoseFactor(m.id, Math.max(0.5, m.doseFactor - 0.1))}
                  className="grid size-9 place-items-center rounded-full text-fg transition-colors hover:bg-fill active:scale-95"
                  aria-label={`Riduci dose di ${m.name}`}
                >
                  <Minus className="size-4" />
                </button>
                <span className="w-9 text-center text-sm font-bold text-fg">
                  {m.doseFactor.toFixed(1)}
                </span>
                <button
                  onClick={() => void setDoseFactor(m.id, Math.min(3, m.doseFactor + 0.1))}
                  className="grid size-9 place-items-center rounded-full text-fg transition-colors hover:bg-fill active:scale-95"
                  aria-label={`Aumenta dose di ${m.name}`}
                >
                  <Plus className="size-4" />
                </button>
              </div>
            </div>
          </GlassCard>
        ))}
      </div>

      <form onSubmit={submitMember} className="flex items-center gap-2">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Nome nuovo membro"
          aria-label="Nome nuovo membro"
          className="glass flex-1 rounded-2xl px-4 py-3 text-sm text-fg placeholder:text-fg/40 focus:outline-none focus:ring-2 focus:ring-accent/50"
        />
        <button
          type="submit"
          disabled={busy || !newName.trim()}
          className="flex items-center gap-2 rounded-2xl bg-accent px-4 py-3 text-sm font-semibold text-[#0b1020] transition-opacity hover:opacity-90 active:scale-95 disabled:opacity-40"
        >
          <UserPlus className="size-4" />
          Aggiungi
        </button>
      </form>

      <GlassCard strong className="flex items-center justify-between p-5">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-fg/55">Effetto sulla spesa</p>
          <p className="text-sm text-fg/75">
            {shopping?.list.length ?? 0} prodotti · {user?.email}
          </p>
        </div>
        <p className="text-2xl font-bold text-fg">{eur(shopping?.result?.total ?? 0)}</p>
      </GlassCard>
    </div>
  );
}
