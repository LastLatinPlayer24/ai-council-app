import { HelpButton } from '../tour/Tour';

interface TopBarProps {
  totalTokens: number;
  avgConsensus: number;
  agentCount: number;
  meetingStatus: string;
  onHelp: () => void;
}

export function TopBar({ totalTokens, avgConsensus, agentCount, meetingStatus, onHelp }: TopBarProps) {
  const now = new Date();
  const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  const dateStr = now.toLocaleDateString([], { year: 'numeric', month: '2-digit', day: '2-digit' });

  return (
    <div className="h-10 glass-panel border-b border-cyan-500/10 flex items-center px-4 gap-6 flex-shrink-0">
      {/* Left: live indicators */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1.5">
          <div className={`w-1.5 h-1.5 rounded-full ${meetingStatus === 'active' ? 'bg-green-400 animate-status-blink' : 'bg-gray-600'}`} />
          <span className="text-xs font-mono-jetbrains text-gray-500">
            {meetingStatus === 'active' ? 'LIVE SESSION' : 'STANDBY'}
          </span>
        </div>
        <div className="w-px h-3 bg-white/10" />
        <span className="text-xs font-mono-jetbrains text-gray-600">
          {agentCount} AGENTS ONLINE
        </span>
      </div>

      {/* Center: metrics */}
      <div className="flex-1 flex items-center justify-center gap-6">
        {[
          { label: 'TOKENS', value: `${(totalTokens / 1000).toFixed(1)}k`, color: '#a855f7' },
          { label: 'CONSENSUS', value: `${avgConsensus}%`, color: '#00ff9d' },
        ].map(m => (
          <div key={m.label} className="flex items-center gap-1.5">
            <span className="text-xs text-gray-600 font-mono-jetbrains">{m.label}</span>
            <span className="text-xs font-mono-jetbrains font-bold" style={{ color: m.color }}>{m.value}</span>
          </div>
        ))}
      </div>

      {/* Right: time */}
      <div className="flex items-center gap-2">
        <span className="text-xs font-mono-jetbrains text-gray-600">{dateStr}</span>
        <span className="text-xs font-mono-jetbrains text-cyan-400/60">{timeStr}</span>
        <HelpButton onClick={onHelp} className="ml-2" />
      </div>
    </div>
  );
}
