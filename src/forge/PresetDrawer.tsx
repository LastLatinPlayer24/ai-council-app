import { useState, useRef } from 'react';
import type { Agent } from '../types';
import type { ForgeParams } from './paramSchema';
import type { Preset } from './forgeStorage';
import {
  getAllPresets, saveUserPreset, deleteUserPreset,
  exportForgeProfile, downloadJson,
} from './forgeStorage';
import { defaultForgeParams } from './paramSchema';

// ═══════════════════════════════════════════════════════════════
// PresetDrawer — F5: presets con nombre, export e import
// Se abre desde el Forge como panel deslizante inferior.
// ═══════════════════════════════════════════════════════════════

interface PresetDrawerProps {
  open: boolean;
  onClose: () => void;
  agent: Agent;
  currentParams: ForgeParams;
  onApply: (params: ForgeParams) => void;
}

const ICON_CHOICES = ['⚙', '🔬', '😈', '🤝', '💡', '⚡', '🎯', '🧊', '🔥', '🌊'];

export function PresetDrawer({ open, onClose, agent, currentParams, onApply }: PresetDrawerProps) {
  const [presets, setPresets] = useState<Preset[]>(() => getAllPresets());
  const [mode, setMode] = useState<'list' | 'save'>('list');
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newIcon, setNewIcon] = useState('⚙');
  const [toast, setToast] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const flash = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2200);
  };

  const handleApply = (p: Preset) => {
    onApply({ ...defaultForgeParams(), ...p.params });
    flash(`${p.name} aplicado a ${agent.name}`);
  };

  const handleSaveNew = () => {
    if (!newName.trim()) return;
    saveUserPreset(newName, newDesc, newIcon, currentParams);
    setPresets(getAllPresets());
    setNewName(''); setNewDesc(''); setNewIcon('⚙');
    setMode('list');
    flash('Preset guardado');
  };

  const handleDelete = (p: Preset) => {
    deleteUserPreset(p.id);
    setPresets(getAllPresets());
    flash('Preset eliminado');
  };

  const handleExport = () => {
    const json = exportForgeProfile(agent.id, agent.name);
    downloadJson(`forge-${agent.name.toLowerCase()}.json`, json);
    flash('Perfil exportado');
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        if (parsed?.params) {
          onApply({ ...defaultForgeParams(), ...parsed.params });
          flash(`Importado desde ${file.name}`);
        } else {
          flash('Archivo no válido');
        }
      } catch {
        flash('No se pudo leer el JSON');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 z-40 backdrop-blur-sm"
        onClick={onClose}
        style={{ animation: 'float-up 0.2s ease' }}
      />

      {/* Drawer */}
      <div
        className="fixed bottom-0 left-0 right-0 z-50 glass-panel border-t rounded-t-2xl max-h-[80vh] flex flex-col"
        style={{
          borderColor: agent.color + '33',
          boxShadow: `0 -8px 40px ${agent.color}18`,
          animation: 'float-up 0.28s cubic-bezier(0.16,1,0.3,1)',
          paddingBottom: 'max(12px, env(safe-area-inset-bottom, 12px))',
        }}
      >
        {/* Grab handle */}
        <div className="flex justify-center pt-2.5 pb-1 flex-shrink-0">
          <div className="w-10 h-1 rounded-full bg-white/15" />
        </div>

        {/* Header */}
        <div className="px-4 pb-3 flex items-center justify-between flex-shrink-0">
          <div>
            <div className="font-orbitron text-sm font-bold tracking-wider" style={{ color: agent.color }}>
              {mode === 'list' ? 'PRESETS' : 'GUARDAR PRESET'}
            </div>
            <div className="text-gray-600 font-mono-jetbrains" style={{ fontSize: 9 }}>
              {mode === 'list' ? `Aplicar calibración a ${agent.name}` : 'Nombra la configuración actual'}
            </div>
          </div>
          <button onClick={onClose} className="text-gray-500 text-xl w-8 h-8 flex items-center justify-center active:scale-90 transition-transform"
            style={{ WebkitTapHighlightColor: 'transparent' }} aria-label="Cerrar">✕</button>
        </div>

        {/* ── LISTA ── */}
        {mode === 'list' && (
          <div className="flex-1 overflow-y-auto px-4 pb-3 space-y-2" style={{ overscrollBehavior: 'contain' }}>
            {presets.map(p => (
              <div key={p.id}
                className="flex items-center gap-3 p-3 rounded-lg border transition-all"
                style={{ borderColor: 'rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.02)' }}>
                <span className="text-xl flex-shrink-0">{p.icon}</span>
                <button onClick={() => handleApply(p)} className="flex-1 min-w-0 text-left"
                  style={{ WebkitTapHighlightColor: 'transparent' }}>
                  <div className="font-mono-jetbrains tracking-wider flex items-center gap-1.5" style={{ fontSize: 11, color: agent.color }}>
                    {p.name}
                    {p.builtin && (
                      <span className="px-1 py-0.5 rounded text-gray-600 border border-white/10" style={{ fontSize: 7 }}>
                        FÁBRICA
                      </span>
                    )}
                  </div>
                  <div className="text-gray-600 leading-tight mt-0.5" style={{ fontSize: 8 }}>{p.desc}</div>
                  <div className="font-mono-jetbrains text-gray-700 mt-1" style={{ fontSize: 7 }}>
                    temp {p.params.api.temperature ?? '—'} · mem {p.params.memoryWindow}
                  </div>
                </button>
                <div className="flex flex-col gap-1 flex-shrink-0">
                  <button onClick={() => handleApply(p)}
                    className="px-2.5 py-1 rounded font-orbitron tracking-wider border active:scale-90 transition-transform"
                    style={{
                      fontSize: 9, color: agent.color,
                      borderColor: agent.color + '44', background: agent.color + '12',
                      WebkitTapHighlightColor: 'transparent',
                    }}>
                    USAR
                  </button>
                  {!p.builtin && (
                    <button onClick={() => handleDelete(p)}
                      className="px-2.5 py-1 rounded font-mono-jetbrains text-red-400/70 border border-red-500/20 active:scale-90 transition-transform"
                      style={{ fontSize: 8, WebkitTapHighlightColor: 'transparent' }}>
                      BORRAR
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── GUARDAR ── */}
        {mode === 'save' && (
          <div className="flex-1 overflow-y-auto px-4 pb-3 space-y-4">
            <div>
              <label className="font-mono-jetbrains tracking-widest text-gray-500 block mb-1.5" style={{ fontSize: 9 }}>
                NOMBRE
              </label>
              <input value={newName} onChange={e => setNewName(e.target.value)}
                placeholder="ANALISTA PROPIO"
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-gray-200 placeholder-gray-700 focus:outline-none font-orbitron tracking-wider"
                style={{ fontSize: 16, borderColor: newName ? agent.color + '44' : undefined }} />
            </div>
            <div>
              <label className="font-mono-jetbrains tracking-widest text-gray-500 block mb-1.5" style={{ fontSize: 9 }}>
                DESCRIPCIÓN
              </label>
              <input value={newDesc} onChange={e => setNewDesc(e.target.value)}
                placeholder="Qué hace esta calibración"
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-gray-300 placeholder-gray-700 focus:outline-none"
                style={{ fontSize: 16 }} />
            </div>
            <div>
              <label className="font-mono-jetbrains tracking-widest text-gray-500 block mb-1.5" style={{ fontSize: 9 }}>
                ICONO
              </label>
              <div className="flex gap-2 flex-wrap">
                {ICON_CHOICES.map(ic => (
                  <button key={ic} onClick={() => setNewIcon(ic)}
                    className="w-10 h-10 rounded-lg border flex items-center justify-center text-lg active:scale-90 transition-all"
                    style={{
                      borderColor: newIcon === ic ? agent.color + '66' : 'rgba(255,255,255,0.08)',
                      background: newIcon === ic ? agent.color + '15' : 'transparent',
                      WebkitTapHighlightColor: 'transparent',
                    }}>
                    {ic}
                  </button>
                ))}
              </div>
            </div>
            <div className="p-3 rounded-lg border border-white/5 bg-white/[0.02]">
              <div className="font-mono-jetbrains text-gray-600 mb-1" style={{ fontSize: 8 }}>SE GUARDARÁ</div>
              <div className="font-mono-jetbrains text-gray-400" style={{ fontSize: 9 }}>
                {Object.keys(currentParams.api).length} params API · {Object.keys(currentParams.synthetic).length} diales mentales · ventana {currentParams.memoryWindow}
              </div>
            </div>
          </div>
        )}

        {/* Barra de acciones */}
        <div className="px-4 pt-2 flex gap-2 flex-shrink-0 border-t border-white/5">
          {mode === 'list' ? (
            <>
              <button onClick={() => setMode('save')}
                className="flex-1 py-2.5 rounded-lg font-orbitron tracking-wider border active:scale-98 transition-all"
                style={{
                  fontSize: 10, color: agent.color,
                  borderColor: agent.color + '44', background: agent.color + '12',
                  WebkitTapHighlightColor: 'transparent',
                }}>
                + GUARDAR ACTUAL
              </button>
              <button onClick={handleExport}
                className="px-3 py-2.5 rounded-lg font-orbitron tracking-wider border border-white/10 text-gray-400 active:scale-95 transition-all"
                style={{ fontSize: 10, WebkitTapHighlightColor: 'transparent' }}>
                ↓ EXPORTAR
              </button>
              <button onClick={() => fileRef.current?.click()}
                className="px-3 py-2.5 rounded-lg font-orbitron tracking-wider border border-white/10 text-gray-400 active:scale-95 transition-all"
                style={{ fontSize: 10, WebkitTapHighlightColor: 'transparent' }}>
                ↑ IMPORTAR
              </button>
              <input ref={fileRef} type="file" accept="application/json,.json"
                onChange={handleImportFile} className="hidden" />
            </>
          ) : (
            <>
              <button onClick={() => setMode('list')}
                className="px-4 py-2.5 rounded-lg font-orbitron tracking-wider border border-white/10 text-gray-500 active:scale-95 transition-all"
                style={{ fontSize: 10, WebkitTapHighlightColor: 'transparent' }}>
                VOLVER
              </button>
              <button onClick={handleSaveNew} disabled={!newName.trim()}
                className="flex-1 py-2.5 rounded-lg font-orbitron tracking-wider border active:scale-98 transition-all disabled:opacity-30"
                style={{
                  fontSize: 10, color: agent.color,
                  borderColor: agent.color + '55', background: agent.color + '18',
                  WebkitTapHighlightColor: 'transparent',
                }}>
                ✓ GUARDAR PRESET
              </button>
            </>
          )}
        </div>

        {/* Toast */}
        {toast && (
          <div className="absolute -top-12 left-1/2 -translate-x-1/2 px-4 py-2 rounded-lg glass-panel border whitespace-nowrap"
            style={{ borderColor: agent.color + '44', animation: 'float-up 0.2s ease' }}>
            <span className="font-mono-jetbrains" style={{ fontSize: 10, color: agent.color }}>{toast}</span>
          </div>
        )}
      </div>
    </>
  );
}
