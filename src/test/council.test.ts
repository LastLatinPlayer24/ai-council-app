import { describe, it, expect, beforeEach } from 'vitest';
import type { Agent, Decision, Meeting, Message } from '../types';
import {
  archiveMeeting, buildAgentMessages, canVote, consensusOf, currentTopic, debateMessages, deleteFromHistory,
  loadHistory, loadSession, meetingToMarkdown, mergeTurns, roundPrompt, saveSession, slug, synthesisPrompt, uid,
} from '../council';
import { defaultForgeParams } from '../forge/paramSchema';
import { MOCK_AGENTS } from '../data';

const [APEX, NEXUS, VELA] = MOCK_AGENTS as [Agent, Agent, Agent, ...Agent[]];

function msg(agent: Agent | 'user' | 'system', content: string, extra: Partial<Message> = {}): Message {
  const isAgent = typeof agent !== 'string';
  return {
    id: uid('msg'),
    agentId: isAgent ? agent.id : agent,
    agentName: isAgent ? agent.name : agent === 'user' ? 'You' : 'COUNCIL',
    agentColor: '#fff',
    content,
    type: agent === 'system' ? 'system' : 'message',
    timestamp: new Date('2026-10-08T10:00:00Z'),
    tokens: 0,
    round: 1,
    ...extra,
  };
}

function meeting(messages: Message[], decisions: Decision[] = []): Meeting {
  return {
    id: 'm1', title: 'Pricing', description: '', objective: 'Freemium or paid?', status: 'active',
    agents: [APEX.id, NEXUS.id, VELA.id], messages, currentRound: 2, totalRounds: 3,
    decisions, createdAt: new Date('2026-10-08T10:00:00Z'), startedAt: new Date('2026-10-08T10:00:00Z'), tags: [],
  };
}

const decision: Decision = {
  id: 'd1', content: 'Launch with a 14-day trial', round: 1, consensus: 67, status: 'accepted',
  votes: { [APEX.id]: 'agree', [NEXUS.id]: 'agree', [VELA.id]: 'disagree' },
  reasons: { [VELA.id]: 'Trials hide churn' }, timestamp: new Date(),
};

describe('buildAgentMessages', () => {
  const history = [
    msg('user', 'Freemium or paid?'),
    msg(APEX, 'Freemium widens the funnel.'),
    msg('system', 'Error from LYRA: 401'),
    msg(VELA, 'Freemium burns cash.'),
  ];

  it('attributes every other speaker by name and keeps own answers as assistant', () => {
    const out = buildAgentMessages({
      agent: APEX, peers: [APEX, NEXUS, VELA], forge: defaultForgeParams(), syntheticBlock: '',
      history, prompt: 'Round 2', decisions: [],
    });
    expect(out[0].role).toBe('system');
    expect(out[0].content).toContain('You are APEX');
    expect(out[0].content).toContain('NEXUS (Technical Architect)');
    expect(out[0].content).not.toContain('APEX (Strategic Analyst)');
    const rest = out.slice(1);
    expect(rest.map(m => m.role)).toEqual(['user', 'assistant', 'user']);
    expect(rest[0].content).toBe('[User]: Freemium or paid?');
    expect(rest[1].content).toBe('Freemium widens the funnel.');
    // VELA's message and the new prompt are merged into one user turn
    expect(rest[2].content).toBe('[VELA]: Freemium burns cash.\n\nRound 2');
    // council notices never reach the model
    expect(JSON.stringify(out)).not.toContain('401');
  });

  it('opens with a user turn even when the window starts on its own answer', () => {
    const forge = { ...defaultForgeParams(), memoryWindow: 2 };
    const out = buildAgentMessages({
      agent: APEX, peers: [APEX, VELA], forge, syntheticBlock: '',
      history: [msg('user', 'Q'), msg(APEX, 'A1'), msg(VELA, 'V1')], prompt: 'Go', decisions: [],
    });
    expect(out[1].role).toBe('user');
  });

  it('private memory keeps the agent\'s own older answers; turning it off drops them', () => {
    const long = [msg('user', 'Q'), msg(APEX, 'my first take'), ...Array.from({ length: 6 }, (_, i) => msg(VELA, `v${i}`))];
    const base = { agent: APEX, peers: [APEX, VELA], syntheticBlock: '', history: long, prompt: 'Go', decisions: [] };
    const withNotes = buildAgentMessages({ ...base, forge: { ...defaultForgeParams(), memoryWindow: 3 } });
    expect(JSON.stringify(withNotes)).toContain('my first take');
    const forge = defaultForgeParams();
    forge.memoryWindow = 3;
    forge.capabilities.memoryPrivate = false;
    expect(JSON.stringify(buildAgentMessages({ ...base, forge }))).not.toContain('my first take');
  });

  it('shared memory hands the voted decisions to the agent', () => {
    const base = { agent: APEX, peers: [APEX], syntheticBlock: '', history, prompt: 'Go', decisions: [decision] };
    expect(buildAgentMessages({ ...base, forge: defaultForgeParams() })[0].content).toContain('Launch with a 14-day trial');
    const forge = defaultForgeParams();
    forge.capabilities.memoryShared = false;
    expect(buildAgentMessages({ ...base, forge })[0].content).not.toContain('14-day trial');
  });
});

describe('council helpers', () => {
  it('mergeTurns joins consecutive same-role turns', () => {
    expect(mergeTurns([
      { role: 'user', content: 'a' }, { role: 'user', content: 'b' }, { role: 'assistant', content: 'c' },
    ])).toEqual([{ role: 'user', content: 'a\n\nb' }, { role: 'assistant', content: 'c' }]);
  });

  it('debateMessages drops notices, decisions and empty bubbles', () => {
    const list = [msg('user', 'q'), msg('system', 'n'), msg(APEX, '  '), msg(APEX, 'a', { type: 'decision' })];
    expect(debateMessages(list).map(m => m.content)).toEqual(['q']);
  });

  it('round prompt asks agents to answer each other by name', () => {
    expect(roundPrompt(3, 'Pricing')).toMatch(/Round 3.*Pricing.*by name/);
  });

  it('synthesis prompt lists the decisions and the required sections', () => {
    const p = synthesisPrompt(meeting([], [decision]), 'Pricing');
    for (const s of ['## Consensus', '## Disagreements', '## Decisions', '## Next steps', '14-day trial']) expect(p).toContain(s);
  });

  it('currentTopic is the last user question, else the objective', () => {
    expect(currentTopic(meeting([msg('user', 'first'), msg('user', 'second')]))).toBe('second');
    expect(currentTopic(meeting([]))).toBe('Freemium or paid?');
  });

  it('consensus counts agree votes over all voters', () => {
    expect(consensusOf({ a: 'agree', b: 'agree', c: 'abstain' }, 3)).toBe(67);
    expect(consensusOf({}, 0)).toBe(0);
  });

  it('agents vote unless the Forge took the right away', () => {
    const f = defaultForgeParams();
    expect(canVote(f)).toBe(true);
    f.capabilities.canVote = false;
    expect(canVote(f)).toBe(false);
  });

  it('uid never repeats and slug is file-safe', () => {
    expect(new Set(Array.from({ length: 200 }, () => uid('m'))).size).toBe(200);
    expect(slug('¿Freemium o pago? Q3!')).toBe('freemium-o-pago-q3');
  });
});

describe('export', () => {
  it('writes resolution, votes with reasons and transcript', () => {
    const m = { ...meeting([msg('user', 'Freemium or paid?'), msg(VELA, 'Paid only.')], [decision]), synthesis: '## Consensus\nTrial first.' };
    const md = meetingToMarkdown(m, MOCK_AGENTS);
    expect(md).toContain('# Pricing');
    expect(md).toContain('## Resolution');
    expect(md).toContain('Trial first.');
    expect(md).toContain('### Consensus');
    expect(md).toContain('## Votes');
    expect(md).toContain('**ACCEPTED** (67%) — Launch with a 14-day trial');
    expect(md).toContain('VELA: disagree — Trials hide churn');
    expect(md).toContain('**VELA** · round 1');
  });
});

describe('persistence', () => {
  beforeEach(() => localStorage.clear());

  it('restores the session with real Date objects and closes half-streamed bubbles', () => {
    saveSession({ meeting: meeting([msg(APEX, 'done'), msg(NEXUS, 'half', { isStreaming: true }), msg(VELA, '')]), activeAgents: [APEX.id] });
    const s = loadSession()!;
    expect(s.activeAgents).toEqual([APEX.id]);
    expect(s.meeting.messages).toHaveLength(2);
    expect(s.meeting.messages.every(m => !m.isStreaming)).toBe(true);
    expect(s.meeting.messages[0].timestamp).toBeInstanceOf(Date);
  });

  it('archives only meetings with a debate, newest first, and deletes by id', () => {
    expect(archiveMeeting(meeting([]))).toEqual([]);
    archiveMeeting({ ...meeting([msg('user', 'q')]), id: 'a' });
    archiveMeeting({ ...meeting([msg('user', 'q')]), id: 'b' });
    archiveMeeting({ ...meeting([msg('user', 'q again')]), id: 'a' });
    expect(loadHistory().map(m => m.id)).toEqual(['a', 'b']);
    expect(deleteFromHistory('a').map(m => m.id)).toEqual(['b']);
  });

  it('survives corrupted storage', () => {
    localStorage.setItem('council_session', '{nope');
    expect(loadSession()).toBeNull();
  });
});
