import { useState } from 'react';
import type { Agent, AgentMode, AgentProvider, ProviderConfig } from '../types';
import { PROVIDER_MODELS } from '../data';
import { modelsForProvider } from '../utils';

interface AgentsViewProps {
  agents: Agent[];
  onAddAgent: (data: Partial<Agent>) => void;
  showNewAgent: boolean;
  setShowNewAgent: (v: boolean) => void;
  /** Live catalogs from the backend. Falls back to the static list when absent. */
  providerConfigs?: Record<string, ProviderConfig>;
}

const modeConfig: Record<AgentMode, { label: string; color: string; desc: string }> = {
  default: { label: 'DEFAULT', color: '#60a5fa', desc: 'Balanced discussion participant' },
  devils_advocate: { label: "DEVIL'S ADVOCATE", color: '#f87171', desc: 'Challenges assumptions critically' },
  consensus_builder: { label: 'CONSENSUS', color: '#00ff9d', desc: 'Synthesizes and finds common ground' },
  analyst: { label: 'ANALYST', color: '#f59e0b', desc: 'Data-driven, quantitative focus' },
  critic: { label: 'CRITIC', color: '#e879f9', desc: 'Rigorous quality assessment' },
};

const providerConfig: Record<string, { color: string; icon: string }> = {
  openai: { color: '#00ff9d', icon: '⊕' },
  anthropic: { color: '#f87171', icon: '◈' },
  gemini: { color: '#60a5fa', icon: '◇' },
  ollama: { color: '#a855f7', icon: '⬡' },
  mistral: { color: '#f59e0b', icon: '◎' },
  cohere: { color: '#00f5ff', icon: '✦' },
  groq: { color: '#e879f9', icon: '⚡' },
};

function AgentDetailCard({ agent }: { agent: Agent }) {
  const mode = modeConfig[agent.mode];
  const provider = providerConfig[agent.provider];

  return (
    <div
      className="hex-corner glass-panel p-5 relative overflow-hidden"
      style={{ borderColor: agent.color + '22' }}
    >
      <div className="absolute top-0 left-0 right-0 h-px" style={{ background: `linear-gradient(90deg, transparent, ${agent.color}44, transparent)` }} />

      {/* Header */}
      <div className="flex items-start gap-4 mb-4">
        <div
          className="w-14 h-14 rounded flex items-center justify-center text-2xl relative flex-shrink-0"
          style={{ background: agent.color + '15', border: `1px solid ${agent.color}33` }}
        >
          {agent.avatar}
          <div
            className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-black flex items-center justify-center"
            style={{ background: agent.status === 'active' ? '#00ff9d' : agent.status === 'thinking' ? '#60a5fa' : '#fbbf24' }}
          />
        </div>
        <div className="flex-1">
          <div className="font-orbitron text-lg font-bold" style={{ color: agent.color }}>
            {agent.name}
          </div>
          <div className="text-sm text-gray-400 mb-1">{agent.role}</div>
          <div className="flex gap-2 flex-wrap">
            {agent.expertise.map(tag => (
              <span
                key={tag}
                className="px-2 py-0.5 text-xs rounded font-mono-jetbrains"
                style={{ background: agent.color + '15', color: agent.color + 'aa', border: `1px solid ${agent.color}22` }}
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Config */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="p-2 bg-white/3 rounded border border-white/5">
          <div className="text-xs text-gray-600 font-mono-jetbrains mb-0.5">PROVIDER</div>
          <div className="flex items-center gap-1.5">
            <span style={{ color: provider?.color }}>{provider?.icon}</span>
            <span className="text-sm text-gray-300 font-mono-jetbrains">{agent.provider}</span>
          </div>
        </div>
        <div className="p-2 bg-white/3 rounded border border-white/5">
          <div className="text-xs text-gray-600 font-mono-jetbrains mb-0.5">MODEL</div>
          <div className="text-sm text-gray-300 font-mono-jetbrains truncate">{agent.model}</div>
        </div>
        <div className="p-2 bg-white/3 rounded border border-white/5">
          <div className="text-xs text-gray-600 font-mono-jetbrains mb-0.5">TEMPERATURE</div>
          <div className="flex items-center gap-2">
            <div className="flex-1 h-1 bg-white/5 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full"
                style={{ width: `${agent.temperature * 100}%`, background: '#f59e0b' }}
              />
            </div>
            <span className="text-sm text-gray-300 font-mono-jetbrains">{agent.temperature}</span>
          </div>
        </div>
        <div className="p-2 bg-white/3 rounded border border-white/5">
          <div className="text-xs text-gray-600 font-mono-jetbrains mb-0.5">MODE</div>
          <span className="text-xs font-mono-jetbrains" style={{ color: mode.color }}>{mode.label}</span>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-2 text-center">
        {[
          { label: 'MSGS', value: agent.messageCount },
          { label: 'TOKENS', value: `${(agent.tokens / 1000).toFixed(1)}k` },
          { label: 'AGREE', value: `${agent.agreementScore}%` },
          { label: 'AVG MS', value: agent.latency },
        ].map(stat => (
          <div key={stat.label} className="p-2 bg-white/3 rounded border border-white/5">
            <div className="text-xs text-gray-600 font-mono-jetbrains">{stat.label}</div>
            <div className="text-sm font-bold text-gray-200 font-mono-jetbrains">{stat.value}</div>
          </div>
        ))}
      </div>

      {/* Memory badge */}
      <div className="mt-3 flex items-center gap-2">
        <div className={`w-1.5 h-1.5 rounded-full ${agent.memoryEnabled ? 'bg-green-400' : 'bg-gray-600'}`} />
        <span className="text-xs font-mono-jetbrains text-gray-600">
          {agent.memoryEnabled ? 'MEMORY ENABLED' : 'MEMORY DISABLED'}
        </span>
      </div>
    </div>
  );
}

function NewAgentModal({ onAdd, onClose, providerConfigs }: {
  onAdd: (data: Partial<Agent>) => void;
  onClose: () => void;
  providerConfigs?: Record<string, ProviderConfig>;
}) {
  const [form, setForm] = useState({
    name: '',
    role: '',
    provider: 'openai' as AgentProvider,
    model: 'gpt-4o',
    temperature: 0.7,
    systemPrompt: '',
    mode: 'default' as AgentMode,
    avatar: '🤖',
    memoryEnabled: true,
    expertise: '',
  });

  const models = modelsForProvider(form.provider, providerConfigs);

  const handleSubmit = () => {
    if (!form.name.trim()) return;
    onAdd({
      ...form,
      expertise: form.expertise.split(',').map(e => e.trim()).filter(Boolean),
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="hex-corner glass-panel w-full max-w-lg p-6 space-y-4 relative">
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-cyan-400/40 to-transparent" />

        <div className="flex items-center justify-between">
          <div className="font-orbitron text-lg font-bold text-cyan-400 tracking-wider">NEW AGENT</div>
          <button onClick={onClose} className="text-gray-600 hover:text-gray-300 transition-colors text-xl">✕</button>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-mono-jetbrains text-gray-500 tracking-wider block mb-1">DESIGNATION</label>
            <input
              value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value.toUpperCase() })}
              placeholder="ALPHA, NOVA, etc."
              className="w-full bg-white/5 border border-cyan-500/20 rounded px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-cyan-400/40 font-orbitron"
            />
          </div>
          <div>
            <label className="text-xs font-mono-jetbrains text-gray-500 tracking-wider block mb-1">AVATAR</label>
            <input
              value={form.avatar}
              onChange={e => setForm({ ...form, avatar: e.target.value })}
              className="w-full bg-white/5 border border-cyan-500/20 rounded px-3 py-2 text-2xl text-center focus:outline-none focus:border-cyan-400/40"
            />
          </div>
        </div>

        <div>
          <label className="text-xs font-mono-jetbrains text-gray-500 tracking-wider block mb-1">ROLE / FUNCTION</label>
          <input
            value={form.role}
            onChange={e => setForm({ ...form, role: e.target.value })}
            placeholder="Strategic Analyst, Code Reviewer..."
            className="w-full bg-white/5 border border-cyan-500/20 rounded px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-cyan-400/40"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-mono-jetbrains text-gray-500 tracking-wider block mb-1">PROVIDER</label>
            <select
              value={form.provider}
              onChange={e => setForm({
                ...form,
                provider: e.target.value as AgentProvider,
                model: modelsForProvider(e.target.value, providerConfigs)[0] ?? '',
              })}
              className="w-full bg-white/5 border border-cyan-500/20 rounded px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-cyan-400/40"
            >
              {Object.keys(PROVIDER_MODELS).map(p => (
                <option key={p} value={p} className="bg-gray-900">{p.toUpperCase()}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-mono-jetbrains text-gray-500 tracking-wider block mb-1">MODEL</label>
            <select
              value={form.model}
              onChange={e => setForm({ ...form, model: e.target.value })}
              className="w-full bg-white/5 border border-cyan-500/20 rounded px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-cyan-400/40"
            >
              {models.map(m => (
                <option key={m} value={m} className="bg-gray-900">{m}</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="text-xs font-mono-jetbrains text-gray-500 tracking-wider block mb-1">
            TEMPERATURE: {form.temperature}
          </label>
          <input
            type="range" min="0" max="1" step="0.1"
            value={form.temperature}
            onChange={e => setForm({ ...form, temperature: parseFloat(e.target.value) })}
            className="w-full accent-cyan-400"
          />
        </div>

        <div>
          <label className="text-xs font-mono-jetbrains text-gray-500 tracking-wider block mb-1">MODE</label>
          <div className="grid grid-cols-3 gap-2">
            {Object.entries(modeConfig).map(([key, cfg]) => (
              <button
                key={key}
                onClick={() => setForm({ ...form, mode: key as AgentMode })}
                className="p-2 text-xs rounded border transition-all text-left"
                style={{
                  borderColor: form.mode === key ? cfg.color + '60' : '#ffffff10',
                  background: form.mode === key ? cfg.color + '15' : 'transparent',
                  color: form.mode === key ? cfg.color : '#6b7280',
                }}
              >
                <div className="font-mono-jetbrains font-bold">{cfg.label}</div>
                <div className="text-xs opacity-70 mt-0.5">{cfg.desc}</div>
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-xs font-mono-jetbrains text-gray-500 tracking-wider block mb-1">SYSTEM PROMPT</label>
          <textarea
            value={form.systemPrompt}
            onChange={e => setForm({ ...form, systemPrompt: e.target.value })}
            placeholder="Describe this agent's personality, expertise, and behavior..."
            rows={3}
            className="w-full bg-white/5 border border-cyan-500/20 rounded px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-cyan-400/40 resize-none"
          />
        </div>

        <div>
          <label className="text-xs font-mono-jetbrains text-gray-500 tracking-wider block mb-1">EXPERTISE TAGS (comma-separated)</label>
          <input
            value={form.expertise}
            onChange={e => setForm({ ...form, expertise: e.target.value })}
            placeholder="Strategy, Data Analysis, Engineering"
            className="w-full bg-white/5 border border-cyan-500/20 rounded px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-cyan-400/40"
          />
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-500 hover:text-gray-300 font-orbitron tracking-wider transition-colors"
          >
            CANCEL
          </button>
          <button
            onClick={handleSubmit}
            className="px-6 py-2 bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 text-sm font-orbitron tracking-wider rounded hover:bg-cyan-500/20 transition-all"
          >
            DEPLOY AGENT
          </button>
        </div>
      </div>
    </div>
  );
}

export function AgentsView({ agents, onAddAgent, showNewAgent, setShowNewAgent, providerConfigs }: AgentsViewProps) {
  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <div className="font-orbitron text-2xl font-bold text-cyan-400 glow-cyan tracking-wide">AGENT ROSTER</div>
          <div className="text-sm text-gray-500 font-mono-jetbrains mt-1">{agents.length} agents deployed</div>
        </div>
        <button
          data-tour="new-agent"
          onClick={() => setShowNewAgent(true)}
          className="px-4 py-2 bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 text-sm font-orbitron tracking-wider rounded hover:bg-cyan-500/20 transition-all flex items-center gap-2"
        >
          <span>+</span> NEW AGENT
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {agents.map((agent, i) => (
          <div key={agent.id} data-tour={i === 0 ? 'agent-list' : undefined}>
            <AgentDetailCard agent={agent} />
          </div>
        ))}
      </div>

      {showNewAgent && (
        <NewAgentModal onAdd={onAddAgent} onClose={() => setShowNewAgent(false)} providerConfigs={providerConfigs} />
      )}
    </div>
  );
}
