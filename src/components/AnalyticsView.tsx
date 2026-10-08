import type { Agent, Meeting } from '../types';

interface AnalyticsProps {
  agents: Agent[];
  meeting: Meeting;
  totalTokens: number;
}

function RadarBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = Math.min((value / max) * 100, 100);
  return (
    <div className="flex items-center gap-3">
      <div className="w-16 text-xs text-gray-500 font-mono-jetbrains text-right">{label}</div>
      <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${color}88, ${color})` }}
        />
      </div>
      <div className="w-12 text-xs font-mono-jetbrains text-right" style={{ color }}>{value}</div>
    </div>
  );
}

function AgentMetricRow({ agent }: { agent: Agent }) {
  return (
    <tr className="border-t border-white/5 hover:bg-white/[0.02] transition-colors">
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-lg">{agent.avatar}</span>
          <div>
            <div className="text-sm font-orbitron font-bold" style={{ color: agent.color }}>{agent.name}</div>
            <div className="text-xs text-gray-600 font-mono-jetbrains">{agent.provider}</div>
          </div>
        </div>
      </td>
      <td className="px-4 py-3 text-sm font-mono-jetbrains text-gray-300">{agent.messageCount}</td>
      <td className="px-4 py-3 text-sm font-mono-jetbrains text-gray-300">{(agent.tokens / 1000).toFixed(1)}k</td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="w-16 h-1 bg-white/5 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full"
              style={{ width: `${agent.agreementScore}%`, background: agent.agreementScore > 70 ? '#00ff9d' : agent.agreementScore > 50 ? '#fbbf24' : '#f87171' }}
            />
          </div>
          <span className="text-xs font-mono-jetbrains text-gray-400">{agent.agreementScore}%</span>
        </div>
      </td>
      <td className="px-4 py-3 text-sm font-mono-jetbrains text-gray-300">{agent.latency}ms</td>
    </tr>
  );
}

export function AnalyticsView({ agents, meeting, totalTokens }: AnalyticsProps) {
  const totalMessages = agents.reduce((s, a) => s + a.messageCount, 0);
  const avgLatency = Math.round(agents.reduce((s, a) => s + a.latency, 0) / agents.length);
  const avgAgreement = Math.round(agents.reduce((s, a) => s + a.agreementScore, 0) / agents.length);
  const decisionsAccepted = meeting.decisions.filter(d => d.status === 'accepted').length;

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6">
      <div>
        <div className="font-orbitron text-2xl font-bold text-cyan-400 glow-cyan tracking-wide">ANALYTICS</div>
        <div className="text-sm text-gray-500 font-mono-jetbrains mt-1">Session performance metrics</div>
      </div>

      {/* KPI row */}
      <div data-tour="analytics-kpis" className="grid grid-cols-4 gap-4">
        {[
          { label: 'TOTAL MESSAGES', value: totalMessages, color: '#00f5ff' },
          { label: 'TOTAL TOKENS', value: `${(totalTokens / 1000).toFixed(1)}k`, color: '#a855f7' },
          { label: 'AVG AGREEMENT', value: `${avgAgreement}%`, color: '#00ff9d' },
          { label: 'DECISIONS MADE', value: `${decisionsAccepted}/${meeting.decisions.length}`, color: '#f59e0b' },
        ].map(kpi => (
          <div key={kpi.label} className="hex-corner glass-panel p-4">
            <div className="text-xs font-mono-jetbrains text-gray-600 tracking-widest mb-2">{kpi.label}</div>
            <div className="font-orbitron text-2xl font-bold" style={{ color: kpi.color }}>{kpi.value}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Participation chart */}
        <div className="hex-corner glass-panel p-5">
          <div className="text-xs font-orbitron text-gray-500 tracking-widest mb-4">PARTICIPATION DISTRIBUTION</div>
          <div className="space-y-3">
            {agents.map(agent => (
              <RadarBar
                key={agent.id}
                label={agent.name}
                value={agent.messageCount}
                max={Math.max(...agents.map(a => a.messageCount)) || 1}
                color={agent.color}
              />
            ))}
          </div>
        </div>

        {/* Agreement map */}
        <div className="hex-corner glass-panel p-5">
          <div className="text-xs font-orbitron text-gray-500 tracking-widest mb-4">CONSENSUS PROFILE</div>
          <div className="space-y-3">
            {agents.map(agent => (
              <div key={agent.id} className="space-y-1">
                <div className="flex justify-between text-xs font-mono-jetbrains">
                  <span style={{ color: agent.color }}>{agent.name}</span>
                  <span className="text-gray-500">{agent.agreementScore}% agreement</span>
                </div>
                <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${agent.agreementScore}%`,
                      background: agent.agreementScore > 70 ? '#00ff9d' : agent.agreementScore > 50 ? '#fbbf24' : '#f87171',
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Token breakdown */}
      <div className="hex-corner glass-panel p-5">
        <div className="text-xs font-orbitron text-gray-500 tracking-widest mb-4">TOKEN CONSUMPTION</div>
        <div className="flex gap-4 items-end">
          {agents.map(agent => {
            const height = Math.max((agent.tokens / Math.max(...agents.map(a => a.tokens))) * 120, 8);
            return (
              <div key={agent.id} className="flex flex-col items-center gap-2 flex-1">
                <div className="text-xs font-mono-jetbrains text-gray-500">{(agent.tokens / 1000).toFixed(1)}k</div>
                <div
                  className="w-full rounded-t transition-all duration-700"
                  style={{
                    height: `${height}px`,
                    background: `linear-gradient(180deg, ${agent.color}, ${agent.color}44)`,
                  }}
                />
                <div className="text-xs font-orbitron text-center" style={{ color: agent.color }}>{agent.name}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Agent table */}
      <div data-tour="analytics-matrix" className="hex-corner glass-panel overflow-hidden">
        <div className="p-4 border-b border-white/5">
          <div className="text-xs font-orbitron text-gray-500 tracking-widest">AGENT PERFORMANCE MATRIX</div>
        </div>
        <table className="w-full">
          <thead>
            <tr className="border-b border-white/5">
              {['AGENT', 'MESSAGES', 'TOKENS', 'AGREEMENT', 'LATENCY'].map(h => (
                <th key={h} className="px-4 py-2 text-left text-xs font-mono-jetbrains text-gray-600 tracking-wider">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {agents.map(agent => <AgentMetricRow key={agent.id} agent={agent} />)}
          </tbody>
          <tfoot>
            <tr className="border-t border-cyan-500/20 bg-cyan-500/5">
              <td className="px-4 py-3 text-xs font-orbitron text-cyan-400 font-bold">TOTALS</td>
              <td className="px-4 py-3 text-xs font-mono-jetbrains text-gray-300">{totalMessages}</td>
              <td className="px-4 py-3 text-xs font-mono-jetbrains text-gray-300">{(totalTokens / 1000).toFixed(1)}k</td>
              <td className="px-4 py-3 text-xs font-mono-jetbrains text-gray-300">{avgAgreement}% avg</td>
              <td className="px-4 py-3 text-xs font-mono-jetbrains text-gray-300">{avgLatency}ms avg</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Decision log */}
      <div className="hex-corner glass-panel p-5">
        <div className="text-xs font-orbitron text-gray-500 tracking-widest mb-4">DECISION AUDIT LOG</div>
        {meeting.decisions.length === 0 ? (
          <div className="text-center text-gray-600 font-mono-jetbrains py-6 text-sm">NO DECISIONS RECORDED</div>
        ) : (
          <div className="space-y-3">
            {meeting.decisions.map((d, i) => (
              <div key={d.id} className="p-3 rounded border border-white/5 bg-white/[0.02]">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono-jetbrains text-gray-600">#{i + 1}</span>
                    <span
                      className="text-xs font-mono-jetbrains px-2 py-0.5 rounded"
                      style={{
                        color: d.status === 'accepted' ? '#00ff9d' : '#f87171',
                        background: d.status === 'accepted' ? '#00ff9d15' : '#f8717115',
                      }}
                    >
                      {d.status.toUpperCase()}
                    </span>
                    <span className="text-xs text-gray-500 font-mono-jetbrains">Round {d.round}</span>
                  </div>
                  <span className="text-xs font-mono-jetbrains" style={{ color: d.consensus >= 60 ? '#00ff9d' : '#f87171' }}>
                    {d.consensus}% consensus
                  </span>
                </div>
                <p className="text-sm text-gray-300 mb-2">{d.content}</p>
                <div className="flex gap-3 text-xs font-mono-jetbrains text-gray-600">
                  <span>✓ {Object.values(d.votes).filter(v => v === 'agree').length} agree</span>
                  <span>✗ {Object.values(d.votes).filter(v => v === 'disagree').length} disagree</span>
                  <span>— {Object.values(d.votes).filter(v => v === 'abstain').length} abstain</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
