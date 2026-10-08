import { useState } from 'react';
import type { Agent, Meeting, ProviderConfig } from '../types';
import { getForgeForAgent } from '../forge/forgeStorage';
import { Markdown } from './Markdown';
import { API_BASE_URL } from '../data';

interface MemoryViewProps {
  agents: Agent[];
  meeting: Meeting;
  history: Meeting[];
  onExport: (m: Meeting) => void;
  onDelete: (id: string) => void;
}

function fmt(d: Date | string | undefined) {
  if (!d) return '';
  const date = d instanceof Date ? d : new Date(d);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
}

function SessionCard({ m, onExport, onDelete }: { m: Meeting; onExport: (m: Meeting) => void; onDelete: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const said = m.messages.filter(x => x.type === 'message' && x.content.trim()).length;
  const accepted = m.decisions.filter(d => d.status === 'accepted').length;
  return (
    <div className="hex-corner glass-panel p-4 space-y-2">
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-white truncate">{m.title}</div>
          <div className="text-xs text-gray-500 font-mono-jetbrains">
            {fmt(m.startedAt ?? m.createdAt)} · {m.currentRound} rounds · {said} messages · {accepted}/{m.decisions.length} decisions accepted
          </div>
        </div>
        <span className={`text-[10px] font-mono-jetbrains px-1.5 py-0.5 rounded border ${m.synthesis ? 'text-emerald-300 border-emerald-400/30' : 'text-gray-500 border-white/10'}`}>
          {m.synthesis ? 'RESOLVED' : 'OPEN'}
        </span>
      </div>
      {m.objective && <p className="text-xs text-gray-400 line-clamp-2">{m.objective}</p>}
      {m.synthesis && open && (
        <div className="text-sm text-gray-300 border-t border-white/5 pt-2"><Markdown text={m.synthesis} /></div>
      )}
      <div className="flex gap-2 pt-1">
        {m.synthesis && (
          <button onClick={() => setOpen(!open)} className="text-xs font-mono-jetbrains text-cyan-400/80 hover:text-cyan-300">
            {open ? '▴ hide resolution' : '▾ show resolution'}
          </button>
        )}
        <button onClick={() => onExport(m)} className="ml-auto text-xs font-mono-jetbrains text-gray-400 hover:text-white">⬇ .md</button>
        <button onClick={() => { if (window.confirm(`Delete "${m.title}" from this browser?`)) onDelete(m.id); }}
          className="text-xs font-mono-jetbrains text-red-400/70 hover:text-red-300">delete</button>
      </div>
    </div>
  );
}

export function MemoryView({ agents, meeting, history, onExport, onDelete }: MemoryViewProps) {
  const decisions = meeting.decisions;
  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
      <div>
        <div className="font-orbitron text-2xl font-bold text-cyan-400 glow-cyan tracking-wide">MEMORY CORE</div>
        <div className="text-sm text-gray-500 font-mono-jetbrains mt-1">
          What the council remembers. Everything lives in this browser — nothing is stored on the server.
        </div>
      </div>

      <div className="hex-corner glass-panel p-5" data-tour="memory-shared">
        <div className="text-xs font-orbitron text-gray-500 tracking-widest mb-3">SHARED MEMORY · THIS MEETING</div>
        {decisions.length === 0 ? (
          <p className="text-xs text-gray-600 font-mono-jetbrains">No decisions yet. Every vote you run is remembered here and handed to agents with shared memory on.</p>
        ) : (
          <ul className="space-y-2">
            {decisions.map(d => (
              <li key={d.id} className="text-xs flex gap-2">
                <span className={`font-mono-jetbrains flex-shrink-0 ${d.status === 'accepted' ? 'text-green-400' : 'text-red-400'}`}>
                  {d.status === 'accepted' ? '✓' : '✗'} {d.consensus}%
                </span>
                <span className="text-gray-300">{d.content}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="hex-corner glass-panel p-5" data-tour="memory-status">
        <div className="text-xs font-orbitron text-gray-500 tracking-widest mb-4">AGENT MEMORY</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {agents.map(agent => {
            const forge = getForgeForAgent(agent.id);
            const caps = forge.capabilities ?? {};
            const rows = [
              { label: `sees last ${forge.memoryWindow || 10} messages`, on: true },
              { label: 'private notes (own past answers)', on: caps.memoryPrivate !== false },
              { label: 'shared memory (decisions)', on: caps.memoryShared !== false },
            ];
            return (
              <div key={agent.id} className="p-3 rounded border" style={{ borderColor: agent.color + '22', background: agent.color + '08' }}>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-lg">{agent.avatar}</span>
                  <div className="text-xs font-orbitron font-bold" style={{ color: agent.color }}>{agent.name}</div>
                </div>
                {rows.map(r => (
                  <div key={r.label} className="flex items-center gap-1.5">
                    <div className={`w-1.5 h-1.5 rounded-full ${r.on ? 'bg-green-400' : 'bg-gray-600'}`} />
                    <span className={`text-xs font-mono-jetbrains ${r.on ? 'text-gray-400' : 'text-gray-600 line-through'}`}>{r.label}</span>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
        <p className="text-[11px] text-gray-600 font-mono-jetbrains mt-3">Change these per agent in the Forge (CAPS face).</p>
      </div>

      <div className="space-y-3" data-tour="memory-history">
        <div className="text-xs font-orbitron text-gray-500 tracking-widest">PAST SESSIONS · {history.length}</div>
        {history.length === 0 ? (
          <div className="hex-corner glass-panel p-6 text-center text-xs text-gray-600 font-mono-jetbrains">
            Concluded meetings (⚑ CONCLUDE) and meetings you replace with NEW MEETING are archived here.
          </div>
        ) : history.map(m => <SessionCard key={m.id} m={m} onExport={onExport} onDelete={onDelete} />)}
      </div>
    </div>
  );
}


// ─── SETTINGS VIEW ─────────────────────────────────────
interface SettingsViewProps {
  providerConfigs: Record<string, ProviderConfig>;
  onSaveConfig: (providerId: string, config: Partial<ProviderConfig>) => void;
}

function ApiKeyManager({ providerId, config, onSave }: {
  providerId: string;
  config: ProviderConfig;
  onSave: (providerId: string, config: Partial<ProviderConfig>) => void;
}) {
  const [keys, setKeys] = useState<string[]>(config.apiKeys);
  const [newKey, setNewKey] = useState('');
  const [showKeys, setShowKeys] = useState(false);
  const [customUrl, setCustomUrl] = useState(config.customBaseUrl || '');
  // ollama_cloud is intentionally excluded: it is hosted and requires an API key
  const isLocal = providerId === 'ollama' || providerId === 'lmstudio';

  const addKey = () => {
    if (!newKey.trim()) return;
    const updated = [...keys, newKey.trim()];
    setKeys(updated);
    setNewKey('');
    onSave(providerId, { apiKeys: updated });
  };

  const removeKey = (index: number) => {
    const updated = keys.filter((_, i) => i !== index);
    setKeys(updated);
    onSave(providerId, { apiKeys: updated });
  };

  const saveUrl = () => {
    onSave(providerId, { customBaseUrl: customUrl });
  };

  const maskKey = (key: string) => {
    if (key.length <= 8) return '••••••••';
    return key.slice(0, 4) + '••••' + key.slice(-4);
  };

  return (
    <div className="hex-corner glass-panel p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-orbitron font-bold" style={{ color: config.available ? '#00ff9d' : '#f87171' }}>
            ●
          </span>
          <span className="font-orbitron text-sm text-gray-300 tracking-wider">{config.name}</span>
          {isLocal && <span className="text-xs text-gray-600 font-mono-jetbrains ml-2">LOCAL</span>}
        </div>
        <div className="flex items-center gap-2">
          {keys.length > 0 && (
            <span className="text-xs text-cyan-400/60 font-mono-jetbrains">
              {keys.length} key{keys.length !== 1 ? 's' : ''} · round-robin
            </span>
          )}
          <span className={`text-xs font-mono-jetbrains px-2 py-0.5 rounded ${config.available ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'}`}>
            {config.available ? 'READY' : 'NO KEY'}
          </span>
        </div>
      </div>

      {isLocal && (
        <div className="flex gap-2">
          <input
            type="text"
            value={customUrl}
            onChange={e => setCustomUrl(e.target.value)}
            placeholder={providerId === 'ollama' ? 'http://localhost:11434' : 'http://localhost:1234'}
            className="flex-1 bg-white/5 border border-cyan-500/20 rounded px-3 py-1.5 text-sm text-gray-300 placeholder-gray-700 focus:outline-none focus:border-cyan-400/40 font-mono-jetbrains"
          />
          <button onClick={saveUrl} className="px-3 py-1.5 text-xs bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 font-orbitron tracking-wider rounded hover:bg-cyan-500/20 transition-all">
            SAVE
          </button>
        </div>
      )}

      {!isLocal && (
        <>
          <div className="space-y-2">
            {keys.map((key, i) => (
              <div key={i} className="flex items-center gap-2 group">
                <div className="flex-1 bg-white/5 border border-white/5 rounded px-3 py-1.5 text-sm font-mono-jetbrains text-gray-400">
                  {showKeys ? key : maskKey(key)}
                </div>
                <button onClick={() => removeKey(i)} className="opacity-0 group-hover:opacity-100 px-2 py-1 text-xs text-red-400 hover:text-red-300 transition-all">
                  ✕
                </button>
              </div>
            ))}
          </div>

          <div className="flex gap-2">
            <input
              type="password"
              value={newKey}
              onChange={e => setNewKey(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addKey()}
              placeholder="Add API key..."
              className="flex-1 bg-white/5 border border-cyan-500/20 rounded px-3 py-1.5 text-sm text-gray-300 placeholder-gray-700 focus:outline-none focus:border-cyan-400/40 font-mono-jetbrains"
            />
            <button onClick={addKey} disabled={!newKey.trim()} className="px-3 py-1.5 text-xs bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 font-orbitron tracking-wider rounded hover:bg-cyan-500/20 transition-all disabled:opacity-30 disabled:cursor-not-allowed">
              + ADD
            </button>
          </div>

          {keys.length > 0 && (
            <button onClick={() => setShowKeys(!showKeys)} className="text-xs text-gray-600 hover:text-gray-400 font-mono-jetbrains transition-colors">
              {showKeys ? '🙈 Hide keys' : '👁 Show keys'}
            </button>
          )}
        </>
      )}

      <div className="text-xs text-gray-700 font-mono-jetbrains">
        Models: {config.models.slice(0, 3).join(', ')}{config.models.length > 3 ? ` +${config.models.length - 3}` : ''}
      </div>
    </div>
  );
}

export function SettingsView({ providerConfigs, onSaveConfig }: SettingsViewProps) {
  const [toasts, setToasts] = useState<Array<{id: number, message: string, type: 'success' | 'error' | 'warning' | 'info'}>>([]);

  const showToast = (message: string, type: 'success' | 'error' | 'warning' | 'info') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000);
  };

  return (
    <>
      {/* Toast notifications */}
      <div className="toast-container" aria-live="polite" aria-atomic="true">
        {toasts.map(toast => (
          <div key={toast.id} className={`toast toast-${toast.type}`} role="alert">
            {toast.message}
          </div>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
      <div>
        <div className="font-orbitron text-2xl font-bold text-cyan-400 glow-cyan tracking-wide">SETTINGS</div>
        <div className="text-sm text-gray-500 font-mono-jetbrains mt-1">
          Configure API providers · Add multiple keys per provider for rotation
        </div>
      </div>

      <div className="hex-corner glass-panel p-5 space-y-4">
        <div className="text-xs font-orbitron text-gray-500 tracking-widest border-b border-white/5 pb-3">
          API PROVIDERS
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {Object.values(providerConfigs).map((config, i) => (
            <div key={config.id} data-tour={i === 0 ? 'providers' : undefined}>
              <ApiKeyManager
                providerId={config.id}
                config={config}
                onSave={onSaveConfig}
              />
            </div>
          ))}
        </div>
      </div>

      <div data-tour="backend" className="hex-corner glass-panel p-5 space-y-4">
        <div className="text-xs font-orbitron text-gray-500 tracking-widest border-b border-white/5 pb-3">
          BACKEND CONNECTION
        </div>
        <div className="flex items-center gap-3">
          <div className="flex-1 bg-white/5 border border-cyan-500/20 rounded px-3 py-2 text-sm font-mono-jetbrains text-cyan-400">
            {typeof window !== 'undefined' && (API_BASE_URL || window.location.origin)}/api
          </div>
          <button
            onClick={async () => {
              try {
                const url = API_BASE_URL + '/api/health';
                const resp = await fetch(url);
                const data = await resp.json();
                if (data.status === 'ok') {
                  showToast('✅ Backend connected!', 'success');
                } else {
                  showToast('⚠️ Backend responded with error', 'warning');
                }
              } catch {
                showToast('❌ Cannot connect to backend. Make sure it\'s running on port 8000.', 'error');
              }
            }}
            className="px-4 py-2 bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 text-xs font-orbitron tracking-wider rounded hover:bg-cyan-500/20 transition-all"
          >
            TEST CONNECTION
          </button>
        </div>
        <div className="text-xs text-gray-600 font-mono-jetbrains">
          Start backend: <code className="text-cyan-400/80">cd backend && ./start.sh</code>
        </div>
      </div>

      <div className="hex-corner glass-panel p-5 space-y-4">
        <div className="text-xs font-orbitron text-gray-500 tracking-widest border-b border-white/5 pb-3">
          HOW IT WORKS
        </div>
        <div className="space-y-3 text-sm text-gray-400 font-mono-jetbrains leading-relaxed">
          <p>1. <span className="text-cyan-400">Add API keys</span> for each provider you want to use. Multiple keys are rotated round-robin.</p>
          <p>2. <span className="text-cyan-400">Local models</span> (Ollama, LM Studio) don't need keys — just set the host URL.</p>
          <p>3. <span className="text-cyan-400">Each agent</span> uses the key from its provider. If a key hits rate limits, the next one is used automatically.</p>
          <p data-tour="privacy">4. Keys are stored <span className="text-cyan-400">in your browser</span> (localStorage). With each request they travel over HTTPS through this app's server, which forwards them to the provider and <span className="text-cyan-400">never stores or logs them</span>. Use a key with a spending limit, and remove it from this device when you're done.</p>
          <p>5. Start a council session and agents will <span className="text-cyan-400">respond with real AI</span> based on their configured provider and model.</p>
        </div>
      </div>
      </div>
    </>
  );
}