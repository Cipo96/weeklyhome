import { motion } from 'framer-motion';
import { cn } from '../lib/cn';

export interface Segment<T extends string> {
  id: T;
  label: string;
  hint?: string;
}

export function SegmentedToggle<T extends string>({
  segments,
  value,
  onChange,
  layoutId = 'segmented',
}: {
  segments: Segment<T>[];
  value: T;
  onChange: (id: T) => void;
  layoutId?: string;
}) {
  return (
    <div className="glass flex rounded-2xl p-1">
      {segments.map((seg) => {
        const isActive = seg.id === value;
        return (
          <button
            key={seg.id}
            onClick={() => onChange(seg.id)}
            className={cn(
              'relative flex-1 rounded-xl px-3 py-2.5 text-center transition-colors',
              isActive ? 'text-on-contrast' : 'text-fg/75 hover:text-fg',
            )}
          >
            {isActive && (
              <motion.span
                layoutId={layoutId}
                className="absolute inset-0 rounded-xl bg-contrast"
                transition={{ type: 'spring', stiffness: 460, damping: 36 }}
              />
            )}
            <span className="relative z-10 block text-sm font-semibold">{seg.label}</span>
            {seg.hint && (
              <span className="relative z-10 block text-[11px] opacity-70">{seg.hint}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
