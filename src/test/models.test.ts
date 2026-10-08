import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { fetchProviderModels, modelsForProvider } from '../utils';
import { PROVIDER_MODELS } from '../data';
import type { ProviderConfig } from '../types';

// Regression suite: the Ollama Cloud key was stored in Settings but never
// sent to `/api/models/ollama_cloud`, so the dropdown stayed stuck on the
// 4 fallback models forever.

const FALLBACK = ['gpt-oss:120b', 'gpt-oss:20b', 'qwen3-coder:480b', 'deepseek-v3.1:671b'];

function mockFetch(models: string[], ok = true) {
  const spy = vi.fn().mockResolvedValue({
    ok,
    json: async () => ({ provider: 'ollama_cloud', models }),
  });
  vi.stubGlobal('fetch', spy);
  return spy;
}

describe('fetchProviderModels', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('sends the API key in the X-API-Key header', async () => {
    const spy = mockFetch(['a', 'b']);
    await fetchProviderModels('ollama_cloud', 'sk-secret-123');
    const [url, init] = spy.mock.calls[0];
    expect(String(url)).toContain('/api/models/ollama_cloud');
    expect(init?.headers).toEqual({ 'X-API-Key': 'sk-secret-123' });
  });

  it('never leaks the key into the URL', async () => {
    const spy = mockFetch(['a', 'b']);
    await fetchProviderModels('ollama_cloud', 'sk-secret-123');
    const url = String(spy.mock.calls[0][0]);
    expect(url).not.toContain('sk-secret-123');
    expect(url).not.toContain('api_key');
  });

  it('sends no auth header at all when there is no key', async () => {
    const spy = mockFetch(FALLBACK);
    await fetchProviderModels('ollama_cloud');
    expect(spy.mock.calls[0][1]?.headers).toBeUndefined();
  });

  it('returns the model list from the backend', async () => {
    mockFetch(['kimi-k2:1t', 'glm-4.6', ...FALLBACK]);
    const models = await fetchProviderModels('ollama_cloud', 'sk-test');
    expect(models).toContain('kimi-k2:1t');
    expect(models.length).toBeGreaterThan(FALLBACK.length);
  });

  it('returns [] on a non-ok response instead of throwing', async () => {
    mockFetch([], false);
    await expect(fetchProviderModels('ollama_cloud', 'bad-key')).resolves.toEqual([]);
  });

  it('returns [] when the backend is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));
    await expect(fetchProviderModels('ollama_cloud', 'sk-test')).resolves.toEqual([]);
  });
});

describe('modelsForProvider', () => {
  beforeEach(() => localStorage.clear());

  it('falls back to the static catalog when no live config exists', () => {
    expect(modelsForProvider('ollama_cloud')).toEqual(FALLBACK);
    expect(modelsForProvider('ollama_cloud')).toEqual(PROVIDER_MODELS.ollama_cloud);
  });

  it('prefers the live catalog fetched with the key', () => {
    const configs: Record<string, ProviderConfig> = {
      ollama_cloud: {
        id: 'ollama_cloud',
        name: 'Ollama Cloud',
        baseUrl: 'https://ollama.com/v1',
        apiKeys: ['sk-test'],
        available: true,
        models: ['kimi-k2:1t', 'glm-4.6'],
      } as ProviderConfig,
    };
    expect(modelsForProvider('ollama_cloud', configs)).toEqual(['kimi-k2:1t', 'glm-4.6']);
  });

  it('falls back when the live catalog came back empty', () => {
    const configs = { ollama_cloud: { models: [] } as unknown as ProviderConfig };
    expect(modelsForProvider('ollama_cloud', configs)).toEqual(FALLBACK);
  });

  it('returns [] for an unknown provider instead of crashing', () => {
    expect(modelsForProvider('does-not-exist')).toEqual([]);
  });
});
