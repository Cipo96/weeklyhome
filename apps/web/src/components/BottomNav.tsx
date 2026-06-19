import { motion } from 'framer-motion';
import { CalendarDays, ShoppingCart, Search, Users, FileUp } from 'lucide-react';
import { cn } from '../lib/cn';

export type TabId = 'week' | 'shop' | 'search' | 'family' | 'import';

const TABS: { id: TabId; label: string; Icon: typeof CalendarDays }[] = [
  { id: 'week', label: 'Settimana', Icon: CalendarDays },
  { id: 'shop', label: 'Spesa', Icon: ShoppingCart },
  { id: 'search', label: 'Cerca', Icon: Search },
  { id: 'family', label: 'Famiglia', Icon: Users },
  { id: 'import', label: 'Import', Icon: FileUp },
];

export function BottomNav({
  active,
  onChange,
}: {
  active: TabId;
  onChange: (id: TabId) => void;
}) {
  return (
    <nav className="pointer-events-none fixed inset-x-0 bottom-0 z-20 flex justify-center pb-[max(16px,env(safe-area-inset-bottom))]">
      <div className="glass-strong pointer-events-auto flex items-center gap-1 rounded-full p-1.5">
        {TABS.map(({ id, label, Icon }) => {
          const isActive = id === active;
          return (
            <button
              key={id}
              onClick={() => onChange(id)}
              className={cn(
                'relative flex h-12 items-center gap-2 rounded-full px-4 text-sm font-medium transition-colors',
                isActive ? 'text-on-contrast' : 'text-fg/70 hover:text-fg',
              )}
              aria-current={isActive ? 'page' : undefined}
            >
              {isActive && (
                <motion.span
                  layoutId="nav-pill"
                  className="absolute inset-0 rounded-full bg-contrast"
                  transition={{ type: 'spring', stiffness: 480, damping: 38 }}
                />
              )}
              <Icon className="relative z-10 size-5" strokeWidth={2.2} />
              <span className={cn('relative z-10', isActive ? 'inline' : 'hidden sm:inline')}>
                {label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
