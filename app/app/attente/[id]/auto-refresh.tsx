'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

/** Relit la page toutes les 2,5 s (la page serveur redirige vers le résultat dès que la tâche est finie). */
export function AutoRefresh({ everyMs = 2500 }: { everyMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => router.refresh(), everyMs);
    return () => clearInterval(id);
  }, [router, everyMs]);
  return null;
}
