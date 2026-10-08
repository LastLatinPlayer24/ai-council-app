import type { AppView } from '../types';

interface BottomNavProps {
  view: AppView;
  setView: (v: AppView) => void;
  meetingStatus: string;
}

const navItems: { id: AppView; icon: string; label: string }[] = [
  { id: 'dashboard', icon: '◈', label: 'Home' },
  { id: 'council',   icon: '⬡', label: 'Council' },
  { id: 'agents',    icon: '◎', label: 'Agents' },
  { id: 'forge',     icon: '⚒', label: 'Forge' },
  { id: 'settings',  icon: '✦', label: 'Settings' },
];

export function BottomNav({ view, setView, meetingStatus }: BottomNavProps) {
  return (
    <nav aria-label="Navegación principal móvil" className="glass-panel border-t border-cyan-500/10 flex-shrink-0"
      style={{ paddingBottom: 'max(8px, env(safe-area-inset-bottom))' }}
    >
      <div className="flex">
        {navItems.map(item => {
          const isActive = view === item.id;
          const isLive = item.id === 'council' && meetingStatus === 'active';
          return (
            <button
              key={item.id}
              onClick={() => setView(item.id)}
              data-tour={`nav-${item.id}`}
              aria-label={`Navegar a ${item.label}`}
              aria-current={isActive ? 'page' : undefined}
              className="flex-1 flex flex-col items-center justify-center py-2.5 gap-1 relative transition-all active:scale-95"
              style={{ WebkitTapHighlightColor: 'transparent' }}
            >
              {/* Active bg pill */}
              {isActive && (
                <div
                  className="absolute inset-x-2 inset-y-1 rounded-lg"
                  style={{ background: 'rgba(0,245,255,0.08)' }}
                />
              )}

              {/* Live indicator dot */}
              {isLive && (
                <div className="absolute top-2 right-1/2 translate-x-3 w-1.5 h-1.5 rounded-full bg-green-400 animate-status-blink" />
              )}

              <span
                className="text-lg leading-none relative z-10"
                style={{ color: isActive ? '#00f5ff' : '#4b5563' }}
              >
                {item.icon}
              </span>
              <span
                className="text-xs font-mono-jetbrains relative z-10 tracking-wide"
                style={{
                  fontSize: '9px',
                  color: isActive ? '#00f5ff' : '#4b5563',
                  fontWeight: isActive ? '700' : '400',
                }}
              >
                {item.label.toUpperCase()}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
