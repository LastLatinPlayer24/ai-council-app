import type { AppView } from '../types';
import type { BackendHealth } from '../health';

interface SidebarProps {
  view: AppView;
  setView: (v: AppView) => void;
  agentCount: number;
  meetingStatus: string;
  health: BackendHealth;
  providersReady: string[];
  messageCount: number;
}

const navItems: { id: AppView; label: string; icon: string; badge?: string }[] = [
  { id: 'dashboard', label: 'DASHBOARD', icon: '◈' },
  { id: 'council', label: 'COUNCIL ROOM', icon: '⬡' },
  { id: 'agents', label: 'AGENTS', icon: '◎' },
  { id: 'forge', label: 'FORGE', icon: '⚒' },
  { id: 'memory', label: 'MEMORY CORE', icon: '⬢' },
  { id: 'analytics', label: 'ANALYTICS', icon: '◇' },
  { id: 'settings', label: 'SETTINGS', icon: '✦' },
];

export function Sidebar({ view, setView, agentCount, meetingStatus, health, providersReady, messageCount }: SidebarProps) {
  const backend = health.state === 'online'
    ? { status: `ONLINE${health.latencyMs !== undefined ? ` · ${health.latencyMs}ms` : ''}`, color: 'text-green-400' }
    : health.state === 'offline'
      ? { status: 'OFFLINE', color: 'text-red-400' }
      : { status: 'CHECKING…', color: 'text-gray-500' };
  const statusRows = [
    { label: 'BACKEND', ...backend, title: health.version ? `API v${health.version}` : 'GET /api/health every 60 s' },
    {
      label: 'PROVIDERS',
      status: providersReady.length ? `${providersReady.length} READY` : 'NO KEYS',
      color: providersReady.length ? 'text-cyan-400' : 'text-yellow-400',
      title: providersReady.join(', ') || 'Add an API key in Settings',
    },
    {
      label: 'SESSION',
      status: meetingStatus === 'active' ? 'LIVE' : meetingStatus === 'concluded' ? 'RESOLVED' : `${messageCount} MSGS`,
      color: meetingStatus === 'active' ? 'text-green-400' : 'text-gray-400',
      title: 'Saved in this browser',
    },
  ];
  return (
    <div className="w-64 h-full glass-panel flex flex-col border-r border-cyan-500/10 relative overflow-hidden">
      {/* Background grid */}
      <div className="absolute inset-0 grid-bg opacity-30 pointer-events-none" />
      
      {/* Logo */}
      <div className="p-6 border-b border-cyan-500/10 relative">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 relative flex items-center justify-center">
            <div className="absolute inset-0 border border-cyan-400/60 rotate-45" />
            <div className="absolute inset-1 border border-cyan-400/30 rotate-45" />
            <span className="text-cyan-400 text-sm font-bold z-10">AI</span>
          </div>
          <div>
            <div className="font-orbitron text-lg font-bold text-cyan-400 glow-cyan tracking-widest">
              COUNCIL
            </div>
            <div className="text-xs text-cyan-400/40 font-mono-jetbrains tracking-widest">
              v{__APP_VERSION__}
            </div>
          </div>
        </div>
      </div>

      {/* Status bar */}
      <div className="px-4 py-3 border-b border-cyan-500/10">
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-1.5">
            <div className={`status-dot-${meetingStatus === 'active' ? 'active' : 'idle'}`} />
            <span className="text-cyan-400/70 font-mono-jetbrains">
              {meetingStatus === 'active' ? 'SESSION LIVE' : meetingStatus === 'concluded' ? 'RESOLVED' : 'STANDBY'}
            </span>
          </div>
          <span className="text-cyan-400/40 font-mono-jetbrains">{agentCount} AGENTS</span>
        </div>
      </div>

      {/* Navigation */}
      <nav aria-label="Navegación principal" className="flex-1 p-3 space-y-1 overflow-y-auto">
        {navItems.map(item => (
          <button
            key={item.id}
            onClick={() => setView(item.id)}
            data-tour={`nav-${item.id}`}
            aria-label={`Navegar a ${item.label}`}
            aria-current={view === item.id ? 'page' : undefined}
            className={`
              w-full flex items-center gap-3 px-4 py-3 text-left transition-all duration-200 relative group
              ${view === item.id
                ? 'bg-cyan-500/10 text-cyan-400 border-l-2 border-cyan-400'
                : 'text-gray-500 hover:text-cyan-400/70 hover:bg-cyan-500/5 border-l-2 border-transparent'
              }
            `}
          >
            {/* Active indicator */}
            {view === item.id && (
              <div className="absolute right-0 top-0 bottom-0 w-px bg-gradient-to-b from-transparent via-cyan-400/60 to-transparent" />
            )}
            
            <span className={`text-base ${view === item.id ? 'text-cyan-400' : 'text-gray-600 group-hover:text-cyan-400/60'}`}>
              {item.icon}
            </span>
            <span className="font-orbitron text-xs font-medium tracking-widest">
              {item.label}
            </span>
            {item.id === 'council' && meetingStatus === 'active' && (
              <span className="ml-auto w-1.5 h-1.5 rounded-full bg-green-400 animate-status-blink" />
            )}
          </button>
        ))}
      </nav>

      {/* System status */}
      <div className="p-4 border-t border-cyan-500/10 space-y-2">
        <div className="text-xs text-gray-600 font-mono-jetbrains mb-2 tracking-wider">SYSTEM STATUS</div>
        {statusRows.map(s => (
          <div key={s.label} className="flex justify-between items-center" title={s.title}>
            <span className="text-xs text-gray-600 font-mono-jetbrains">{s.label}</span>
            <span className={`text-xs font-mono-jetbrains ${s.color}`}>{s.status}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
