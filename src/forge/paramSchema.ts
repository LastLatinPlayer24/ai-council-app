// ═══════════════════════════════════════════════════════════════════
// AGENT FORGE — Parameter Schema (single source of truth)
// Every control in the Forge renders from this schema.
// Adding a parameter here = it appears in the UI automatically.
// Ranges are hard limits: the UI cannot produce values outside them.
// ═══════════════════════════════════════════════════════════════════
import type { AgentProvider } from '../types';

export type ControlKind = 'dial' | 'slider' | 'bipolar' | 'logslider' | 'ring' | 'toggle';

export interface ApiParamDef {
  key: string;               // key sent to backend
  label: string;
  desc: string;
  kind: ControlKind;
  min: number;
  max: number;
  step: number;
  default: number;
  providers: AgentProvider[]; // only shown for these
  unit?: string;
}

// ─── CAPA API: parámetros reales del LLM ────────────────────────────
export const API_PARAMS: ApiParamDef[] = [
  {
    key: 'temperature',
    label: 'TEMPERATURE',
    desc: 'Aleatoriedad de la salida. Bajo = determinista, alto = creativo.',
    kind: 'dial',
    min: 0, max: 1.5, step: 0.05, default: 0.7,
    providers: ['openai', 'anthropic', 'gemini', 'ollama', 'ollama_cloud', 'lmstudio', 'groq'],
  },
  {
    key: 'top_p',
    label: 'TOP-P',
    desc: 'Nucleus sampling. Restringe el vocabulario a la masa de probabilidad P.',
    kind: 'slider',
    min: 0.1, max: 1.0, step: 0.05, default: 1.0,
    providers: ['openai', 'anthropic', 'gemini', 'ollama', 'ollama_cloud', 'lmstudio', 'groq'],
  },
  {
    key: 'top_k',
    label: 'TOP-K',
    desc: 'Limita la elección a los K tokens más probables.',
    kind: 'slider',
    min: 1, max: 100, step: 1, default: 40,
    providers: ['gemini', 'ollama', 'ollama_cloud', 'lmstudio'],
  },
  {
    key: 'max_tokens',
    label: 'MAX TOKENS',
    desc: 'Longitud máxima de cada respuesta.',
    kind: 'logslider',
    min: 64, max: 8192, step: 64, default: 1024,
    providers: ['openai', 'anthropic', 'gemini', 'ollama', 'ollama_cloud', 'lmstudio', 'groq'],
    unit: 'tok',
  },
  {
    key: 'frequency_penalty',
    label: 'FREQ PENALTY',
    desc: 'Penaliza repetir tokens ya usados. Negativo = permite repetición.',
    kind: 'bipolar',
    min: -1.0, max: 1.0, step: 0.1, default: 0,
    providers: ['openai', 'lmstudio', 'groq'],
  },
  {
    key: 'presence_penalty',
    label: 'PRES PENALTY',
    desc: 'Penaliza tokens ya presentes. Empuja hacia temas nuevos.',
    kind: 'bipolar',
    min: -1.0, max: 1.0, step: 0.1, default: 0,
    providers: ['openai', 'lmstudio', 'groq'],
  },
  {
    key: 'repeat_penalty',
    label: 'REPEAT PENALTY',
    desc: 'Multiplicador anti-repetición (Ollama). 1.0 = sin efecto.',
    kind: 'slider',
    min: 0.8, max: 1.5, step: 0.05, default: 1.1,
    providers: ['ollama', 'ollama_cloud'],
  },
];

// ─── CAPA PROMPT: diales sintéticos → bloques de system prompt ─────
export interface SyntheticDialDef {
  key: string;
  label: string;
  icon: string;
  levels: { name: string; prompt: string }[]; // index = level
  default: number; // default level index
}

export const SYNTHETIC_DIALS: SyntheticDialDef[] = [
  {
    key: 'obedience',
    label: 'OBEDIENCIA',
    icon: '⛓',
    default: 2,
    levels: [
      { name: 'REBELDE',    prompt: 'Question every instruction and premise you receive. Propose alternative framings before answering. Never accept the stated problem as the real problem.' },
      { name: 'CRÍTICO',    prompt: 'Follow instructions but flag concerns, risks, or better alternatives whenever you see them.' },
      { name: 'EQUILIBRADO', prompt: 'Follow instructions faithfully. Raise objections only when something is clearly problematic.' },
      { name: 'DISCIPLINADO', prompt: 'Follow instructions precisely as given. Minimize deviation and editorializing.' },
      { name: 'LITERAL',    prompt: 'Execute instructions with absolute literalness. Do not reinterpret, expand, or add anything not explicitly requested.' },
    ],
  },
  {
    key: 'reasoning',
    label: 'RAZONAMIENTO',
    icon: '🧠',
    default: 1,
    levels: [
      { name: 'DIRECTO',   prompt: 'Answer directly and concisely. No visible reasoning process.' },
      { name: 'RESUMIDO',  prompt: 'Briefly state your key reasoning before your conclusion.' },
      { name: 'PASO A PASO', prompt: 'Reason step by step. Show your chain of thought explicitly before concluding.' },
      { name: 'EXHAUSTIVO', prompt: 'Reason exhaustively: enumerate assumptions, consider counterarguments, evaluate at least two alternatives, then conclude with confidence level.' },
    ],
  },
  {
    key: 'verbosity',
    label: 'VERBOSIDAD',
    icon: '📏',
    default: 2,
    levels: [
      { name: 'TELEGRÁFICO', prompt: 'Maximum brevity. Fragments acceptable. Never exceed 2 sentences.' },
      { name: 'CONCISO',    prompt: 'Be concise. One short paragraph maximum.' },
      { name: 'NORMAL',     prompt: 'Use natural length appropriate to the question.' },
      { name: 'DETALLADO',  prompt: 'Be thorough. Include context, nuance and examples.' },
      { name: 'EXHAUSTIVO', prompt: 'Be exhaustive. Cover edge cases, caveats, and implications in depth.' },
    ],
  },
  {
    key: 'skepticism',
    label: 'ESCEPTICISMO',
    icon: '🔍',
    default: 2,
    levels: [
      { name: 'CONFIADO',  prompt: 'Accept the premises given by other participants at face value.' },
      { name: 'ABIERTO',   prompt: 'Generally accept premises but note when evidence seems thin.' },
      { name: 'NEUTRO',    prompt: 'Evaluate claims on their merits. Neither credulous nor combative.' },
      { name: 'ESCÉPTICO', prompt: 'Demand evidence for claims. Challenge weak arguments directly.' },
      { name: 'ADVERSARIO', prompt: 'Act as permanent devil\'s advocate. Attack every position, including popular consensus, to stress-test it.' },
    ],
  },
  {
    key: 'formality',
    label: 'FORMALIDAD',
    icon: '🎩',
    default: 1,
    levels: [
      { name: 'COLOQUIAL', prompt: 'Speak casually and conversationally, like a colleague at lunch.' },
      { name: 'PROFESIONAL', prompt: 'Maintain a professional but approachable register.' },
      { name: 'TÉCNICO',   prompt: 'Use precise technical/academic language. Cite frameworks and terminology.' },
    ],
  },
];

// ─── CAPA CAPACIDADES ───────────────────────────────────────────────
export interface CapabilityDef {
  key: string;
  label: string;
  desc: string;
  icon: string;
  default: boolean;
}

export const CAPABILITIES: CapabilityDef[] = [
  { key: 'memoryPrivate', label: 'MEMORIA PRIVADA', desc: 'Recuerda sus propias respuestas aunque salgan de la ventana', icon: '🔒', default: true },
  { key: 'memoryShared',  label: 'MEMORIA COMPARTIDA', desc: 'Recibe las decisiones votadas por el consejo', icon: '⬡', default: true },
  { key: 'canVote',       label: 'DERECHO A VOTO', desc: 'Participa en las votaciones de decisiones', icon: '🗳', default: true },
  { key: 'canPropose',    label: 'PUEDE PROPONER', desc: 'Puede iniciar propuestas de decisión', icon: '💡', default: true },
];

// ─── ForgeParams: lo que se guarda en cada agente ───────────────────
export interface ForgeParams {
  api: Record<string, number>;        // key → value (solo los modificados)
  synthetic: Record<string, number>;  // key → level index
  capabilities: Record<string, boolean>;
  memoryWindow: number;               // últimos N mensajes visibles
}

export function defaultForgeParams(): ForgeParams {
  return {
    api: {},
    synthetic: Object.fromEntries(SYNTHETIC_DIALS.map(d => [d.key, d.default])),
    capabilities: Object.fromEntries(CAPABILITIES.map(c => [c.key, c.default])),
    memoryWindow: 20,
  };
}

// ─── Clamp de seguridad: imposible salir de rango ───────────────────
export function clampApiParam(key: string, value: number): number {
  const def = API_PARAMS.find(p => p.key === key);
  if (!def) return value;
  const clamped = Math.min(def.max, Math.max(def.min, value));
  // snap to step
  return Math.round(clamped / def.step) * def.step;
}

// ─── Generador del system prompt desde los diales sintéticos ────────
export function buildSyntheticPrompt(synthetic: Record<string, number>): string {
  const blocks: string[] = [];
  for (const dial of SYNTHETIC_DIALS) {
    const level = synthetic[dial.key] ?? dial.default;
    const levelDef = dial.levels[Math.min(level, dial.levels.length - 1)];
    if (levelDef) blocks.push(levelDef.prompt);
  }
  return blocks.join(' ');
}

// ─── Params visibles para un provider dado ──────────────────────────
export function paramsForProvider(provider: AgentProvider): ApiParamDef[] {
  return API_PARAMS.filter(p => p.providers.includes(provider));
}
