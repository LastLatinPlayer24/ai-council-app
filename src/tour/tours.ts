import type { AppView } from '../types';

/** Un paso del recorrido: señala `[data-tour=target]` (o va centrado si no hay target). */
export interface TourStep {
  target?: string;
  title: string;
  body: string;
  /** Si el elemento no está en pantalla (p. ej. solo existe en escritorio), el paso se omite. */
  optional?: boolean;
}

export type TourId = 'welcome' | AppView;

const WELCOME: TourStep[] = [
  {
    title: '¡Bienvenido al Consejo!',
    body: 'Aquí varios agentes de IA debaten tu pregunta, cada uno con su rol y su modelo, y votan hasta llegar a un consenso. En un minuto te muestro cómo funciona. Puedes repetir este recorrido con el botón «?».',
  },
  {
    target: 'nav-settings', title: 'Paso 1: tus claves',
    body: 'Antes de nada, pon en Ajustes la clave de al menos un proveedor (OpenAI, Anthropic, Gemini, Groq…). Sin clave, los agentes no pueden responder.',
  },
  {
    target: 'nav-council', title: 'Paso 2: la sala del consejo',
    body: 'Escribe tu pregunta y cada agente responde desde su rol. Pide más rondas para que se rebatan entre ellos, vota decisiones y deja que el presidente escriba la conclusión.',
  },
  {
    target: 'nav-agents', title: 'Agentes',
    body: 'Los miembros del consejo. Crea los tuyos con un nombre, un rol, una personalidad y el modelo de IA que usa cada uno.',
  },
  {
    target: 'nav-forge', title: 'Forja',
    body: 'Ajusta a fondo a cada agente: creatividad, largo de respuesta, tono, qué tan crítico es… y guarda tus combinaciones como presets.',
  },
  {
    target: 'nav-analytics', title: 'Analíticas', optional: true,
    body: 'Cuánto habla cada agente, cuántos tokens se gastan y cómo evoluciona el consenso.',
  },
  { target: 'help', title: '¿Dudas?', body: 'Este botón repite el tutorial de la pantalla en la que estés.' },
];

const TOURS: Record<AppView, TourStep[]> = {
  dashboard: [
    {
      target: 'new-meeting', title: 'Nueva reunión',
      body: 'Escribe la pregunta, elige qué agentes participan y quién preside. El consejo empieza a debatir en cuanto la abres; la sesión anterior se guarda en Memoria.',
    },
    { target: 'enter-council', title: 'Entrar al consejo', body: 'El atajo para volver a la sala y seguir con la sesión actual.' },
    {
      target: 'stats', title: 'El estado de la sesión',
      body: 'Agentes activos, tokens gastados (lo que te cobra el proveedor) y el consenso medio de las votaciones.', optional: true,
    },
    {
      target: 'members', title: 'Miembros del consejo',
      body: 'Cada agente con su rol y cuánto suele estar de acuerdo con el resto. Tócalo para ver su ficha.',
    },
  ],
  council: [
    {
      target: 'council-input', title: 'Habla con el consejo',
      body: 'Escribe tu pregunta, idea o problema. Todos los agentes responden, cada uno desde su rol.',
    },
    {
      target: 'next-round', title: 'Otra ronda',
      body: 'Los agentes leen lo que dijeron los demás y responden de nuevo: se critican, se corrigen y afinan la idea.',
    },
    {
      target: 'vote', title: 'Votar una decisión',
      body: 'Escribe una propuesta concreta y cada agente vota a favor, en contra o se abstiene. Verás el porcentaje de consenso y si se aprueba.',
    },
    {
      target: 'conclude', title: 'Concluir',
      body: 'El presidente lee todo el debate y escribe la resolución: en qué hay consenso, qué sigue en discusión, las decisiones votadas y los próximos pasos.',
    },
    {
      target: 'export', title: 'Exportar', optional: true,
      body: 'Descarga la sesión completa (resolución, votos con sus motivos y transcripción) en un archivo Markdown.',
    },
    {
      target: 'layout', title: 'Chat o grafo',
      body: 'Cambia entre la conversación y el grafo que muestra quién responde a quién.',
    },
  ],
  agents: [
    {
      target: 'new-agent', title: 'Nuevo agente',
      body: 'Dale un nombre, un rol (analista, crítico, abogado del diablo…), una personalidad y elige su proveedor y modelo.',
    },
    { target: 'agent-list', title: 'Tus agentes', body: 'Cada agente tiene su ficha como esta: su modelo, sus especialidades y cómo ha participado.' },
  ],
  forge: [
    { target: 'forge-carousel', title: 'Elige un agente', body: 'Desliza o usa las flechas para escoger a quién ajustar.' },
    {
      target: 'forge-faces', title: 'Tres caras',
      body: 'API: los parámetros del modelo (creatividad, largo…). Mente: su carácter y tono. Capacidades: qué sabe hacer.',
    },
    { target: 'forge-presets', title: 'Presets', body: 'Combinaciones listas para usar, y donde guardas las tuyas.' },
    {
      target: 'forge-commit', title: 'Forjar', body: 'Los cambios no se aplican hasta que tocas «Forge». «Descartar» vuelve a como estaba.',
    },
  ],
  memory: [
    {
      target: 'memory-shared', title: 'Memoria compartida',
      body: 'Las decisiones votadas en esta reunión. Los agentes con memoria compartida las reciben en sus instrucciones.',
    },
    { target: 'memory-status', title: 'Memoria por agente', body: 'Cuántos mensajes ve cada agente y si recuerda sus propias respuestas. Se cambia en la Forja.' },
    { target: 'memory-history', title: 'Sesiones pasadas', body: 'Cada reunión concluida o reemplazada queda aquí, con su resolución y para exportar. Todo vive en este navegador.' },
  ],
  analytics: [
    { target: 'analytics-kpis', title: 'Resumen', body: 'Mensajes, tokens, consenso y decisiones de la sesión de un vistazo.' },
    {
      target: 'analytics-matrix', title: 'Rendimiento por agente',
      body: 'Cuánto habla cada uno, cuántos tokens gasta y qué tan de acuerdo está con el resto.', optional: true,
    },
  ],
  settings: [
    {
      target: 'providers', title: 'Tus claves de IA',
      body: 'Pega aquí la clave de cada proveedor que quieras usar (este es OpenAI; los demás están debajo). Puedes poner varias: se turnan, y si una llega a su límite se usa la siguiente.',
    },
    {
      target: 'privacy', title: 'Privacidad',
      body: 'Las claves se guardan en este navegador y viajan cifradas al proveedor sin guardarse en el servidor. Usa una clave con límite de gasto.',
    },
    { target: 'backend', title: 'Probar la conexión', body: 'Comprueba que el servidor del consejo responde.' },
  ],
};

export function tourSteps(id: TourId): TourStep[] {
  return id === 'welcome' ? WELCOME : TOURS[id];
}

/** Qué recorridos mostrar al entrar a una pantalla: la bienvenida la primera vez y luego el de la pantalla. */
export function pendingTours(view: AppView, seen: (id: TourId) => boolean): TourId[] {
  return (['welcome', view] as TourId[]).filter((id) => !seen(id));
}

const key = (id: TourId) => `aic_tour_${id}`;

export const tourStore = {
  seen(id: TourId): boolean {
    try {
      return window.localStorage.getItem(key(id)) === '1';
    } catch {
      return true; // sin almacenamiento no se puede recordar: mejor no insistir en cada visita
    }
  },
  markSeen(ids: TourId[]) {
    try {
      ids.forEach((id) => window.localStorage.setItem(key(id), '1'));
    } catch {
      /* modo privado o almacenamiento bloqueado */
    }
  },
};

export interface Box { top: number; left: number; width: number; height: number }
export interface Placement { top: number; left: number; width: number }

export const GUTTER = 16;
export const MOBILE_MAX = 640;
const GAP = 12;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(v, hi));

/**
 * Dónde va la tarjeta del paso. En el teléfono ocupa todo el ancho, abajo o arriba según dónde
 * no tape el elemento; en pantallas grandes va pegada al elemento, debajo, arriba o al lado.
 */
export function placeCard(target: Box | null, cardH: number, vw: number, vh: number): Placement {
  if (vw <= MOBILE_MAX) {
    const width = vw - 2 * GUTTER;
    const bottom = Math.max(GUTTER, vh - cardH - GUTTER);
    const fitsBelow = !target || target.top + target.height + GAP <= bottom;
    const fitsAbove = target != null && target.top - GAP - cardH >= GUTTER;
    return { left: GUTTER, width, top: !fitsBelow && fitsAbove ? GUTTER : bottom };
  }
  const width = Math.min(380, vw - 2 * GUTTER);
  const maxTop = Math.max(GUTTER, vh - cardH - GUTTER);
  if (!target) return { width, left: (vw - width) / 2, top: Math.max(GUTTER, (vh - cardH) / 2) };
  const left = clamp(target.left, GUTTER, vw - width - GUTTER);
  const below = target.top + target.height + GAP;
  if (below + cardH <= vh - GUTTER) return { width, left, top: below };
  const above = target.top - GAP - cardH;
  if (above >= GUTTER) return { width, left, top: above };
  const right = target.left + target.width + GAP;
  if (right + width <= vw - GUTTER) return { width, left: right, top: clamp(target.top, GUTTER, maxTop) };
  const leftSide = target.left - GAP - width;
  if (leftSide >= GUTTER) return { width, left: leftSide, top: clamp(target.top, GUTTER, maxTop) };
  return { width, left: vw - width - GUTTER, top: maxTop };
}
