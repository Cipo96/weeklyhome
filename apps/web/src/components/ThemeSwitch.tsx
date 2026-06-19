import { motion } from 'framer-motion';
import { Sun, Moon, SunMoon } from 'lucide-react';
import { useTheme, type ThemePref } from '../state/ThemeProvider';
import { cn } from '../lib/cn';

const OPTIONS: { id: ThemePref; Icon: typeof Sun; label: string }[] = [
  { id: 'light', Icon: Sun, label: 'Tema chiaro' },
  { id: 'auto', Icon: SunMoon, label: 'Tema automatico' },
  { id: 'dark', Icon: Moon, label: 'Tema scuro' },
];

export function ThemeSwitch() {
  const { pref, setPref } = useTheme();
  return (
    <div className="glass fixed right-5 top-[max(16px,env(safe-area-inset-top))] z-30 flex items-center gap-0.5 rounded-full p-1">
      {OPTIONS.map(({ id, Icon, label }) => {
        const active = id === pref;
        return (
          <button
            key={id}
            onClick={() => setPref(id)}
            aria-label={label}
            title={label}
            aria-pressed={active}
            className={cn(
              'relative grid size-9 place-items-center rounded-full transition-colors',
              active ? 'text-on-contrast' : 'text-fg/55 hover:text-fg',
            )}
          >
            {active && (
              <motion.span
                layoutId="theme-pill"
                className="absolute inset-0 rounded-full bg-contrast"
                transition={{ type: 'spring', stiffness: 480, damping: 38 }}
              />
            )}
            <Icon className="relative z-10 size-[18px]" strokeWidth={2.2} />
          </button>
        );
      })}
    </div>
  );
}
