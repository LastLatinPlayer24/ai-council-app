import { API_BASE_URL, PROVIDER_MODELS } from './data';
import type { ProviderConfig } from './types';

let msgCounter = 100;

export function generateId(prefix: string) {
  return `${prefix}-${++msgCounter}`;
}

export function getApiKeys(provider: string): string[] {
  try {
    const stored = localStorage.getItem(`council_keys_${provider}`);
    if (stored) return JSON.parse(stored);
  } catch { /* localStorage may be unavailable */ }
  return [];
}

export function getCustomUrl(provider: string): string {
  try {
    const stored = localStorage.getItem(`council_url_${provider}`);
    if (stored) return stored;
  } catch { /* localStorage may be unavailable */ }
  return '';
}

/**
 * Ask the backend for the live model catalog of a provider.
 *
 * The API key MUST travel with the request: `/api/models/ollama_cloud`
 * without a key only returns the small hardcoded fallback list.
 * It goes in the `X-API-Key` header, never in the query string — query
 * strings end up in access logs and proxy history.
 * Returns [] on any failure so callers can keep their current list.
 */
export async function fetchProviderModels(provider: string, apiKey?: string): Promise<string[]> {
  const url = `${API_BASE_URL}/api/models/${encodeURIComponent(provider)}`;
  try {
    const resp = await fetch(url, {
      headers: apiKey ? { 'X-API-Key': apiKey } : undefined,
    });
    if (!resp.ok) return [];
    const data = await resp.json();
    return Array.isArray(data?.models) ? data.models : [];
  } catch {
    return [];
  }
}

/**
 * Live models for a provider, falling back to the compiled-in list.
 * Lives here rather than in a component file so importing it never pulls
 * React in (and so the fast-refresh lint rule stays happy).
 */
export function modelsForProvider(
  provider: string,
  providerConfigs?: Record<string, ProviderConfig>
): string[] {
  const live = providerConfigs?.[provider]?.models;
  if (live && live.length > 0) return live;
  return PROVIDER_MODELS[provider] ?? [];
}

export function resetMsgCounter() {
  msgCounter = 100;
}
