import { useEffect, useState } from 'react';
import { API_BASE_URL } from './data';

export type BackendState = 'checking' | 'online' | 'offline';

export interface BackendHealth {
  state: BackendState;
  latencyMs?: number;
  version?: string;
}

/** One real round-trip to `/api/health`. Never throws. */
export async function checkBackend(timeoutMs = 4000): Promise<BackendHealth> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = performance.now();
  try {
    const resp = await fetch(`${API_BASE_URL}/api/health`, { signal: controller.signal, cache: 'no-store' });
    if (!resp.ok) return { state: 'offline' };
    const data = await resp.json().catch(() => ({}));
    return {
      state: data?.status === 'ok' ? 'online' : 'offline',
      latencyMs: Math.round(performance.now() - started),
      version: typeof data?.version === 'string' ? data.version : undefined,
    };
  } catch {
    return { state: 'offline' };
  } finally {
    clearTimeout(timer);
  }
}

/** Backend health, re-checked every `intervalMs` while the tab is visible. */
export function useBackendHealth(intervalMs = 60_000): BackendHealth {
  const [health, setHealth] = useState<BackendHealth>({ state: 'checking' });
  useEffect(() => {
    let alive = true;
    const run = async () => {
      if (document.visibilityState === 'hidden') return;
      const h = await checkBackend();
      if (alive) setHealth(h);
    };
    const first = setTimeout(run, 0);
    const timer = setInterval(run, intervalMs);
    return () => {
      alive = false;
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [intervalMs]);
  return health;
}
