import { describe, it, expect, beforeEach } from 'vitest';
import {
  clampApiParam, buildSyntheticPrompt, paramsForProvider,
  defaultForgeParams, API_PARAMS, SYNTHETIC_DIALS,
} from '../forge/paramSchema';

describe('clampApiParam — seguridad de rangos', () => {
  it('nunca deja pasar un valor por encima del máximo', () => {
    expect(clampApiParam('temperature', 99)).toBeLessThanOrEqual(1.5);
  });

  it('nunca deja pasar un valor por debajo del mínimo', () => {
    expect(clampApiParam('temperature', -5)).toBeGreaterThanOrEqual(0);
  });

  it('ajusta al step más cercano', () => {
    expect(clampApiParam('temperature', 0.723)).toBeCloseTo(0.7, 5);
  });

  it('deja pasar sin cambios un parámetro desconocido', () => {
    expect(clampApiParam('parametro_inventado', 42)).toBe(42);
  });

  it('respeta el rango de max_tokens', () => {
    expect(clampApiParam('max_tokens', 999999)).toBeLessThanOrEqual(8192);
    expect(clampApiParam('max_tokens', 1)).toBeGreaterThanOrEqual(64);
  });
});

describe('paramsForProvider — filtrado por proveedor', () => {
  it('Anthropic no expone top_k', () => {
    const keys = paramsForProvider('anthropic').map(p => p.key);
    expect(keys).not.toContain('top_k');
  });

  it('Ollama sí expone top_k y repeat_penalty', () => {
    const keys = paramsForProvider('ollama').map(p => p.key);
    expect(keys).toContain('top_k');
    expect(keys).toContain('repeat_penalty');
  });

  it('todos los proveedores tienen temperature', () => {
    const providers = ['openai', 'anthropic', 'gemini', 'ollama', 'lmstudio', 'groq'] as const;
    for (const p of providers) {
      expect(paramsForProvider(p).map(x => x.key)).toContain('temperature');
    }
  });
});

describe('buildSyntheticPrompt — generación de prompt', () => {
  it('produce texto no vacío con los defaults', () => {
    const prompt = buildSyntheticPrompt(defaultForgeParams().synthetic);
    expect(prompt.length).toBeGreaterThan(0);
  });

  it('cambia cuando cambia un dial', () => {
    const base = buildSyntheticPrompt({ obedience: 0 });
    const other = buildSyntheticPrompt({ obedience: 4 });
    expect(base).not.toBe(other);
  });

  it('no revienta con un nivel fuera de rango', () => {
    expect(() => buildSyntheticPrompt({ obedience: 999 })).not.toThrow();
  });

  it('no revienta con un objeto vacío', () => {
    expect(() => buildSyntheticPrompt({})).not.toThrow();
  });
});

describe('integridad del schema', () => {
  it('todos los params API tienen default dentro de su rango', () => {
    for (const p of API_PARAMS) {
      expect(p.default).toBeGreaterThanOrEqual(p.min);
      expect(p.default).toBeLessThanOrEqual(p.max);
    }
  });

  it('todos los diales sintéticos tienen default válido', () => {
    for (const d of SYNTHETIC_DIALS) {
      expect(d.default).toBeGreaterThanOrEqual(0);
      expect(d.default).toBeLessThan(d.levels.length);
    }
  });

  it('no hay keys duplicadas', () => {
    const keys = API_PARAMS.map(p => p.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

// ═══ F5 — Presets, export e import ═══
import {
  FACTORY_PRESETS, getAllPresets, saveUserPreset,
  deleteUserPreset, getUserPresets,
  exportForgeProfile, importForgeProfile,
  getForgeForAgent, saveForge,
} from '../forge/forgeStorage';

describe('presets de fábrica', () => {
  it('existen los 5 presets predefinidos', () => {
    expect(FACTORY_PRESETS).toHaveLength(5);
  });

  it('todos están marcados como builtin', () => {
    for (const p of FACTORY_PRESETS) expect(p.builtin).toBe(true);
  });

  it('cada preset tiene params completos y válidos', () => {
    for (const p of FACTORY_PRESETS) {
      expect(p.params.api).toBeDefined();
      expect(p.params.synthetic).toBeDefined();
      expect(p.params.capabilities).toBeDefined();
      expect(p.params.memoryWindow).toBeGreaterThan(0);
    }
  });

  it('las temperaturas de fábrica están dentro del rango seguro', () => {
    for (const p of FACTORY_PRESETS) {
      const t = p.params.api.temperature;
      if (t !== undefined) {
        expect(t).toBeGreaterThanOrEqual(0);
        expect(t).toBeLessThanOrEqual(1.5);
      }
    }
  });

  it('no hay ids duplicados', () => {
    const ids = FACTORY_PRESETS.map(p => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('presets de usuario', () => {
  beforeEach(() => localStorage.clear());

  it('guarda y recupera un preset propio', () => {
    saveUserPreset('MI PRESET', 'una prueba', '🎯', defaultForgeParams());
    const saved = getUserPresets();
    expect(saved).toHaveLength(1);
    expect(saved[0].name).toBe('MI PRESET');
  });

  it('pasa el nombre a mayúsculas', () => {
    saveUserPreset('minusculas', '', '⚙', defaultForgeParams());
    expect(getUserPresets()[0].name).toBe('MINUSCULAS');
  });

  it('combina los de fábrica con los del usuario', () => {
    saveUserPreset('PROPIO', '', '⚙', defaultForgeParams());
    expect(getAllPresets()).toHaveLength(FACTORY_PRESETS.length + 1);
  });

  it('elimina un preset del usuario', () => {
    const p = saveUserPreset('BORRABLE', '', '⚙', defaultForgeParams());
    deleteUserPreset(p.id);
    expect(getUserPresets()).toHaveLength(0);
  });

  it('no rompe si no hay nada guardado', () => {
    expect(getUserPresets()).toEqual([]);
  });
});

describe('export e import de perfiles', () => {
  beforeEach(() => localStorage.clear());

  it('exporta un JSON con la estructura esperada', () => {
    const json = exportForgeProfile('agent-1', 'APEX');
    const parsed = JSON.parse(json);
    expect(parsed.version).toBe(1);
    expect(parsed.agentName).toBe('APEX');
    expect(parsed.params).toBeDefined();
  });

  it('el ciclo export → import conserva los valores', () => {
    const params = defaultForgeParams();
    params.api.temperature = 0.42;
    params.memoryWindow = 33;
    saveForge('agent-a', params);

    const json = exportForgeProfile('agent-a', 'A');
    importForgeProfile('agent-b', json);

    const restored = getForgeForAgent('agent-b');
    expect(restored.api.temperature).toBe(0.42);
    expect(restored.memoryWindow).toBe(33);
  });

  it('rechaza un JSON inválido sin lanzar excepción', () => {
    expect(importForgeProfile('agent-x', 'no soy json')).toBe(false);
  });

  it('rechaza un JSON sin campo params', () => {
    expect(importForgeProfile('agent-x', '{"algo":1}')).toBe(false);
  });
});

// ═══ Ollama Cloud ═══
import { PROVIDER_INFO } from '../types';

describe('proveedor Ollama Cloud', () => {
  it('está registrado en PROVIDER_INFO', () => {
    expect(PROVIDER_INFO.ollama_cloud).toBeDefined();
    expect(PROVIDER_INFO.ollama_cloud.name).toBe('Ollama Cloud');
  });

  it('apunta al endpoint remoto, no a localhost', () => {
    expect(PROVIDER_INFO.ollama_cloud.baseUrl).toContain('ollama.com');
    expect(PROVIDER_INFO.ollama_cloud.baseUrl).not.toContain('localhost');
  });

  it('trae modelos por defecto para arrancar sin key', () => {
    expect(PROVIDER_INFO.ollama_cloud.defaultModels.length).toBeGreaterThan(0);
  });

  it('expone los mismos diales que Ollama local', () => {
    const local = paramsForProvider('ollama').map(p => p.key).sort();
    const cloud = paramsForProvider('ollama_cloud').map(p => p.key).sort();
    expect(cloud).toEqual(local);
  });

  it('incluye top_k y repeat_penalty', () => {
    const keys = paramsForProvider('ollama_cloud').map(p => p.key);
    expect(keys).toContain('top_k');
    expect(keys).toContain('repeat_penalty');
  });
});

// ═══ Regresión: Settings debe listar TODOS los proveedores ═══
// Bug real: ollama_cloud aparecía en el desplegable de agentes pero no
// en Ajustes, porque store.ts tenía una segunda lista hardcodeada.
describe('paridad de proveedores entre PROVIDER_INFO y Ajustes', () => {
  it('cada proveedor de PROVIDER_INFO tiene nombre y baseUrl', () => {
    for (const [id, info] of Object.entries(PROVIDER_INFO)) {
      expect(info.name, `${id} sin nombre`).toBeTruthy();
      expect(info.baseUrl, `${id} sin baseUrl`).toBeTruthy();
    }
  });

  it('PROVIDER_INFO cubre los 7 proveedores esperados', () => {
    const ids = Object.keys(PROVIDER_INFO).sort();
    expect(ids).toEqual([
      'anthropic', 'gemini', 'groq', 'lmstudio',
      'ollama', 'ollama_cloud', 'openai',
    ]);
  });

  it('cada proveedor de PROVIDER_INFO tiene diales en el Forge', () => {
    for (const id of Object.keys(PROVIDER_INFO)) {
      const params = paramsForProvider(id as keyof typeof PROVIDER_INFO);
      expect(params.length, `${id} sin parámetros`).toBeGreaterThan(0);
    }
  });
});
