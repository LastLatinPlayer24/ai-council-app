import type { Agent, Decision, Meeting, Message } from './types';
import type { ForgeParams } from './forge/paramSchema';

// ═══════════════════════════════════════════════════════════════
// Council logic — React-free so it can be unit-tested and imported
// by store.ts without pulling components (fast-refresh lint).
// ═══════════════════════════════════════════════════════════════

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/** Messages that are part of the debate (not council notices, not empty bubbles). */
export function debateMessages(messages: Message[]): Message[] {
  return messages.filter(m => m.type !== 'system' && m.type !== 'decision' && m.content.trim() !== '');
}

function speaker(m: Message): string {
  return m.agentId === 'user' ? 'User' : m.agentName;
}

/** Joins consecutive turns of the same role: Anthropic and Gemini expect alternating turns. */
export function mergeTurns(turns: ChatMessage[]): ChatMessage[] {
  const out: ChatMessage[] = [];
  for (const t of turns) {
    const last = out[out.length - 1];
    if (last && last.role === t.role && t.role !== 'system') last.content += `\n\n${t.content}`;
    else out.push({ ...t });
  }
  return out;
}

export function decisionsBlock(decisions: Decision[]): string {
  if (decisions.length === 0) return '';
  const lines = decisions.map(d => `- [${d.status.toUpperCase()} · ${d.consensus}%] ${d.content}`);
  return `Decisions the council has already voted on:\n${lines.join('\n')}`;
}

interface BuildOptions {
  agent: Agent;
  peers: Agent[];
  forge: ForgeParams;
  syntheticBlock: string;
  history: Message[];
  prompt: string;
  decisions: Decision[];
  objective?: string;
}

/**
 * The exact conversation an agent sees. Its own past answers are `assistant`
 * turns; everyone else's (user and other agents) arrive as `user` turns
 * prefixed with the speaker's name — otherwise the model can't tell who said
 * what, and "respond to APEX" is impossible.
 */
export function buildAgentMessages(o: BuildOptions): ChatMessage[] {
  const caps = o.forge.capabilities ?? {};
  const others = o.peers.filter(p => p.id !== o.agent.id);
  const roster = others.length
    ? `The other council members are: ${others.map(p => `${p.name} (${p.role})`).join(', ')}.`
    : '';

  const systemParts = [
    o.agent.systemPrompt,
    o.syntheticBlock,
    `You are ${o.agent.name}, ${o.agent.role}, a member of an AI council that debates the user's question and reaches decisions. ${roster} ` +
      'Speak only as yourself, in first person. When you agree or disagree with another member, name them. ' +
      'Be concrete and keep your answer under about 200 words unless asked otherwise. Answer in the language the user writes in.',
    o.objective ? `Meeting objective: ${o.objective}` : '',
    caps.memoryShared !== false ? decisionsBlock(o.decisions) : '',
  ].filter(Boolean);

  const window = Math.max(1, o.forge.memoryWindow || 10);
  const debate = debateMessages(o.history);
  const recent = debate.slice(-window);

  // Private memory: the agent keeps its own last two statements even when
  // they fell out of the visible window.
  let notes: Message[] = [];
  if (caps.memoryPrivate !== false) {
    const older = debate.slice(0, Math.max(0, debate.length - window));
    notes = older.filter(m => m.agentId === o.agent.id).slice(-2);
  }

  const turns: ChatMessage[] = [...notes, ...recent].map(m =>
    m.agentId === o.agent.id
      ? { role: 'assistant' as const, content: m.content }
      : { role: 'user' as const, content: `[${speaker(m)}]: ${m.content}` }
  );
  // Providers want the conversation to open with a user turn.
  if (turns.length && turns[0].role === 'assistant') {
    turns.unshift({ role: 'user', content: '(Earlier in this council session.)' });
  }
  turns.push({ role: 'user', content: o.prompt });

  return [{ role: 'system', content: systemParts.join('\n\n') }, ...mergeTurns(turns)];
}

export function roundPrompt(round: number, topic: string): string {
  return (
    `Round ${round} of the council debate on: "${topic}". ` +
    'Read what the other members said above. Respond to at least one of them by name: ' +
    'say where you agree, where you disagree and why, and refine your own position. Do not repeat your previous answer.'
  );
}

export function synthesisPrompt(meeting: Meeting, topic: string): string {
  return [
    `You are chairing this council session on: "${topic}".`,
    'Write the final resolution of the debate in Markdown with exactly these sections:',
    '## Consensus — what the council agrees on.',
    '## Disagreements — positions still in tension, naming who holds them.',
    '## Decisions — every vote with its result.',
    '## Next steps — numbered, concrete actions.',
    '## Open questions',
    'Be faithful to what was actually said; do not invent arguments nobody made.',
    decisionsBlock(meeting.decisions),
  ].filter(Boolean).join('\n');
}

export function proposalPrompt(topic: string): string {
  return (
    `Based on the debate so far about "${topic}", draft ONE concrete decision the council should vote on. ` +
    'Reply with only the proposal as a single sentence, no preamble, no quotes.'
  );
}

/** The question the council is discussing: last thing the user asked, else the objective. */
export function currentTopic(meeting: Meeting): string {
  const lastUser = [...meeting.messages].reverse().find(m => m.agentId === 'user');
  return lastUser?.content || meeting.objective || 'the current topic';
}

/** Agents allowed to vote (Forge "canVote" capability, on by default). */
export function canVote(forge: ForgeParams): boolean {
  return forge.capabilities?.canVote !== false;
}

export function canPropose(forge: ForgeParams): boolean {
  return forge.capabilities?.canPropose !== false;
}

export function consensusOf(votes: Record<string, string>, voters: number): number {
  if (voters === 0) return 0;
  const agree = Object.values(votes).filter(v => v === 'agree').length;
  return Math.round((agree / voters) * 100);
}

// ─── Export ────────────────────────────────────────────────────

function fmtDate(d: Date | string | undefined): string {
  if (!d) return '';
  const date = d instanceof Date ? d : new Date(d);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
}

export function meetingToMarkdown(meeting: Meeting, agents: Agent[]): string {
  const byId = new Map(agents.map(a => [a.id, a]));
  const members = meeting.agents.map(id => byId.get(id)).filter((a): a is Agent => !!a);
  const out: string[] = [`# ${meeting.title}`, ''];
  if (meeting.objective) out.push(`**Objective:** ${meeting.objective}`, '');
  out.push(`**Date:** ${fmtDate(meeting.startedAt ?? meeting.createdAt)}  `);
  out.push(`**Rounds:** ${meeting.currentRound}  `);
  if (members.length) {
    out.push('', '## Council', '');
    for (const a of members) out.push(`- **${a.name}** — ${a.role} (${a.provider} / ${a.model})`);
  }
  if (meeting.synthesis) {
    // nest the chairman's headings under "Resolution"
    out.push('', '## Resolution', '', meeting.synthesis.trim().replace(/^(#{1,5}) /gm, '#$1 '));
  }
  if (meeting.decisions.length) {
    out.push('', '## Votes', '');
    for (const d of meeting.decisions) {
      out.push(`- **${d.status.toUpperCase()}** (${d.consensus}%) — ${d.content}`);
      for (const [id, v] of Object.entries(d.votes)) {
        const why = d.reasons?.[id];
        out.push(`  - ${byId.get(id)?.name ?? id}: ${v}${why ? ` — ${why}` : ''}`);
      }
    }
  }
  out.push('', '## Transcript', '');
  for (const m of meeting.messages) {
    if (!m.content.trim()) continue;
    if (m.type === 'system') out.push(`> _${m.content}_`, '');
    else if (m.type === 'synthesis') continue;
    else out.push(`**${speaker(m)}**${m.round ? ` · round ${m.round}` : ''}`, '', m.content.trim(), '');
  }
  out.push('---', '_Exported from AI Council._', '');
  return out.join('\n');
}

export function slug(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50) || 'council';
}

// ─── Persistence ───────────────────────────────────────────────
// The session and the meeting history live in this browser only.

const SESSION_KEY = 'council_session';
const AGENTS_KEY = 'council_agents';
const HISTORY_KEY = 'council_history';
export const HISTORY_LIMIT = 30;

const DATE_FIELDS = new Set(['timestamp', 'startedAt', 'endedAt', 'createdAt']);

function reviveDates(_key: string, value: unknown) {
  if (typeof value === 'string' && DATE_FIELDS.has(_key)) {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? value : d;
  }
  return value;
}

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw, reviveDates) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch { /* storage full or blocked: the session just isn't saved */ }
}

export interface SavedSession {
  meeting: Meeting;
  activeAgents: string[];
}

export function loadSession(): SavedSession | null {
  const s = read<SavedSession>(SESSION_KEY);
  if (!s?.meeting || !Array.isArray(s.meeting.messages)) return null;
  // A reload mid-answer leaves half-streamed bubbles: close them.
  s.meeting.messages = s.meeting.messages
    .filter(m => m.content.trim() !== '')
    .map(m => ({ ...m, isStreaming: false }));
  return s;
}

export function saveSession(session: SavedSession): void {
  write(SESSION_KEY, session);
}

export function loadAgents(): Agent[] | null {
  const a = read<Agent[]>(AGENTS_KEY);
  if (!Array.isArray(a) || a.length === 0) return null;
  return a.map(x => ({ ...x, status: x.status === 'offline' ? 'offline' : 'idle' }));
}

export function saveAgents(agents: Agent[]): void {
  write(AGENTS_KEY, agents);
}

export function loadHistory(): Meeting[] {
  const h = read<Meeting[]>(HISTORY_KEY);
  return Array.isArray(h) ? h : [];
}

/** Adds (or replaces, by id) a finished meeting at the top of the history. */
export function archiveMeeting(meeting: Meeting): Meeting[] {
  if (debateMessages(meeting.messages).length === 0) return loadHistory();
  const history = [meeting, ...loadHistory().filter(m => m.id !== meeting.id)].slice(0, HISTORY_LIMIT);
  write(HISTORY_KEY, history);
  return history;
}

export function deleteFromHistory(id: string): Meeting[] {
  const history = loadHistory().filter(m => m.id !== id);
  write(HISTORY_KEY, history);
  return history;
}

/** Unique across reloads (restored messages keep their ids, so a counter would collide). */
export function uid(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
