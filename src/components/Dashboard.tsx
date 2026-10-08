import type { Agent, Meeting, AppView } from '../types';

interface DashboardProps {
  agents: Agent[];
  meeting: Meeting;
  totalTokens: number;
  avgConsensus: number;
  setView: (v: AppView) => void;
  setShowNewMeeting: (v: boolean) => void;
  isMobile?: boolean;
}

function StatCard({ label, value, unit, color, sub }: {
  label: string; value: string | number; unit?: string; color: string; sub?: string;
}) {
  return (
    <div className="hex-corner glass-panel p-4 relative overflow-hidden">
      <div className="text-xs font-mono-jetbrains text-gray-500 tracking-widest mb-1">{label}</div>
      <div className="flex items-baseline gap-1">
        <span className="font-orbitron text-2xl font-bold" style={{ color }}>{value}</span>
        {unit && <span className="text-xs text-gray-500 font-mono-jetbrains">{unit}</span>}
      </div>
      {sub && <div className="text-xs text-gray-600 mt-0.5 font-mono-jetbrains">{sub}</div>}
    </div>
  );
}

function AgentRow({ agent, onClick }: { agent: Agent; onClick: () => void }) {
  const statusColors = { active: '#00ff9d', idle: '#fbbf24', thinking: '#60a5fa', offline: '#4b5563', error: '#f87171' };
  return (
    <button onClick={onClick}
      className="w-full flex items-center gap-3 p-3 glass-panel rounded-lg text-left active:scale-98 transition-all"
      style={{ borderColor: agent.color + '22', WebkitTapHighlightColor: 'transparent' }}>
      <div className="w-10 h-10 rounded-sm flex items-center justify-center text-xl flex-shrink-0 relative"
        style={{ background: agent.color + '15', border: `1px solid ${agent.color}44` }}>
        {agent.avatar}
        <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border border-black/50"
          style={{ background: statusColors[agent.status] }} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-orbitron text-sm font-bold truncate" style={{ color: agent.color }}>{agent.name}</div>
        <div className="text-xs text-gray-500 font-mono-jetbrains truncate">{agent.role}</div>
      </div>
      <div className="text-right flex-shrink-0">
        <div className="text-xs font-mono-jetbrains" style={{ color: agent.agreementScore > 70 ? '#00ff9d' : '#fbbf24' }}>
          {agent.agreementScore}%
        </div>
        <div className="text-xs text-gray-600 font-mono-jetbrains">{agent.messageCount} msgs</div>
      </div>
    </button>
  );
}

export function Dashboard({ agents, meeting, totalTokens, avgConsensus, setView, setShowNewMeeting, isMobile }: DashboardProps) {
  const activeAgents = agents.filter(a => a.status !== 'offline');

  if (isMobile) {
    return (
      <div className="flex-1 overflow-y-auto" style={{ overscrollBehavior: 'contain' }}>
        <div className="p-4 space-y-4 pb-6">
          {/* Title */}
          <div>
            <div className="font-orbitron text-xl font-bold text-cyan-400 glow-cyan tracking-wide">MISSION CONTROL</div>
            <div className="text-xs text-gray-500 font-mono-jetbrains mt-0.5">AI Council · Session Overview</div>
          </div>

          {/* Quick actions */}
          <div className="grid grid-cols-2 gap-3">
            <button data-tour="enter-council" onClick={() => setView('council')}
              className="p-3 bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 text-sm font-orbitron tracking-wider rounded-lg hover:bg-cyan-500/20 transition-all active:scale-95"
              style={{ WebkitTapHighlightColor: 'transparent' }}>
              ENTER COUNCIL
            </button>
            <button data-tour="new-meeting" onClick={() => setShowNewMeeting(true)}
              className="p-3 bg-purple-500/10 border border-purple-500/30 text-purple-400 text-sm font-orbitron tracking-wider rounded-lg hover:bg-purple-500/20 transition-all active:scale-95"
              style={{ WebkitTapHighlightColor: 'transparent' }}>
              NEW MEETING
            </button>
          </div>

          {/* Stats 2x2 */}
          <div className="grid grid-cols-2 gap-3">
            <StatCard label="AGENTS" value={activeAgents.length} unit={`/ ${agents.length}`} color="#00f5ff" />
            <StatCard label="CONSENSUS" value={avgConsensus} unit="%" color="#00ff9d" />
            <StatCard label="TOKENS" value={`${(totalTokens / 1000).toFixed(1)}k`} color="#a855f7" />
          </div>

          {/* Active meeting */}
          <div className="hex-corner glass-panel p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-2 h-2 rounded-full bg-green-400 animate-status-blink" />
              <span className="font-orbitron text-xs font-bold text-cyan-400 tracking-wider">ACTIVE MEETING</span>
              <span className="ml-auto text-xs text-gray-600 font-mono-jetbrains">
                {meeting.currentRound}/{meeting.totalRounds}
              </span>
            </div>
            <div className="text-sm font-semibold text-white mb-1">{meeting.title}</div>
            <div className="text-xs text-gray-400 mb-3 line-clamp-2">{meeting.objective}</div>
            <div className="flex gap-1.5">
              {Array.from({ length: meeting.totalRounds }, (_, i) => (
                <div key={i} className="h-1 flex-1 rounded-full"
                  style={{ background: i < meeting.currentRound ? '#00f5ff' : '#ffffff11' }} />
              ))}
            </div>
          </div>

          {/* Agents list */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="font-orbitron text-xs text-gray-500 tracking-widest">COUNCIL MEMBERS</span>
              <button onClick={() => setView('agents')}
                className="text-xs text-cyan-400/60 font-mono-jetbrains"
                style={{ WebkitTapHighlightColor: 'transparent' }}>
                MANAGE →
              </button>
            </div>
            <div data-tour="members" className="space-y-2">
              {agents.map(agent => (
                <AgentRow key={agent.id} agent={agent} onClick={() => setView('agents')} />
              ))}
            </div>
          </div>

          {/* Decision log */}
          {meeting.decisions.length > 0 && (
            <div>
              <span className="font-orbitron text-xs text-gray-500 tracking-widest block mb-2">DECISIONS</span>
              <div className="space-y-2">
                {meeting.decisions.map((d) => (
                  <div key={d.id} className="glass-panel p-3 rounded-lg">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-mono-jetbrains px-1.5 py-0.5 rounded"
                        style={{
                          color: d.status === 'accepted' ? '#00ff9d' : '#f87171',
                          background: d.status === 'accepted' ? '#00ff9d15' : '#f8717115',
                        }}>
                        {d.status.toUpperCase()}
                      </span>
                      <span className="text-xs text-gray-600 font-mono-jetbrains">{d.consensus}%</span>
                    </div>
                    <p className="text-xs text-gray-300 line-clamp-2">{d.content}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Desktop version (original)
  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="font-orbitron text-2xl font-bold text-cyan-400 glow-cyan tracking-wide">MISSION CONTROL</div>
          <div className="text-sm text-gray-500 font-mono-jetbrains mt-1">AI Council · Session Overview</div>
        </div>
        <div className="flex gap-3">
          <button data-tour="enter-council" onClick={() => setView('council')}
            className="px-4 py-2 bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 text-sm font-orbitron tracking-wider rounded hover:bg-cyan-500/20 transition-all">
            ENTER COUNCIL
          </button>
          <button data-tour="new-meeting" onClick={() => setShowNewMeeting(true)}
            className="px-4 py-2 bg-purple-500/10 border border-purple-500/30 text-purple-400 text-sm font-orbitron tracking-wider rounded hover:bg-purple-500/20 transition-all">
            NEW MEETING
          </button>
        </div>
      </div>

      <div data-tour="stats" className="grid grid-cols-3 gap-4">
        <StatCard label="ACTIVE AGENTS" value={activeAgents.length} unit={`/ ${agents.length}`} color="#00f5ff" sub={`${agents.filter(a=>a.status==='thinking').length} thinking`} />
        <StatCard label="TOTAL TOKENS" value={(totalTokens/1000).toFixed(1)} unit="k" color="#a855f7" sub="this session" />
        <StatCard label="CONSENSUS" value={avgConsensus} unit="%" color="#00ff9d" sub={`${meeting.decisions.length} decisions`} />
      </div>

      <div className="hex-corner glass-panel p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-2 h-2 rounded-full bg-green-400 animate-status-blink" />
            <span className="font-orbitron text-sm font-bold text-cyan-400 tracking-wider">ACTIVE MEETING</span>
          </div>
          <span className="text-xs text-gray-600 font-mono-jetbrains">Round {meeting.currentRound}/{meeting.totalRounds}</span>
        </div>
        <div className="text-lg font-semibold text-white mb-1">{meeting.title}</div>
        <div className="text-sm text-gray-400 mb-4">{meeting.objective}</div>
        <div className="flex gap-2">
          {Array.from({ length: meeting.totalRounds }, (_, i) => (
            <div key={i} className="h-1.5 flex-1 rounded-full"
              style={{ background: i < meeting.currentRound ? '#00f5ff' : '#ffffff11' }} />
          ))}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <span className="font-orbitron text-xs text-gray-500 tracking-widest">COUNCIL MEMBERS</span>
            <button onClick={() => setView('agents')} className="text-xs text-cyan-400/60 hover:text-cyan-400 font-mono-jetbrains transition-colors">MANAGE →</button>
          </div>
          <div data-tour="members" className="grid grid-cols-2 gap-3">
            {agents.map(agent => (
              <AgentRow key={agent.id} agent={agent} onClick={() => setView('agents')} />
            ))}
          </div>
        </div>
        <div className="space-y-4">
          <span className="font-orbitron text-xs text-gray-500 tracking-widest">DECISION LOG</span>
          <div className="glass-panel p-4 space-y-3">
            {meeting.decisions.length === 0 ? (
              <div className="text-xs text-gray-600 font-mono-jetbrains py-4 text-center">NO DECISIONS YET</div>
            ) : meeting.decisions.map((d) => (
              <div key={d.id} className="pb-3 border-b border-white/5 last:border-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-mono-jetbrains px-1.5 py-0.5 rounded"
                    style={{ color: d.status==='accepted'?'#00ff9d':'#f87171', background: (d.status==='accepted'?'#00ff9d':'#f87171')+'15' }}>
                    {d.status.toUpperCase()} · {d.consensus}%
                  </span>
                </div>
                <p className="text-xs text-gray-300">{d.content}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
