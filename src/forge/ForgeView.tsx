import { useState, useCallback, useMemo } from 'react';
import type { Agent } from '../types';
import type { ForgeParams } from './paramSchema';
import {
  paramsForProvider, SYNTHETIC_DIALS, CAPABILITIES,
  defaultForgeParams, buildSyntheticPrompt, clampApiParam,
} from './paramSchema';
import { getForgeForAgent, saveForge } from './forgeStorage';
import { PresetDrawer } from './PresetDrawer';
import { RotaryDial } from './controls/RotaryDial';
import { PlainSlider, BipolarSlider, LogSlider, SegmentedRing, NeonToggle } from './controls/Controls';

// ═══════════════════════════════════════════════════════════════
// AGENT FORGE — terminal de creación y calibración de agentes
// · Carrusel 3D cover-flow para elegir agente
// · Panel-cubo con 3 caras: API / MIND / CAPS
// · Draft local → commit explícito con botón FORGE
// · PromptPreview en vivo: transparencia total
// ═══════════════════════════════════════════════════════════════

type Face = 'api' | 'mind' | 'caps';

interface ForgeViewProps {
  agents: Agent[];
  onUpdateAgent: (id: string, patch: Partial<Agent>) => void;
  isMobile?: boolean;
}


// ─── Carrusel 3D ─────────────────────────────────────────────────
function AgentCarousel({ agents, selectedIdx, onSelect }: {
  agents: Agent[]; selectedIdx: number; onSelect: (i: number) => void;
}) {
  return (
    <div className="relative h-40 flex items-center justify-center overflow-hidden"
      style={{ perspective: '900px' }}>
      {agents.map((agent, i) => {
        const offset = i - selectedIdx;
        const abs = Math.abs(offset);
        if (abs > 2) return null;
        const isCenter = offset === 0;
        return (
          <button
            key={agent.id}
            onClick={() => onSelect(i)}
            className="absolute transition-all duration-500 ease-out"
            style={{
              transform: `
                translateX(${offset * 110}px)
                translateZ(${isCenter ? 60 : -60 * abs}px)
                rotateY(${offset * -28}deg)
                scale(${isCenter ? 1 : 0.82})
              `,
              transformStyle: 'preserve-3d',
              opacity: isCenter ? 1 : 0.45,
              zIndex: 10 - abs,
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            <div
              className="w-24 h-32 rounded-xl flex flex-col items-center justify-center gap-2 border backdrop-blur"
              style={{
                background: `linear-gradient(160deg, ${agent.color}18, rgba(7,13,20,0.9))`,
                borderColor: isCenter ? agent.color + '88' : agent.color + '22',
                boxShadow: isCenter ? `0 0 30px ${agent.color}33, inset 0 0 20px ${agent.color}0a` : 'none',
              }}
            >
              <span style={{ fontSize: 30 }}>{agent.avatar}</span>
              <span className="font-orbitron font-bold tracking-wider" style={{ color: agent.color, fontSize: 11 }}>
                {agent.name}
              </span>
              <span className="font-mono-jetbrains text-gray-500" style={{ fontSize: 7 }}>
                {agent.provider.toUpperCase()}
              </span>
            </div>
          </button>
        );
      })}
      {/* Flechas de navegación */}
      {selectedIdx > 0 && (
        <button onClick={() => onSelect(selectedIdx - 1)}
          className="absolute left-2 z-20 w-9 h-9 rounded-full border border-cyan-500/30 bg-black/40 text-cyan-400 flex items-center justify-center active:scale-90 transition-transform"
          style={{ WebkitTapHighlightColor: 'transparent' }} aria-label="Agente anterior">‹</button>
      )}
      {selectedIdx < agents.length - 1 && (
        <button onClick={() => onSelect(selectedIdx + 1)}
          className="absolute right-2 z-20 w-9 h-9 rounded-full border border-cyan-500/30 bg-black/40 text-cyan-400 flex items-center justify-center active:scale-90 transition-transform"
          style={{ WebkitTapHighlightColor: 'transparent' }} aria-label="Agente siguiente">›</button>
      )}
    </div>
  );
}

// ─── Cara API ────────────────────────────────────────────────────
function ApiFace({ agent, draft, setDraft }: {
  agent: Agent; draft: ForgeParams; setDraft: (fn: (d: ForgeParams) => ForgeParams) => void;
}) {
  const params = paramsForProvider(agent.provider);
  const getValue = (key: string, def: number) => draft.api[key] ?? def;
  const setValue = (key: string) => (v: number) =>
    setDraft(d => ({ ...d, api: { ...d.api, [key]: clampApiParam(key, v) } }));

  const dialParams = params.filter(p => p.kind === 'dial');
  const otherParams = params.filter(p => p.kind !== 'dial');

  return (
    <div className="space-y-5">
      {/* Diales protagonistas */}
      <div className="flex justify-center gap-6 flex-wrap">
        {dialParams.map(p => (
          <RotaryDial key={p.key} label={p.label} desc={p.desc}
            value={getValue(p.key, p.default)}
            min={p.min} max={p.max} step={p.step} defaultValue={p.default}
            unit={p.unit} color={agent.color}
            onChange={setValue(p.key)} />
        ))}
      </div>
      {/* Sliders */}
      <div className="space-y-4">
        {otherParams.map(p => {
          // `key` must be passed directly to JSX, not through the spread
          // object — React 19 warns (and won't reconcile the list
          // correctly) if it travels inside `common`.
          const common = {
            label: p.label, desc: p.desc, unit: p.unit,
            value: getValue(p.key, p.default),
            min: p.min, max: p.max, step: p.step,
            onChange: setValue(p.key),
          };
          if (p.kind === 'bipolar') return <BipolarSlider key={p.key} {...common} />;
          if (p.kind === 'logslider') return <LogSlider key={p.key} {...common} />;
          return <PlainSlider key={p.key} {...common} color={agent.color} />;
        })}
      </div>
      <div className="text-center text-gray-700 font-mono-jetbrains" style={{ fontSize: 8 }}>
        DOBLE TAP EN UN DIAL = RESET · SOLO SE MUESTRAN PARÁMETROS DE {agent.provider.toUpperCase()}
      </div>
    </div>
  );
}

// ─── Cara MIND (diales sintéticos) ───────────────────────────────
function MindFace({ agent, draft, setDraft }: {
  agent: Agent; draft: ForgeParams; setDraft: (fn: (d: ForgeParams) => ForgeParams) => void;
}) {
  const [showPrompt, setShowPrompt] = useState(false);
  const generatedPrompt = useMemo(() => buildSyntheticPrompt(draft.synthetic), [draft.synthetic]);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-x-2 gap-y-5 justify-items-center">
        {SYNTHETIC_DIALS.map(dial => (
          <SegmentedRing key={dial.key}
            label={dial.label} icon={dial.icon}
            levels={dial.levels.map(l => l.name)}
            value={draft.synthetic[dial.key] ?? dial.default}
            color={agent.color}
            onChange={idx => setDraft(d => ({ ...d, synthetic: { ...d.synthetic, [dial.key]: idx } }))} />
        ))}
      </div>

      {/* Prompt preview en vivo */}
      <div className="rounded-lg border border-white/10 overflow-hidden">
        <button onClick={() => setShowPrompt(!showPrompt)}
          className="w-full flex items-center justify-between px-3 py-2 bg-white/[0.03] text-left"
          style={{ WebkitTapHighlightColor: 'transparent' }}>
          <span className="font-mono-jetbrains tracking-widest text-gray-400" style={{ fontSize: 9 }}>
            ⚡ PROMPT GENERADO (EN VIVO)
          </span>
          <span className="text-gray-600" style={{ fontSize: 10 }}>{showPrompt ? '▲' : '▼'}</span>
        </button>
        {showPrompt && (
          <div className="p-3 bg-black/30 border-t border-white/5">
            <p className="font-mono-jetbrains text-gray-400 leading-relaxed" style={{ fontSize: 9 }}>
              {generatedPrompt}
            </p>
            <div className="mt-2 text-gray-700" style={{ fontSize: 8 }}>
              Este texto se añade al system prompt del agente. Cada dial controla un bloque.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Cara CAPS ───────────────────────────────────────────────────
function CapsFace({ agent, draft, setDraft }: {
  agent: Agent; draft: ForgeParams; setDraft: (fn: (d: ForgeParams) => ForgeParams) => void;
}) {
  return (
    <div className="space-y-3">
      {CAPABILITIES.map(cap => (
        <NeonToggle key={cap.key}
          label={cap.label} desc={cap.desc} icon={cap.icon}
          checked={draft.capabilities[cap.key] ?? cap.default}
          color={agent.color}
          onChange={v => setDraft(d => ({ ...d, capabilities: { ...d.capabilities, [cap.key]: v } }))} />
      ))}
      <div className="pt-2">
        <PlainSlider label="VENTANA DE MEMORIA" desc="Últimos N mensajes que el agente ve del debate"
          value={draft.memoryWindow} min={4} max={50} step={2}
          unit="msgs" color={agent.color}
          onChange={v => setDraft(d => ({ ...d, memoryWindow: v }))} />
      </div>
    </div>
  );
}

// ─── Main ForgeView ──────────────────────────────────────────────
export function ForgeView({ agents, onUpdateAgent, isMobile }: ForgeViewProps) {
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [face, setFace] = useState<Face>('api');
  const [flipping, setFlipping] = useState(false);
  const [committed, setCommitted] = useState(false);
  const [showPresets, setShowPresets] = useState(false);

  const agent = agents[selectedIdx];
  const [draft, setDraftState] = useState<ForgeParams>(() => agent ? getForgeForAgent(agent.id) : defaultForgeParams());
  const [savedSnapshot, setSavedSnapshot] = useState(() => JSON.stringify(draft));
  // Patrón React recomendado: ajustar estado durante el render cuando
  // cambia una prop clave, en lugar de useEffect + setState (evita
  // renders en cascada y el parpadeo del panel al cambiar de agente).
  const [lastAgentId, setLastAgentId] = useState(agent?.id);
  if (agent && agent.id !== lastAgentId) {
    const loaded = getForgeForAgent(agent.id);
    setLastAgentId(agent.id);
    setDraftState(loaded);
    setSavedSnapshot(JSON.stringify(loaded));
    setCommitted(false);
  }

  const setDraft = useCallback((fn: (d: ForgeParams) => ForgeParams) => {
    setDraftState(prev => fn(prev));
    setCommitted(false);
  }, []);

  const isDirty = JSON.stringify(draft) !== savedSnapshot;

  const switchFace = (f: Face) => {
    if (f === face) return;
    setFlipping(true);
    setTimeout(() => { setFace(f); setFlipping(false); }, 180);
  };

  const handleForge = () => {
    if (!agent) return;
    saveForge(agent.id, draft);
    setSavedSnapshot(JSON.stringify(draft));
    // Sincronizar temperature al campo legacy del agente (compatibilidad total)
    const temp = draft.api['temperature'];
    onUpdateAgent(agent.id, temp !== undefined ? { temperature: temp } : {});
    setCommitted(true);
    setTimeout(() => setCommitted(false), 2000);
  };

  const handleDiscard = () => {
    if (!agent) return;
    const loaded = getForgeForAgent(agent.id);
    setDraftState(loaded);
    setSavedSnapshot(JSON.stringify(loaded));
  };

  if (!agent) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-600 font-mono-jetbrains text-sm">
        NO AGENTS DEPLOYED
      </div>
    );
  }

  const faces: { id: Face; label: string; icon: string }[] = [
    { id: 'api', label: 'API', icon: '⚙' },
    { id: 'mind', label: 'MIND', icon: '🧠' },
    { id: 'caps', label: 'CAPS', icon: '⚡' },
  ];

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="glass-panel border-b border-cyan-500/10 px-4 py-2.5 flex items-center justify-between flex-shrink-0">
        <div>
          <div className="font-orbitron text-sm font-bold text-cyan-400 tracking-wider glow-cyan">AGENT FORGE</div>
          <div className="text-gray-600 font-mono-jetbrains" style={{ fontSize: 9 }}>
            Calibración de parámetros · {agent.name}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isDirty && (
            <span className="font-mono-jetbrains text-yellow-400 animate-status-blink" style={{ fontSize: 9 }}>
              ● SIN FORJAR
            </span>
          )}
          <button data-tour="forge-presets" onClick={() => setShowPresets(true)}
            className="px-3 py-1.5 rounded-lg border font-orbitron tracking-wider active:scale-95 transition-all"
            style={{
              fontSize: 10, color: agent.color,
              borderColor: agent.color + '44', background: agent.color + '12',
              WebkitTapHighlightColor: 'transparent',
            }}>
            ▤ PRESETS
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto" style={{ overscrollBehavior: 'contain' }}>
        {/* Carrusel 3D */}
        <div data-tour="forge-carousel">
          <AgentCarousel agents={agents} selectedIdx={selectedIdx} onSelect={setSelectedIdx} />
        </div>

        {/* Selector de cara */}
        <div className="flex justify-center px-4 mb-3">
          <div data-tour="forge-faces" className="flex rounded-lg border border-cyan-500/20 overflow-hidden">
            {faces.map(f => (
              <button key={f.id} onClick={() => switchFace(f.id)}
                className={`px-5 py-2 font-mono-jetbrains tracking-widest transition-all ${
                  face === f.id ? 'bg-cyan-500/15 text-cyan-400' : 'text-gray-600'
                }`}
                style={{ fontSize: 10, WebkitTapHighlightColor: 'transparent' }}>
                {f.icon} {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* Panel con flip 3D */}
        <div className={`px-4 pb-6 mx-auto w-full ${isMobile ? '' : 'max-w-lg'}`}
          style={{ perspective: '1200px' }}>
          <div
            className="glass-panel rounded-xl p-5 hex-corner"
            style={{
              borderColor: agent.color + '22',
              transform: flipping ? 'rotateY(90deg) scale(0.96)' : 'rotateY(0) scale(1)',
              opacity: flipping ? 0.3 : 1,
              transition: 'transform 0.18s ease-in, opacity 0.18s',
              transformStyle: 'preserve-3d',
            }}>
            {face === 'api' && <ApiFace agent={agent} draft={draft} setDraft={setDraft} />}
            {face === 'mind' && <MindFace agent={agent} draft={draft} setDraft={setDraft} />}
            {face === 'caps' && <CapsFace agent={agent} draft={draft} setDraft={setDraft} />}
          </div>
        </div>
      </div>

      {/* Barra de commit */}
      <div data-tour="forge-commit" className="glass-panel border-t border-cyan-500/10 p-3 flex gap-2 flex-shrink-0"
        style={{ paddingBottom: isMobile ? 'max(12px, env(safe-area-inset-bottom, 12px))' : undefined }}>
        <button onClick={handleDiscard} disabled={!isDirty}
          className="px-4 py-2.5 rounded-lg border border-white/10 text-gray-500 font-orbitron tracking-wider disabled:opacity-25 active:scale-95 transition-all"
          style={{ fontSize: 11, WebkitTapHighlightColor: 'transparent' }}>
          DESCARTAR
        </button>
        <button onClick={handleForge} disabled={!isDirty && !committed}
          className="flex-1 py-2.5 rounded-lg font-orbitron tracking-widest transition-all active:scale-98 disabled:opacity-30"
          style={{
            fontSize: 12,
            background: committed ? '#00ff9d22' : agent.color + '18',
            border: `1px solid ${committed ? '#00ff9d88' : agent.color + '55'}`,
            color: committed ? '#00ff9d' : agent.color,
            boxShadow: committed ? '0 0 20px #00ff9d44' : isDirty ? `0 0 15px ${agent.color}22` : 'none',
            WebkitTapHighlightColor: 'transparent',
          }}>
          {committed ? '✓ FORJADO' : '⚒ FORGE'}
        </button>
      </div>

      {/* F5 — Presets, export e import */}
      <PresetDrawer
        open={showPresets}
        onClose={() => setShowPresets(false)}
        agent={agent}
        currentParams={draft}
        onApply={(params) => {
          setDraftState(params);
          setCommitted(false);
        }}
      />
    </div>
  );
}
