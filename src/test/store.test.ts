import { describe, it, expect, beforeEach } from 'vitest';
import { generateId, getApiKeys, getCustomUrl, resetMsgCounter } from '../utils';

describe('generateId', () => {
  beforeEach(() => {
    resetMsgCounter();
  });

  it('generates an id with the given prefix', () => {
    const id = generateId('msg');
    expect(id).toBe('msg-101');
  });

  it('increments the counter on each call', () => {
    const id1 = generateId('msg');
    const id2 = generateId('msg');
    const id3 = generateId('test');
    expect(id1).toBe('msg-101');
    expect(id2).toBe('msg-102');
    expect(id3).toBe('test-103');
  });
});

describe('getApiKeys', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('returns empty array when no keys stored', () => {
    expect(getApiKeys('openai')).toEqual([]);
  });

  it('returns parsed keys from localStorage', () => {
    const keys = ['key1', 'key2'];
    localStorage.setItem('council_keys_openai', JSON.stringify(keys));
    expect(getApiKeys('openai')).toEqual(['key1', 'key2']);
  });

  it('returns empty array for invalid JSON', () => {
    localStorage.setItem('council_keys_openai', 'not-json');
    expect(getApiKeys('openai')).toEqual([]);
  });

  it('uses provider-specific key in localStorage', () => {
    localStorage.setItem('council_keys_anthropic', JSON.stringify(['anthro-key']));
    expect(getApiKeys('anthropic')).toEqual(['anthro-key']);
    expect(getApiKeys('openai')).toEqual([]);
  });
});

describe('getCustomUrl', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('returns empty string when no URL stored', () => {
    expect(getCustomUrl('ollama')).toBe('');
  });

  it('returns stored URL', () => {
    localStorage.setItem('council_url_ollama', 'http://my-server:11434');
    expect(getCustomUrl('ollama')).toBe('http://my-server:11434');
  });

  it('uses provider-specific key in localStorage', () => {
    localStorage.setItem('council_url_lmstudio', 'http://localhost:1234');
    expect(getCustomUrl('lmstudio')).toBe('http://localhost:1234');
    expect(getCustomUrl('ollama')).toBe('');
  });
});
