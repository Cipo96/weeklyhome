import { useEffect, useState } from 'react';
import { Search as SearchIcon, Loader2, Tag } from 'lucide-react';
import { priceApi } from '../api/endpoints';
import type { ApiProductSearchResult } from '../api/types';
import { GlassCard } from '../components/GlassCard';
import { eur, unitEur } from '../lib/format';

export function SearchScreen() {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<ApiProductSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  // Ricerca con debounce: aspetta che l'utente smetta di digitare.
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setResults([]);
      setSearched(false);
      setLoading(false);
      return;
    }
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        setResults(await priceApi.search(term));
        setSearched(true);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <div className="flex flex-col gap-5">
      <header className="px-1">
        <p className="text-sm font-medium text-fg/60">Offerte dai volantini</p>
        <h1 className="text-3xl font-bold tracking-tight text-fg">Cerca</h1>
      </header>

      <div className="glass flex items-center gap-2 rounded-2xl px-4 py-3">
        <SearchIcon className="size-5 shrink-0 text-fg/50" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          autoFocus
          placeholder="Cerca un prodotto o una marca…"
          aria-label="Cerca prodotti"
          className="min-w-0 flex-1 bg-transparent text-sm text-fg outline-none placeholder:text-fg/40"
        />
        {loading && <Loader2 className="size-4 shrink-0 animate-spin text-fg/50" />}
      </div>

      {searched && results.length === 0 && !loading && (
        <GlassCard className="p-6 text-center text-sm text-fg/60">
          Nessun prodotto trovato nei volantini per “{q.trim()}”.
        </GlassCard>
      )}

      {!searched && q.trim().length < 2 && (
        <GlassCard className="flex items-start gap-3 p-4">
          <Tag className="mt-0.5 size-5 shrink-0 text-accent" />
          <p className="text-sm leading-relaxed text-fg/70">
            Scrivi almeno 2 lettere per cercare tra i prodotti trovati nei volantini
            (es. <strong className="text-fg">yogurt</strong>, <strong className="text-fg">Fage</strong>).
          </p>
        </GlassCard>
      )}

      <div className="flex flex-col gap-2.5">
        {results.map((p) => (
          <GlassCard key={p.id} className="flex items-center gap-3 p-4">
            <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-fill text-fg/60">
              <Tag className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-fg">
                {p.brand && <span className="text-accent">{p.brand} </span>}
                {p.name}
              </p>
              <p className="mt-0.5 flex items-center gap-1.5 text-xs text-fg/55">
                <span className="size-2 rounded-full" style={{ backgroundColor: p.brandColor }} />
                {p.storeName} · {p.quantityValue} {p.quantityUnit}
              </p>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-sm font-bold text-fg">{eur(p.price)}</p>
              <p className="text-[11px] text-fg/45">{unitEur(p.unitPrice, p.quantityUnit)}</p>
            </div>
          </GlassCard>
        ))}
      </div>
    </div>
  );
}
