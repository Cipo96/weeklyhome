import { motion, type HTMLMotionProps } from 'framer-motion';
import { cn } from '../lib/cn';

type GlassCardProps = HTMLMotionProps<'div'> & {
  strong?: boolean;
};

/** Card glassmorphism con riflesso sul bordo superiore. */
export function GlassCard({ strong, className, children, ...rest }: GlassCardProps) {
  return (
    <motion.div
      className={cn(
        'glass glass-sheen rounded-[var(--radius-glass)]',
        strong && 'glass-strong',
        className,
      )}
      {...rest}
    >
      {children}
    </motion.div>
  );
}
