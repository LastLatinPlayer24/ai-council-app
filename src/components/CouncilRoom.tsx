import { useState, useRef, useEffect } from 'react';
import type { Agent, Meeting, Message, Decision } from '../types';
import { AgentGraph } from './AgentGraph';
import { Markdown } from './Markdown';

interface CouncilRoomProps {
  agents: Agent[];
  meeting: Meeting;
  userInput: string;
  setUserInput: (v: string) => void;
  sendUserMessage: (msg: string) => void;
  triggerRound: () => void;
  proposeDecision: (content: string) => void;
  suggestProposal: () => Promise<string | null>;
  concludeMeeting: () => void;
  stopAll: () => void;
  downloadMarkdown: () => void;
  busy: null | 'round' | 'vote' | 'synthesis' | 'proposal';
  isMobile?: boolean;
}

const BUSY_LABEL = { round: 'DEBATING', vote: 'VOTING', synthesis: 'CHAIRMAN WRITING', proposal: 'DRAFTING' } as const;

type LayoutMode = 'chat' | 'graph' | 'split';

function AgentOrb({ agent, size = 32 }: { agent: Agent; size?: number }) {
  const statusColors = { active: '#00ff9d', idle: '#fbbf24', thinking: '#60a5fa', offline: '#4b5563', error: '#f87171' };
  return (
    <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
      <div className="w-full h-full flex items-center justify-center rounded-sm relative overflow-hidden"
        style={{ background: `linear-gradient(135deg,${agent.color}22,${agent.color}08)`, border:`1px solid ${agent.color}44` }}>
        <span style={{ fontSize: size * 0.45 }}>{agent.avatar}</span>
        {agent.status === 'thinking' && (
          <div className="absolute inset-0 border border-blue-400/50 rounded-sm animate-ping opacity-30" />
        )}
      </div>
      <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border border-black/50"
        style={{ background: statusColors[agent.status] + '99' }} />
    </div>
  );
}

function MessageBubble({ message, agents, compact, decision }: { message: Message; agents: Agent[]; compact?: boolean; decision?: Decision }) {
  const isSystem = message.agentId === 'system';
  const isUser   = message.agentId === 'user';
  const agent    = agents.find(a => a.id === message.agentId);

  if (message.type === 'decision') {
    return (
      <div className="mx-3 my-2 p-3 rounded border border-green-500/20 bg-green-500/5">
        <div className="text-xs font-mono-jetbrains text-green-400 mb-1">✓ DECISION RECORDED</div>
        <p className="text-xs text-gray-300 whitespace-pre-line">{decision?.reasons ? message.content.split('\n')[0] : message.content}</p>
        {decision?.reasons && (
          <ul className="mt-2 space-y-1">
            {Object.entries(decision.votes).map(([id, v]) => {
              const who = agents.find(a => a.id === id);
              return (
                <li key={id} className="text-[11px] text-gray-400 flex gap-1.5">
                  <span className={v === 'agree' ? 'text-green-400' : v === 'disagree' ? 'text-red-400' : 'text-yellow-400'}>
                    {v === 'agree' ? '✓' : v === 'disagree' ? '✗' : '—'}
                  </span>
                  <span className="font-orbitron font-bold" style={{ color: who?.color }}>{who?.name ?? id}</span>
                  <span className="text-gray-500">{decision.reasons?.[id]}</span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    );
  }
  if (isSystem) {
    return (
      <div className="flex justify-center py-1.5">
        <div className="px-3 py-1.5 rounded text-xs font-mono-jetbrains text-cyan-400/60 bg-cyan-500/5 border border-cyan-500/10">
          ⬡ {message.content}
        </div>
      </div>
    );
  }
  if (message.type === 'synthesis') {
    return (
      <div className="mx-3 my-3 rounded-lg border border-cyan-400/30 bg-cyan-500/[0.04] overflow-hidden" data-tour="synthesis">
        <div className="px-4 py-2 border-b border-cyan-400/20 flex items-center gap-2 bg-cyan-500/[0.06]">
          <span className="text-cyan-300">⚑</span>
          <span className="font-orbitron text-xs font-bold tracking-widest text-cyan-300">COUNCIL RESOLUTION</span>
          <span className="ml-auto text-xs font-mono-jetbrains text-gray-500">chaired by {message.agentName}</span>
        </div>
        <div className="px-4 py-3 text-sm text-gray-200 leading-relaxed">
          <Markdown text={message.content} />
          {message.isStreaming && <span className="typing-text inline-block">&nbsp;</span>}
        </div>
      </div>
    );
  }

  const orbSize = compact ? 26 : 32;

  return (
    <div className={`flex gap-2.5 ${compact ? 'px-3 py-2' : 'px-4 py-3'} msg-bubble hover:bg-white/[0.02] transition-colors ${isUser ? 'flex-row-reverse' : ''}`}>
      {isUser ? (
        <div className="flex-shrink-0 rounded-sm bg-white/10 border border-white/20 flex items-center justify-center"
          style={{ width: orbSize, height: orbSize, fontSize: orbSize * 0.45 }}>
          👤
        </div>
      ) : agent ? <AgentOrb agent={agent} size={orbSize} /> : null}

      <div className={`flex-1 min-w-0 flex flex-col ${isUser ? 'items-end' : ''}`}>
        <div className={`flex items-center gap-1.5 mb-1 ${isUser ? 'flex-row-reverse' : ''}`}>
          <span className="text-xs font-orbitron font-bold"
            style={{ color: isUser ? '#ffffff' : (agent?.color || '#00f5ff') }}>
            {message.agentName}
          </span>
          {message.confidence !== undefined && (
            <span className="text-xs font-mono-jetbrains px-1 py-0.5 rounded"
              style={{
                fontSize: '9px',
                color: message.confidence > 80 ? '#00ff9d' : message.confidence > 60 ? '#fbbf24' : '#f87171',
                background: (message.confidence > 80 ? '#00ff9d' : message.confidence > 60 ? '#fbbf24' : '#f87171') + '15',
              }}>
              {message.confidence}%
            </span>
          )}
          <span className="text-xs text-gray-700 font-mono-jetbrains ml-auto" style={{ fontSize: '9px' }}>
            {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
        <div className="max-w-xs md:max-w-2xl p-2.5 rounded text-sm text-gray-200 leading-relaxed"
          style={{
            background: isUser ? 'rgba(255,255,255,0.07)' : (agent ? agent.color + '0a' : '#ffffff0a'),
            border: `1px solid ${isUser ? 'rgba(255,255,255,0.1)' : (agent ? agent.color + '22' : '#ffffff22')}`,
            fontSize: compact ? '13px' : '14px',
          }}>
          {isUser ? <span className="whitespace-pre-wrap">{message.content}</span> : <Markdown text={message.content} accent={agent?.color} />}
          {message.isStreaming && <span className="typing-text inline-block">&nbsp;</span>}
        </div>
      </div>
    </div>
  );
}

function VoteBar({ decisions }: { decisions: Decision[] }) {
  if (decisions.length === 0) return null;
  const latest = decisions[decisions.length - 1];
  const votes = Object.values(latest.votes) as string[];
  const agree = votes.filter(v => v === 'agree').length;
  const disagree = votes.filter(v => v === 'disagree').length;
  const abstain = votes.filter(v => v === 'abstain').length;
  return (
    <div className="border-t border-cyan-500/10 px-4 py-2 flex items-center gap-3 flex-shrink-0">
      <span className="text-xs font-orbitron text-gray-600 tracking-widest">VOTE</span>
      <div className="flex gap-2 text-xs font-mono-jetbrains">
        <span className="text-green-400">✓{agree}</span>
        <span className="text-red-400">✗{disagree}</span>
        <span className="text-yellow-400">—{abstain}</span>
      </div>
      <div className="flex-1 h-1 bg-white/5 rounded-full overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${latest.consensus}%`, background: latest.consensus >= 60 ? '#00ff9d' : '#f87171' }} />
      </div>
      <span className="text-xs font-mono-jetbrains flex-shrink-0"
        style={{ color: latest.consensus >= 60 ? '#00ff9d' : '#f87171' }}>
        {latest.consensus}%
      </span>
    </div>
  );
}

export function CouncilRoom({
  agents, meeting, userInput, setUserInput, sendUserMessage, triggerRound, proposeDecision,
  suggestProposal, concludeMeeting, stopAll, downloadMarkdown, busy, isMobile,
}: CouncilRoomProps) {
  const scrollRef       = useRef<HTMLDivElement>(null);
  const inputRef        = useRef<HTMLTextAreaElement>(null);
  const [decisionInput, setDecisionInput]       = useState('');
  const [showDecisionInput, setShowDecisionInput] = useState(false);
  const [layout, setLayout] = useState<LayoutMode>(isMobile ? 'chat' : 'split');
  const thinkingAgents = agents.filter(a => a.status === 'thinking');

  useEffect(() => {
    // Scroll only the chat list: scrollIntoView would also scroll the
    // overflow-hidden ancestors and push the room header off screen.
    const el = scrollRef.current;
    if (layout !== 'graph' && el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [meeting.messages, layout]);

  // On mobile, force chat-only unless user switches to graph
  useEffect(() => {
    if (isMobile && layout === 'split') {
      const t = setTimeout(() => setLayout('chat'), 0);
      return () => clearTimeout(t);
    }
  }, [isMobile, layout]);

  const handleSend = () => {
    if (userInput.trim()) {
      sendUserMessage(userInput);
      inputRef.current?.blur(); // dismiss keyboard after send on iOS
    }
  };
  const handlePropose = () => {
    if (decisionInput.trim()) { proposeDecision(decisionInput); setDecisionInput(''); setShowDecisionInput(false); }
  };
  const handleSuggest = async () => {
    const text = await suggestProposal();
    if (text) setDecisionInput(text);
  };
  const hasDebate = meeting.messages.some(m => m.type === 'message' && m.content.trim() !== '');
  const btn = 'disabled:opacity-30 disabled:cursor-not-allowed';

  // ── Mobile header ──────────────────────────────────────────────────────────
  const mobileHeader = (
    <div className="glass-panel border-b border-cyan-500/10 px-4 py-2.5 flex items-center justify-between flex-shrink-0">
      <div>
        <div className="font-orbitron text-xs font-bold text-cyan-400 tracking-wider">{meeting.title}</div>
        <div className="text-xs text-gray-600 font-mono-jetbrains" style={{ fontSize: '9px' }}>
          Round {meeting.currentRound}/{meeting.totalRounds} · {meeting.messages.length} msgs
        </div>
      </div>
      <div className="flex gap-1.5 items-center">
        {/* Chat / Graph toggle on mobile */}
        <div data-tour="layout" className="flex rounded border border-cyan-500/20 overflow-hidden">
          {([{ id: 'chat', icon: '≡' }, { id: 'graph', icon: '◎' }] as { id: LayoutMode; icon: string }[]).map(m => (
            <button key={m.id} onClick={() => setLayout(m.id)}
              className={`px-2.5 py-1.5 text-sm transition-all ${layout === m.id ? 'bg-cyan-500/20 text-cyan-400' : 'text-gray-600'}`}
              style={{ WebkitTapHighlightColor: 'transparent' }}>
              {m.icon}
            </button>
          ))}
        </div>
        {busy ? (
          <button onClick={stopAll} aria-label="Detener"
            className="px-2.5 py-1.5 text-xs font-orbitron text-red-400 border border-red-500/30 bg-red-500/10 rounded"
            style={{ WebkitTapHighlightColor: 'transparent' }}>
            ■
          </button>
        ) : (
          <button data-tour="next-round" onClick={triggerRound} disabled={!hasDebate}
            className={`px-2.5 py-1.5 text-xs font-orbitron text-cyan-400 border border-cyan-500/30 bg-cyan-500/10 rounded ${btn}`}
            style={{ WebkitTapHighlightColor: 'transparent' }}>
            +RND
          </button>
        )}
        <button data-tour="vote" onClick={() => setShowDecisionInput(!showDecisionInput)} disabled={!!busy}
          className={`px-2.5 py-1.5 text-xs font-orbitron text-purple-400 border border-purple-500/30 bg-purple-500/10 rounded ${btn}`}
          style={{ WebkitTapHighlightColor: 'transparent' }}>
          VOTE
        </button>
        <button data-tour="conclude" onClick={concludeMeeting} disabled={!!busy || !hasDebate} aria-label="Concluir"
          className={`px-2.5 py-1.5 text-xs font-orbitron text-emerald-300 border border-emerald-400/30 bg-emerald-500/10 rounded ${btn}`}
          style={{ WebkitTapHighlightColor: 'transparent' }}>
          ⚑
        </button>
      </div>
    </div>
  );

  // ── Desktop header ─────────────────────────────────────────────────────────
  const desktopHeader = (
    <div className="glass-panel border-b border-cyan-500/10 px-5 py-2.5 flex items-center justify-between flex-shrink-0">
      <div className="flex items-center gap-4">
        <div className="w-2 h-2 rounded-full bg-green-400 animate-status-blink" />
        <div>
          <div className="font-orbitron text-sm font-bold text-cyan-400 tracking-wider">{meeting.title}</div>
          <div className="text-xs text-gray-600 font-mono-jetbrains">Round {meeting.currentRound}/{meeting.totalRounds} · {meeting.messages.length} messages</div>
        </div>
        <div className="hidden md:flex gap-1 ml-2">
          {Array.from({ length: meeting.totalRounds }, (_, i) => (
            <div key={i} className="h-1 w-8 rounded-full" style={{ background: i < meeting.currentRound ? '#00f5ff' : '#ffffff11' }} />
          ))}
        </div>
      </div>
      <div className="flex gap-2 items-center">
        <div data-tour="layout" className="flex rounded border border-cyan-500/20 overflow-hidden">
          {([{ id:'chat', icon:'≡', label:'CHAT' }, { id:'split', icon:'⊟', label:'SPLIT' }, { id:'graph', icon:'◎', label:'GRAPH' }] as {id:LayoutMode;icon:string;label:string}[]).map(m => (
            <button key={m.id} onClick={() => setLayout(m.id)}
              className={`px-3 py-1.5 text-xs font-mono-jetbrains transition-all ${layout===m.id ? 'bg-cyan-500/20 text-cyan-400' : 'text-gray-600 hover:text-gray-400 hover:bg-white/5'}`}
              title={m.label}>
              {m.icon}
            </button>
          ))}
        </div>
        {busy && (
          <span className="flex items-center gap-1.5 text-xs font-mono-jetbrains text-cyan-400/80">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-status-blink" />{BUSY_LABEL[busy]}
          </span>
        )}
        {busy ? (
          <button onClick={stopAll} className="px-3 py-1.5 text-xs font-orbitron tracking-wider text-red-400 border border-red-500/30 bg-red-500/10 hover:bg-red-500/20 rounded transition-all">■ STOP</button>
        ) : (
          <button data-tour="next-round" onClick={triggerRound} disabled={!hasDebate} className={`px-3 py-1.5 text-xs font-orbitron tracking-wider text-cyan-400 border border-cyan-500/30 bg-cyan-500/10 hover:bg-cyan-500/20 rounded transition-all ${btn}`}>NEXT ROUND</button>
        )}
        <button data-tour="vote" onClick={() => setShowDecisionInput(!showDecisionInput)} disabled={!!busy} className={`px-3 py-1.5 text-xs font-orbitron tracking-wider text-purple-400 border border-purple-500/30 bg-purple-500/10 hover:bg-purple-500/20 rounded transition-all ${btn}`}>VOTE</button>
        <button data-tour="conclude" onClick={concludeMeeting} disabled={!!busy || !hasDebate} title="The chairman writes the resolution" className={`px-3 py-1.5 text-xs font-orbitron tracking-wider text-emerald-300 border border-emerald-400/30 bg-emerald-500/10 hover:bg-emerald-500/20 rounded transition-all ${btn}`}>⚑ CONCLUDE</button>
        <button data-tour="export" onClick={downloadMarkdown} disabled={!hasDebate} title="Download the session as Markdown" className={`px-2.5 py-1.5 text-xs font-mono-jetbrains text-gray-400 border border-white/10 hover:border-white/30 rounded transition-all ${btn}`}>⬇ .md</button>
      </div>
    </div>
  );

  // ── Chat panel ─────────────────────────────────────────────────────────────
  const chatPanel = (
    <div className={`flex flex-col overflow-hidden ${!isMobile && layout === 'split' ? 'w-1/2 border-r border-cyan-500/10' : 'flex-1'}`}>
      <div ref={scrollRef} className="flex-1 overflow-y-auto py-1" style={{ overscrollBehavior: 'contain' }}>
        {meeting.messages.length === 0 && (
          <div className="h-full flex items-center justify-center p-6">
            <div className="max-w-md text-center space-y-3">
              <div className="text-3xl">⬡</div>
              <div className="font-orbitron text-sm text-cyan-400 tracking-widest">THE COUNCIL IS LISTENING</div>
              <p className="text-sm text-gray-400 leading-relaxed">
                Ask a question or describe a decision. Every agent answers from its own role, then
                <span className="text-cyan-300"> NEXT ROUND</span> makes them rebut each other,
                <span className="text-purple-300"> VOTE</span> puts a proposal to the vote and
                <span className="text-emerald-300"> ⚑ CONCLUDE</span> has the chairman write the resolution.
              </p>
            </div>
          </div>
        )}
        {meeting.messages.map(msg => (
          <MessageBubble key={msg.id} message={msg} agents={agents} compact={isMobile}
            decision={msg.type === 'decision' ? meeting.decisions.find(d => msg.referencedIds?.includes(d.id)) : undefined} />
        ))}
        {thinkingAgents.map(agent => (
          <div key={agent.id} className="flex gap-2.5 px-4 py-2 items-center">
            <AgentOrb agent={agent} size={isMobile ? 26 : 32} />
            <div className="flex gap-1 items-center px-3 py-2 rounded"
              style={{ background: agent.color + '0a', border: `1px solid ${agent.color}22` }}>
              {[0,1,2].map(i => (
                <div key={i} className="w-1.5 h-1.5 rounded-full"
                  style={{ background: agent.color, animation: `status-blink 0.8s ease-in-out ${i*0.2}s infinite` }} />
              ))}
              <span className="text-xs text-gray-600 font-mono-jetbrains ml-2" style={{ fontSize: '10px' }}>
                {agent.name} thinking...
              </span>
            </div>
          </div>
        ))}
      </div>

      <VoteBar decisions={meeting.decisions} />

      {/* Input */}
      <div className="glass-panel border-t border-cyan-500/10 p-3 flex-shrink-0"
        style={{ paddingBottom: isMobile ? 'max(12px, env(safe-area-inset-bottom, 12px))' : undefined }}>
        <div data-tour="council-input" className="flex gap-2 items-end">
          <textarea
            ref={inputRef}
            value={userInput}
            onChange={e => setUserInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
            placeholder={isMobile ? 'Address the council...' : 'Address the council... (Enter to send)'}
            rows={isMobile ? 1 : 2}
            className="flex-1 bg-white/5 border border-cyan-500/20 rounded-lg px-3 py-2.5 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-cyan-400/40 resize-none font-mono-jetbrains"
            style={{ fontSize: '16px' /* prevents iOS zoom */ }}
          />
          <button onClick={handleSend} disabled={!userInput.trim() || !!busy}
            className="px-4 py-2.5 bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 text-xs font-orbitron tracking-wider rounded-lg hover:bg-cyan-500/20 transition-all disabled:opacity-30 disabled:cursor-not-allowed flex-shrink-0"
            style={{ WebkitTapHighlightColor: 'transparent' }}>
            {isMobile ? '▶' : 'SEND'}
          </button>
        </div>
      </div>
    </div>
  );

  // ── Graph panel ────────────────────────────────────────────────────────────
  const graphPanel = (
    <div className={`flex flex-col overflow-hidden ${!isMobile && layout === 'split' ? 'w-1/2' : 'flex-1'}`}>
      <AgentGraph agents={agents} messages={meeting.messages}
        currentRound={meeting.currentRound} />
    </div>
  );

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {isMobile ? mobileHeader : desktopHeader}

      {showDecisionInput && (
        <div className="border-b border-purple-500/20 p-3 bg-purple-500/5 flex-shrink-0">
          <div className="flex gap-2">
            <input value={decisionInput} onChange={e => setDecisionInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handlePropose()}
              placeholder="Decision to vote on..."
              className="flex-1 bg-transparent border border-purple-500/30 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-purple-400/60 font-mono-jetbrains"
              style={{ fontSize: '16px' }} />
            <button onClick={handleSuggest} disabled={!!busy || !hasDebate} title="An agent drafts a proposal from the debate"
              className={`px-3 py-2 border border-purple-500/30 text-purple-300 text-xs font-orbitron tracking-wider rounded-lg ${btn}`}
              style={{ WebkitTapHighlightColor: 'transparent' }}>
              {busy === 'proposal' ? '…' : '✨'}
            </button>
            <button onClick={handlePropose} disabled={!!busy || !decisionInput.trim()}
              className={`px-4 py-2 bg-purple-500/20 border border-purple-500/40 text-purple-400 text-xs font-orbitron tracking-wider rounded-lg ${btn}`}
              style={{ WebkitTapHighlightColor: 'transparent' }}>
              SUBMIT
            </button>
          </div>
        </div>
      )}

      <div className="flex-1 flex overflow-hidden">
        {layout === 'chat'  && chatPanel}
        {layout === 'graph' && graphPanel}
        {layout === 'split' && !isMobile && (<>{chatPanel}{graphPanel}</>)}
      </div>
    </div>
  );
}
