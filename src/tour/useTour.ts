import { useCallback, useEffect, useState } from 'react';
import type { AppView } from '../types';
import { find } from './dom';
import { pendingTours, tourSteps, tourStore, type TourId, type TourStep } from './tours';

/** Espera a que la pantalla monte: que aparezca el primer elemento obligatorio (hasta `ms`). */
function whenReady(steps: TourStep[], ms = 2500): Promise<void> {
  const required = steps.find((s) => s.target && !s.optional);
  return new Promise((resolve) => {
    const started = Date.now();
    const tick = () => {
      if (!required || Date.now() - started > ms) resolve();
      else if (find(required)) window.setTimeout(resolve, 200);
      else window.setTimeout(tick, 150);
    };
    window.setTimeout(tick, 250);
  });
}

interface Active { ids: TourId[]; steps: TourStep[] }

/** Recorrido de la pantalla actual: se abre solo la primera vez y `replay` lo repite. */
export function useTour(view: AppView, enabled: boolean) {
  const [active, setActive] = useState<(Active & { view: AppView }) | null>(null);

  const open = useCallback(async (forView: AppView, ids: TourId[], cancelled: () => boolean = () => false) => {
    const all = ids.flatMap(tourSteps);
    await whenReady(all);
    const steps = all.filter((s) => !s.optional || find(s));
    if (!cancelled() && steps.length) setActive({ ids, steps, view: forView });
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const ids = pendingTours(view, tourStore.seen);
    if (!ids.length) return;
    let cancelled = false;
    // fuera del efecto: el recorrido se abre cuando la pantalla ya montó
    const timer = window.setTimeout(() => open(view, ids, () => cancelled), 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [view, enabled, open]);

  const close = useCallback(() => {
    setActive((a) => {
      if (a) tourStore.markSeen(a.ids);
      return null;
    });
  }, []);

  // al cambiar de pantalla, el recorrido de la anterior deja de mostrarse
  return { active: active?.view === view ? active : null, replay: () => open(view, [view]), close };
}
