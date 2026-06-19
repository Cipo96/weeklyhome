import { useEffect, useState } from 'react';
import { WifiOff } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';

/** Mostra una barra quando il dispositivo è offline: i dati visualizzati sono
 * l'ultima copia in cache, le azioni che richiedono rete sono sospese. */
export function OfflineBanner() {
  const [offline, setOffline] = useState(!navigator.onLine);

  useEffect(() => {
    const on = () => setOffline(false);
    const off = () => setOffline(true);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  return (
    <AnimatePresence>
      {offline && (
        <motion.div
          initial={{ y: -40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -40, opacity: 0 }}
          className="fixed inset-x-0 top-0 z-[60] flex items-center justify-center gap-2 bg-amber/90 py-1.5 text-center text-xs font-semibold text-black/80 backdrop-blur"
          role="status"
        >
          <WifiOff className="size-3.5" />
          Sei offline — mostro gli ultimi dati salvati
        </motion.div>
      )}
    </AnimatePresence>
  );
}
