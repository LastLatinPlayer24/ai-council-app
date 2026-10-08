import { useState } from 'react';
import type { Agent } from '../types';
import type { NewMeetingInput } from '../store';

interface Props {
  agents: Agent[];
  activeAgents: string[];
  hasCurrent: boolean;
  onStart: (input: NewMeetingInput) => void;
  onClose: () => void;
}

const EXAMPLES = [
  'Should we launch our app with a freemium plan or paid-only?',
  'Rewrite our monolith as microservices, or keep improving it?',
  '¿Conviene abrir una segunda sede este año o esperar?',
];

export function NewMeetingModal({ agents, activeAgents, hasCurrent, onStart, onClose }: Props) {
  const [title, setTitle] = useState('');
  const [objective, setObjective] = useState('');
  const [rounds, setRounds] = useState(3);
  const [selected, setSelected] = useState<string[]>(() => {
    const active = activeAgents.filter(id => agents.some(a => a.id === id));
    return active.length ? active : agents.map(a => a.id);
  });
  const [chairmanId, setChairmanId] = useState<string>(() => selected[0] ?? '');

  const toggle = (id: string) => {
    const next = selected.includes(id) ? selected.filter(x => x !== id) : [...selected, id];
    setSelected(next);
    if (!next.includes(chairmanId)) setChairmanId(next[0] ?? '');
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (selected.length === 0) return;
    onStart({
      title: title.trim() || objective.trim().slice(0, 60) || 'AI Council Session',
      objective,
      totalRounds: rounds,
      agentIds: selected,
      chairmanId: chairmanId || selected[0],
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-0 sm:p-4"
      role="dialog" aria-modal="true" aria-labelledby="new-meeting-title" onClick={onClose}>
      <form onSubmit={submit} onClick={e => e.stopPropagation()}
        className="glass-panel hex-corner w-full sm:max-w-lg max-h-[92dvh] overflow-y-auto p-5 space-y-4 rounded-t-xl sm:rounded-xl border border-cyan-500/20">
        <div className="flex items-center justify-between">
          <div id="new-meeting-title" className="font-orbitron text-lg font-bold text-cyan-400 tracking-wide">NEW MEETING</div>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="text-gray-500 hover:text-gray-200 text-xl">✕</button>
        </div>
        {hasCurrent && (
          <p className="text-xs text-gray-500 font-mono-jetbrains">
            The current session is saved to Memory Core and can be exported from there.
          </p>
        )}

        <label className="block space-y-1.5">
          <span className="text-xs font-orbitron text-gray-500 tracking-widest">QUESTION / OBJECTIVE</span>
          <textarea value={objective} onChange={e => setObjective(e.target.value)} rows={3} autoFocus
            placeholder="What should the council decide?"
            className="w-full bg-white/5 border border-cyan-500/20 rounded px-3 py-2 text-gray-200 placeholder-gray-600 focus:outline-none focus:border-cyan-400/40 resize-none"
            style={{ fontSize: '16px' }} />
          <div className="flex flex-wrap gap-1.5">
            {EXAMPLES.map(ex => (
              <button key={ex} type="button" onClick={() => setObjective(ex)}
                className="text-[11px] px-2 py-1 rounded border border-white/10 text-gray-400 hover:border-cyan-400/40 hover:text-cyan-300 text-left">
                {ex}
              </button>
            ))}
          </div>
          <span className="block text-[11px] text-gray-600">The council starts debating it as soon as you press START. Leave it empty to start with a blank room.</span>
        </label>

        <label className="block space-y-1.5">
          <span className="text-xs font-orbitron text-gray-500 tracking-widest">TITLE (OPTIONAL)</span>
          <input value={title} onChange={e => setTitle(e.target.value)} maxLength={80}
            placeholder="Pricing strategy Q3"
            className="w-full bg-white/5 border border-cyan-500/20 rounded px-3 py-2 text-gray-200 placeholder-gray-600 focus:outline-none focus:border-cyan-400/40"
            style={{ fontSize: '16px' }} />
        </label>

        <div className="space-y-1.5">
          <span className="text-xs font-orbitron text-gray-500 tracking-widest">MEMBERS · {selected.length}</span>
          <div className="grid grid-cols-2 gap-2">
            {agents.map(a => {
              const on = selected.includes(a.id);
              return (
                <button key={a.id} type="button" onClick={() => toggle(a.id)} aria-pressed={on}
                  className="flex items-center gap-2 p-2 rounded border text-left transition-all"
                  style={{ borderColor: on ? a.color + '66' : '#ffffff14', background: on ? a.color + '12' : 'transparent', opacity: on ? 1 : 0.55 }}>
                  <span className="text-lg">{a.avatar}</span>
                  <span className="min-w-0">
                    <span className="block text-xs font-orbitron font-bold truncate" style={{ color: a.color }}>{a.name}</span>
                    <span className="block text-[11px] text-gray-500 truncate">{a.role}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="block space-y-1.5">
            <span className="text-xs font-orbitron text-gray-500 tracking-widest">CHAIRMAN</span>
            <select value={chairmanId} onChange={e => setChairmanId(e.target.value)}
              className="w-full bg-[#0b1520] border border-cyan-500/20 rounded px-2 py-2 text-sm text-gray-200 focus:outline-none">
              {agents.filter(a => selected.includes(a.id)).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs font-orbitron text-gray-500 tracking-widest">PLANNED ROUNDS · {rounds}</span>
            <input type="range" min={1} max={6} value={rounds} onChange={e => setRounds(Number(e.target.value))}
              className="w-full accent-cyan-400 mt-2" />
          </label>
        </div>

        <div className="flex gap-2 pt-1">
          <button type="button" onClick={onClose}
            className="px-4 py-2.5 rounded-lg border border-white/10 text-gray-400 text-xs font-orbitron tracking-wider">CANCEL</button>
          <button type="submit" disabled={selected.length === 0}
            className="flex-1 py-2.5 rounded-lg bg-cyan-500/15 border border-cyan-400/50 text-cyan-300 text-xs font-orbitron tracking-widest disabled:opacity-30">
            ▶ START MEETING
          </button>
        </div>
      </form>
    </div>
  );
}
