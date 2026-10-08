import { useEffect, useRef, useState } from 'react';
import { Sidebar } from './components/Sidebar';
import { BottomNav } from './components/BottomNav';
import { TopBar } from './components/TopBar';
import { Dashboard } from './components/Dashboard';
import { CouncilRoom } from './components/CouncilRoom';
import { AgentsView } from './components/AgentsView';
import { AnalyticsView } from './components/AnalyticsView';
import { MemoryView, SettingsView } from './components/MemoryAndSettings';
import { useAppState } from './store';
import { ForgeView } from './forge/ForgeView';
import { NewMeetingModal } from './components/NewMeetingModal';
import { checkBackend, useBackendHealth } from './health';
import { HelpButton, Tour } from './tour/Tour';
import { useTour } from './tour/useTour';

interface BootLine { text: string; ok: boolean }

interface BootProps {
  agentCount: number;
  providersReady: string[];
  restoredMessages: number;
  onDone: () => void;
}

/** Startup checks — every line reflects something real, nothing decorative. */
function BootScreen({ agentCount, providersReady, restoredMessages, onDone }: BootProps) {
  const [lines, setLines] = useState<BootLine[]>([]);
  const [pending, setPending] = useState('CHECKING BACKEND…');
  // The checks must run exactly once on mount, independent of whether the
  // parent re-renders with new props — refs keep the latest values.
  const latest = useRef({ agentCount, providersReady, restoredMessages, onDone });
  useEffect(() => {
    latest.current = { agentCount, providersReady, restoredMessages, onDone };
  });

  useEffect(() => {
    let alive = true;
    const pause = (ms: number) => new Promise(r => setTimeout(r, ms));
    (async () => {
      const started = performance.now();
      const health = await checkBackend(3500);
      // keep the screen readable even when the backend answers instantly
      await pause(Math.max(0, 350 - (performance.now() - started)));
      if (!alive) return;
      const { agentCount: n, providersReady: ready, restoredMessages: restored } = latest.current;
      const steps: BootLine[] = [
        health.state === 'online'
          ? { ok: true, text: `BACKEND ONLINE${health.version ? ` · v${health.version}` : ''}${health.latencyMs !== undefined ? ` · ${health.latencyMs}ms` : ''}` }
          : { ok: false, text: 'BACKEND OFFLINE — agents cannot answer until it runs' },
        ready.length
          ? { ok: true, text: `PROVIDERS READY · ${ready.join(', ').toUpperCase()}` }
          : { ok: false, text: 'NO API KEYS YET — ADD ONE IN SETTINGS' },
        { ok: true, text: `${n} AGENT${n === 1 ? '' : 'S'} LOADED` },
        restored
          ? { ok: true, text: `SESSION RESTORED · ${restored} MESSAGES` }
          : { ok: true, text: 'NEW SESSION' },
      ];
      for (const step of steps) {
        if (!alive) return;
        setLines(prev => [...prev, step]);
        setPending('');
        await pause(220);
      }
      setPending('COUNCIL READY.');
      await pause(450);
      if (alive) latest.current.onDone();
    })();
    return () => { alive = false; };
  }, []);

  const total = 5;
  const progress = Math.min(1, (lines.length + (pending === 'COUNCIL READY.' ? 1 : 0)) / total);

  return (
    <div className="fixed inset-0 bg-[#070d14] flex flex-col items-center justify-center z-50 px-6" onClick={onDone}>
      <div className="grid-bg absolute inset-0 opacity-20" />

      <div className="relative mb-10">
        <div className="w-20 h-20 md:w-24 md:h-24 relative flex items-center justify-center">
          <div className="absolute inset-0 border-2 border-cyan-400/30 rotate-45 animate-spin" style={{ animationDuration: '8s' }} />
          <div className="absolute inset-3 border border-cyan-400/20 rotate-45 animate-spin" style={{ animationDuration: '4s', animationDirection: 'reverse' }} />
          <div className="font-orbitron text-xl md:text-2xl font-black text-cyan-400 glow-cyan z-10">AI</div>
        </div>
        <div className="text-center mt-4">
          <div className="font-orbitron text-2xl md:text-3xl font-bold text-cyan-400 glow-cyan tracking-widest">COUNCIL</div>
          <div className="text-xs text-cyan-400/40 font-mono-jetbrains tracking-widest mt-1">MULTI-AGENT INTELLIGENCE PLATFORM</div>
        </div>
      </div>

      <div className="w-full max-w-sm space-y-2">
        {lines.map((s, i) => (
          <div key={i} className="flex items-center gap-2 animate-float-up">
            <span className={`text-xs flex-shrink-0 ${s.ok ? 'text-green-400' : 'text-yellow-400'}`}>{s.ok ? '✓' : '!'}</span>
            <span className={`text-xs font-mono-jetbrains ${s.ok ? 'text-gray-400' : 'text-yellow-300/80'}`}>{s.text}</span>
          </div>
        ))}
        {pending && (
          <div className="flex items-center gap-2">
            <span className="text-cyan-400 text-xs animate-status-blink flex-shrink-0">▶</span>
            <span className="text-xs font-mono-jetbrains text-cyan-400 typing-text">{pending}</span>
          </div>
        )}
      </div>

      <div className="w-full max-w-sm mt-8 h-px bg-white/5 rounded-full overflow-hidden">
        <div className="h-full bg-cyan-400 rounded-full transition-all duration-300" style={{ width: `${progress * 100}%` }} />
      </div>
    </div>
  );
}

export default function App() {
  const [booting, setBooting] = useState(true);
  // Detect mobile
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 768);

  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  const {
    view, setView,
    agents,
    meeting,
    showNewAgent, setShowNewAgent,
    setShowNewMeeting,
    userInput, setUserInput,
    sendUserMessage,
    triggerRound,
    proposeDecision,
    addAgent,
    updateAgent,
    totalTokens,
    avgConsensus,
    providerConfigs,
    saveProviderConfig,
    history,
    busy,
    restoredSession,
    showNewMeeting,
    activeAgents,
    suggestProposal,
    concludeMeeting,
    startMeeting,
    stopAll,
    downloadMarkdown,
    removeFromHistory,
  } = useAppState();
  const health = useBackendHealth();
  const providersReady = Object.values(providerConfigs)
    .filter(c => c.apiKeys.length > 0)
    .map(c => c.name);
  // What the status lights show: LIVE only while agents are actually answering.
  const sessionState = busy ? 'active' : meeting.status === 'concluded' ? 'concluded' : 'idle';
  const debateCount = meeting.messages.filter(m => m.type === 'message').length;
  const tour = useTour(view, !booting);

  if (booting) {
    return (
      <BootScreen agentCount={agents.length} providersReady={providersReady}
        restoredMessages={restoredSession ? debateCount : 0} onDone={() => setBooting(false)} />
    );
  }

  // Skip link for accessibility
  const skipLink = (
    <a href="#main-content" className="skip-link">
      Saltar al contenido principal
    </a>
  );

  const mainContent = (
    <>
      {view === 'dashboard' && (
        <Dashboard agents={agents} meeting={meeting} totalTokens={totalTokens}
          avgConsensus={avgConsensus} setView={setView}
          setShowNewMeeting={setShowNewMeeting} isMobile={isMobile} />
      )}
      {view === 'council' && (
        <CouncilRoom agents={agents} meeting={meeting} userInput={userInput}
          setUserInput={setUserInput} sendUserMessage={sendUserMessage}
          triggerRound={triggerRound} proposeDecision={proposeDecision}
          suggestProposal={suggestProposal} concludeMeeting={concludeMeeting}
          stopAll={stopAll} downloadMarkdown={() => downloadMarkdown()} busy={busy}
          isMobile={isMobile} />
      )}
      {view === 'agents' && (
        <AgentsView agents={agents} onAddAgent={addAgent}
          showNewAgent={showNewAgent} setShowNewAgent={setShowNewAgent}
          providerConfigs={providerConfigs} />
      )}
      {view === 'forge' && (
        <ForgeView agents={agents} onUpdateAgent={updateAgent} isMobile={isMobile} />
      )}
      {view === 'memory' && (
        <MemoryView agents={agents} meeting={meeting} history={history}
          onExport={m => downloadMarkdown(m)} onDelete={removeFromHistory} />
      )}
      {view === 'analytics' && (
        <AnalyticsView agents={agents} meeting={meeting}
          totalTokens={totalTokens} />
      )}
      {view === 'settings' && <SettingsView providerConfigs={providerConfigs} onSaveConfig={saveProviderConfig} />}
      {showNewMeeting && (
        <NewMeetingModal agents={agents} activeAgents={activeAgents}
          hasCurrent={debateCount > 0}
          onStart={input => { void startMeeting(input); }}
          onClose={() => setShowNewMeeting(false)} />
      )}
    </>
  );

  const tourLayer = tour.active && (
    <Tour key={tour.active.ids.join()} steps={tour.active.steps} onClose={tour.close} />
  );

  // ── MOBILE LAYOUT ──────────────────────────────────────────────────────────
  if (isMobile) {
    return (
      <>
        {skipLink}
        <div className="flex flex-col bg-[#070d14] overflow-hidden"
          style={{ height: '100dvh' }}>
          {/* Mobile top bar */}
          <header role="banner" className="flex items-center justify-between px-4 py-3 border-b border-cyan-500/10 glass-panel flex-shrink-0"
            style={{ paddingTop: 'max(12px, env(safe-area-inset-top))' }}>
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 relative flex items-center justify-center flex-shrink-0">
                <div className="absolute inset-0 border border-cyan-400/50 rotate-45" />
                <span className="font-orbitron text-xs font-bold text-cyan-400 z-10" style={{ fontSize: '8px' }}>AI</span>
              </div>
              <span className="font-orbitron text-sm font-bold text-cyan-400 tracking-widest">COUNCIL</span>
            </div>
            <div className="flex items-center gap-3 text-xs font-mono-jetbrains">
              <div className="flex items-center gap-1">
                <div className={`w-1.5 h-1.5 rounded-full ${sessionState === 'active' ? 'bg-green-400 animate-status-blink' : health.state === 'offline' ? 'bg-red-400' : 'bg-gray-600'}`} />
                <span className="text-gray-500">{agents.filter(a => a.status !== 'offline').length} online</span>
              </div>
              <span style={{ color: '#00ff9d' }}>{avgConsensus}%</span>
              <HelpButton onClick={tour.replay} />
            </div>
          </header>

          {/* Content area */}
          <main id="main-content" role="main" className="flex-1 overflow-hidden">
            {mainContent}
          </main>

          {/* Bottom navigation */}
          <nav role="navigation" aria-label="Navegación principal" className="bottom-nav-safe">
            <BottomNav view={view} setView={setView} meetingStatus={sessionState} />
          </nav>
        </div>
        {tourLayer}
      </>
    );
  }

  // ── DESKTOP LAYOUT ─────────────────────────────────────────────────────────
  return (
    <>
      {skipLink}
      <div className="flex h-screen bg-[#070d14] overflow-hidden">
        <nav role="navigation" aria-label="Navegación principal" className="w-64">
          <Sidebar view={view} setView={setView}
            agentCount={agents.length} meetingStatus={sessionState}
            health={health} providersReady={providersReady} messageCount={debateCount} />
        </nav>
        <div className="flex-1 flex flex-col overflow-hidden">
          <header role="banner">
            <TopBar totalTokens={totalTokens}
              avgConsensus={avgConsensus}
              agentCount={agents.filter(a => a.status !== 'offline').length}
              meetingStatus={sessionState} onHelp={tour.replay} />
          </header>
          <main id="main-content" role="main" className="flex-1 flex flex-col overflow-hidden">
            {mainContent}
          </main>
        </div>
      </div>
      {tourLayer}
    </>
  );
}
