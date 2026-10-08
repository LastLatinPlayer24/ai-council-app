import type { ForgeParams } from './paramSchema';
import { defaultForgeParams } from './paramSchema';

// ═══════════════════════════════════════════════════════════════
// Forge storage — persistencia de calibraciones por agente.
// Módulo separado de los componentes para permitir fast-refresh
// y para que store.ts pueda importarlo sin arrastrar React.
// ═══════════════════════════════════════════════════════════════

const KEY_PREFIX = 'forge_';

export function getForgeForAgent(agentId: string): ForgeParams {
  try {
    const raw = localStorage.getItem(`${KEY_PREFIX}${agentId}`);
    if (raw) return { ...defaultForgeParams(), ...JSON.parse(raw) };
  } catch { /* localStorage no disponible */ }
  return defaultForgeParams();
}

export function saveForge(agentId: string, params: ForgeParams): void {
  try {
    localStorage.setItem(`${KEY_PREFIX}${agentId}`, JSON.stringify(params));
  } catch { /* localStorage no disponible */ }
}

export function clearForge(agentId: string): void {
  try {
    localStorage.removeItem(`${KEY_PREFIX}${agentId}`);
  } catch { /* localStorage no disponible */ }
}

// Export/import de perfiles completos
export function exportForgeProfile(agentId: string, agentName: string): string {
  return JSON.stringify({
    version: 1,
    agentName,
    exportedAt: new Date().toISOString(),
    params: getForgeForAgent(agentId),
  }, null, 2);
}

export function importForgeProfile(agentId: string, json: string): boolean {
  try {
    const parsed = JSON.parse(json);
    if (parsed?.params) {
      saveForge(agentId, { ...defaultForgeParams(), ...parsed.params });
      return true;
    }
  } catch { /* JSON inválido */ }
  return false;
}

// ═══════════════════════════════════════════════════════════════
// PRESETS — calibraciones con nombre, aplicables a cualquier agente
// ═══════════════════════════════════════════════════════════════

export interface Preset {
  id: string;
  name: string;
  desc: string;
  icon: string;
  params: ForgeParams;
  builtin?: boolean;
}

const PRESETS_KEY = 'forge_presets';

// ─── Presets de fábrica ────────────────────────────────────────
export const FACTORY_PRESETS: Preset[] = [
  {
    id: 'preset-precise',
    name: 'ANALISTA FRÍO',
    desc: 'Determinista, literal, sin adornos. Para datos y hechos.',
    icon: '🔬',
    builtin: true,
    params: {
      api: { temperature: 0.15, top_p: 0.8, max_tokens: 1024 },
      synthetic: { obedience: 3, reasoning: 2, verbosity: 1, skepticism: 2, formality: 2 },
      capabilities: { memoryPrivate: true, memoryShared: true, canVote: true, canPropose: true },
      memoryWindow: 24,
    },
  },
  {
    id: 'preset-devil',
    name: 'ADVERSARIO',
    desc: 'Ataca toda premisa. Estresa el consenso hasta romperlo.',
    icon: '😈',
    builtin: true,
    params: {
      api: { temperature: 0.95, top_p: 1.0, max_tokens: 1024 },
      synthetic: { obedience: 0, reasoning: 3, verbosity: 3, skepticism: 4, formality: 1 },
      capabilities: { memoryPrivate: true, memoryShared: true, canVote: true, canPropose: true },
      memoryWindow: 20,
    },
  },
  {
    id: 'preset-mediator',
    name: 'MEDIADOR',
    desc: 'Busca síntesis y puntos de acuerdo. Cierra debates.',
    icon: '🤝',
    builtin: true,
    params: {
      api: { temperature: 0.5, top_p: 0.95, max_tokens: 1536 },
      synthetic: { obedience: 2, reasoning: 2, verbosity: 3, skepticism: 1, formality: 1 },
      capabilities: { memoryPrivate: true, memoryShared: true, canVote: true, canPropose: true },
      memoryWindow: 32,
    },
  },
  {
    id: 'preset-creative',
    name: 'DIVERGENTE',
    desc: 'Alta temperatura, ideas laterales. Para brainstorming.',
    icon: '💡',
    builtin: true,
    params: {
      api: { temperature: 1.2, top_p: 1.0, max_tokens: 1024, frequency_penalty: 0.4 },
      synthetic: { obedience: 1, reasoning: 1, verbosity: 2, skepticism: 1, formality: 0 },
      capabilities: { memoryPrivate: true, memoryShared: true, canVote: true, canPropose: true },
      memoryWindow: 16,
    },
  },
  {
    id: 'preset-executor',
    name: 'EJECUTOR',
    desc: 'Literal y telegráfico. Hace exactamente lo que se le pide.',
    icon: '⚡',
    builtin: true,
    params: {
      api: { temperature: 0.2, top_p: 0.85, max_tokens: 512 },
      synthetic: { obedience: 4, reasoning: 0, verbosity: 0, skepticism: 0, formality: 1 },
      capabilities: { memoryPrivate: false, memoryShared: true, canVote: true, canPropose: false },
      memoryWindow: 10,
    },
  },
];

export function getUserPresets(): Preset[] {
  try {
    const raw = localStorage.getItem(PRESETS_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* localStorage no disponible */ }
  return [];
}

export function getAllPresets(): Preset[] {
  return [...FACTORY_PRESETS, ...getUserPresets()];
}

export function saveUserPreset(name: string, desc: string, icon: string, params: ForgeParams): Preset {
  const preset: Preset = {
    id: `preset-user-${Date.now()}`,
    name: name.toUpperCase().slice(0, 24),
    desc: desc.slice(0, 80),
    icon: icon || '⚙',
    params: JSON.parse(JSON.stringify(params)),
  };
  const existing = getUserPresets();
  try {
    localStorage.setItem(PRESETS_KEY, JSON.stringify([...existing, preset]));
  } catch { /* localStorage no disponible */ }
  return preset;
}

export function deleteUserPreset(id: string): void {
  try {
    const remaining = getUserPresets().filter(p => p.id !== id);
    localStorage.setItem(PRESETS_KEY, JSON.stringify(remaining));
  } catch { /* localStorage no disponible */ }
}

// ─── Descarga de archivo en el navegador ────────────────────────
export function downloadJson(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
