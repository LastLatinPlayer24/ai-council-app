import { useState, useCallback, useRef, useEffect } from 'react';
import type { Agent, Meeting, Message, Decision, AppView, AgentStatus, ProviderConfig, MessageType } from './types';
import { PROVIDER_INFO } from './types';
import { MOCK_AGENTS, AGENT_COLORS, API_BASE_URL, PROVIDER_MODELS } from './data';
import { getApiKeys, getCustomUrl, fetchProviderModels } from './utils';
import { getForgeForAgent } from './forge/forgeStorage';
import { buildSyntheticPrompt } from './forge/paramSchema';
import {
  archiveMeeting, buildAgentMessages, canPropose, canVote, consensusOf, currentTopic, debateMessages,
  deleteFromHistory, loadAgents, loadHistory, loadSession, meetingToMarkdown, mergeTurns, proposalPrompt,
  roundPrompt, saveAgents, saveSession, slug, synthesisPrompt, uid,
} from './council';

type Busy = null | 'round' | 'vote' | 'synthesis' | 'proposal';

export interface NewMeetingInput {
  title: string;
  objective: string;
  totalRounds: number;
  agentIds: string[];
  chairmanId?: string;
}

const AGENT_TIMEOUT_MS = 60_000;
const SYNTHESIS_TIMEOUT_MS = 120_000;
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

function freshMeeting(input?: Partial<NewMeetingInput>): Meeting {
  const now = new Date();
  return {
    id: uid('meeting'),
    title: input?.title?.trim() || 'AI Council Session',
    description: '',
    objective: input?.objective?.trim() || '',
    status: 'active',
    agents: input?.agentIds ?? MOCK_AGENTS.map(a => a.id),
    messages: [],
    currentRound: 0,
    totalRounds: input?.totalRounds ?? 3,
    startedAt: now,
    decisions: [],
    createdAt: now,
    tags: [],
    chairmanId: input?.chairmanId,
  };
}

function notice(content: string, round: number, color = '#f87171'): Message {
  return {
    id: uid('msg'), agentId: 'system', agentName: 'COUNCIL', agentColor: color,
    content, type: 'system', timestamp: new Date(), tokens: 0, round,
  };
}

/** How often an agent's vote matched the council's final outcome. 50 = no votes yet. */
function agreementFor(agentId: string, decisions: Decision[]): number {
  const voted = decisions.filter(d => d.votes[agentId] && d.votes[agentId] !== 'abstain');
  if (voted.length === 0) return 50;
  const matches = voted.filter(d =>
    (d.status === 'accepted' && d.votes[agentId] === 'agree') ||
    (d.status === 'rejected' && d.votes[agentId] === 'disagree')).length;
  return Math.round((matches / voted.length) * 100);
}

export function useAppState() {
  const [restored] = useState(() => loadSession());
  const [view, setView] = useState<AppView>('dashboard');
  const [agents, setAgents] = useState<Agent[]>(() => loadAgents() ?? MOCK_AGENTS);
  const [meeting, setMeeting] = useState<Meeting>(() => restored?.meeting ?? freshMeeting());
  const [history, setHistory] = useState<Meeting[]>(() => loadHistory());
  const [busy, setBusy] = useState<Busy>(null);
  const [showNewAgent, setShowNewAgent] = useState(false);
  const [showNewMeeting, setShowNewMeeting] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [userInput, setUserInput] = useState('');
  const [activeAgents, setActiveAgents] = useState<string[]>(
    () => restored?.activeAgents ?? MOCK_AGENTS.map(a => a.id),
  );
  const [providerConfigs, setProviderConfigs] = useState<Record<string, ProviderConfig>>(() => {
    const configs: Record<string, ProviderConfig> = {};
    // Derived from PROVIDER_INFO so adding a provider there is enough —
    // no second list to keep in sync (this is how ollama_cloud went
    // missing from Settings while showing up in the agent dropdown).
    const LOCAL_PROVIDERS = ['ollama', 'lmstudio'];
    for (const [id, info] of Object.entries(PROVIDER_INFO)) {
      const keys = getApiKeys(id);
      const url = getCustomUrl(id);
      const isLocal = LOCAL_PROVIDERS.includes(id);
      configs[id] = {
        id: id as ProviderConfig['id'],
        name: info.name,
        baseUrl: url || (isLocal ? info.baseUrl : ''),
        apiKeys: keys,
        available: isLocal ? true : keys.length > 0,
        models: PROVIDER_MODELS[id as keyof typeof PROVIDER_MODELS] ?? info.defaultModels,
        customBaseUrl: url,
      };
    }
    return configs;
  });

  // Async flows (rounds, votes, synthesis) outlive a render: they read the
  // latest state through refs instead of stale closures.
  const meetingRef = useRef(meeting);
  const agentsRef = useRef(agents);
  const activeRef = useRef(activeAgents);
  useEffect(() => {
    meetingRef.current = meeting;
    agentsRef.current = agents;
    activeRef.current = activeAgents;
  }, [meeting, agents, activeAgents]);

  const controllers = useRef(new Set<AbortController>());

  // Save the session and the roster between answers (not on every streamed chunk).
  useEffect(() => {
    if (busy) return;
    saveSession({ meeting, activeAgents });
  }, [busy, meeting, activeAgents]);
  useEffect(() => {
    if (busy) return;
    saveAgents(agents);
  }, [busy, agents]);

  const getAgent = useCallback((id: string) => agents.find(a => a.id === id), [agents]);

  const setAgentStatus = useCallback((id: string, status: AgentStatus) => {
    setAgents(prev => prev.map(a => a.id === id ? { ...a, status } : a));
  }, []);

  const addMessage = useCallback((msg: Message) => {
    setMeeting(prev => ({ ...prev, messages: [...prev.messages, msg] }));
  }, []);

  const updateStreamingMessage = useCallback((id: string, content: string) => {
    setMeeting(prev => ({
      ...prev,
      messages: prev.messages.map(m => m.id === id ? { ...m, content: m.content + content } : m),
    }));
  }, []);

  const finalizeStreamingMessage = useCallback((id: string, tokens: number) => {
    setMeeting(prev => ({
      ...prev,
      // Un agente que falla (sin clave, timeout, error del proveedor) deja su
      // burbuja vacía: se quita en vez de dejarla en la conversación.
      messages: prev.messages
        .filter(m => m.id !== id || m.content.trim() !== '')
        .map(m => (m.id === id ? { ...m, isStreaming: false, tokens } : m)),
    }));
  }, []);

  const responders = useCallback(
    () => agentsRef.current.filter(a => activeRef.current.includes(a.id) && a.status !== 'offline'),
    [],
  );

  const requestBody = useCallback((agent: Agent, messages: { role: string; content: string }[], extra: Record<string, unknown>) => {
    const forge = getForgeForAgent(agent.id);
    const customUrl = getCustomUrl(agent.provider);
    return {
      provider: agent.provider,
      model: agent.model,
      messages,
      temperature: forge.api['temperature'] ?? agent.temperature,
      max_tokens: forge.api['max_tokens'] ?? 1024,
      api_keys: getApiKeys(agent.provider),
      ...(customUrl ? { custom_base_url: customUrl } : {}),
      // Forge API params — solo los definidos explícitamente
      ...(forge.api['top_p'] !== undefined ? { top_p: forge.api['top_p'] } : {}),
      ...(forge.api['top_k'] !== undefined ? { top_k: forge.api['top_k'] } : {}),
      ...(forge.api['frequency_penalty'] !== undefined ? { frequency_penalty: forge.api['frequency_penalty'] } : {}),
      ...(forge.api['presence_penalty'] !== undefined ? { presence_penalty: forge.api['presence_penalty'] } : {}),
      ...(forge.api['repeat_penalty'] !== undefined ? { repeat_penalty: forge.api['repeat_penalty'] } : {}),
      ...extra,
    };
  }, []);

  const conversationFor = useCallback((agent: Agent, prompt: string, history: Message[], base: Meeting) => {
    const forge = getForgeForAgent(agent.id);
    return buildAgentMessages({
      agent,
      peers: responders(),
      forge,
      syntheticBlock: buildSyntheticPrompt(forge.synthetic),
      history,
      prompt,
      decisions: base.decisions,
      objective: base.objective,
    });
  }, [responders]);

  /** Streams one agent's answer into the chat. Resolves with the text, or null on failure. */
  const callAgentAPI = useCallback(async (
    agent: Agent,
    prompt: string,
    history: Message[],
    opts: { round: number; type?: MessageType; maxTokens?: number; timeoutMs?: number },
  ): Promise<string | null> => {
    const base = meetingRef.current;
    const body = requestBody(agent, conversationFor(agent, prompt, history, base), {
      stream: true,
      ...(opts.maxTokens ? { max_tokens: opts.maxTokens } : {}),
    });

    const msgId = uid('msg');
    addMessage({
      id: msgId, agentId: agent.id, agentName: agent.name, agentColor: agent.color, content: '',
      type: opts.type ?? 'message', timestamp: new Date(), tokens: 0, round: opts.round, isStreaming: true,
    });

    const controller = new AbortController();
    controllers.current.add(controller);
    const started = performance.now();
    let timedOut = false;
    const timeoutId = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, opts.timeoutMs ?? AGENT_TIMEOUT_MS);

    const fail = (text: string) => {
      finalizeStreamingMessage(msgId, 0);
      setAgentStatus(agent.id, 'error');
      addMessage(notice(text, opts.round));
      return null;
    };

    try {
      const response = await fetch(`${API_BASE_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errText = await response.text();
        return fail(`Error from ${agent.name} (${agent.provider}/${agent.model}): ${response.status} - ${errText.substring(0, 200)}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        finalizeStreamingMessage(msgId, 0);
        return null;
      }

      const decoder = new TextDecoder();
      let fullContent = '';
      let realTokens: number | null = null;
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        // An SSE event can be split across network chunks: keep the tail.
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6);
          if (data === '[DONE]') continue;
          try {
            const parsed = JSON.parse(data);
            if (parsed.error) return fail(`Provider error: ${parsed.error}`);
            if (parsed.usage?.total_tokens !== undefined) realTokens = parsed.usage.total_tokens;
            if (parsed.content) {
              fullContent += parsed.content;
              updateStreamingMessage(msgId, parsed.content);
            }
          } catch { /* ignore malformed SSE chunks */ }
        }
      }

      // Real usage from the provider when the backend forwarded it
      // (openai/groq/ollama_cloud/anthropic); otherwise a word-count estimate.
      const tokens = realTokens ?? Math.ceil(fullContent.split(/\s+/).filter(Boolean).length * 1.3);
      const latency = Math.round(performance.now() - started);
      finalizeStreamingMessage(msgId, tokens);
      setAgents(prev => prev.map(a => {
        if (a.id !== agent.id) return a;
        const n = a.messageCount + 1;
        return {
          ...a,
          status: 'active' as const,
          tokens: a.tokens + tokens,
          messageCount: n,
          // running average of full-answer time
          latency: Math.round((a.latency * a.messageCount + latency) / n),
        };
      }));
      return fullContent;
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
        if (timedOut) {
          const limit = Math.round((opts.timeoutMs ?? AGENT_TIMEOUT_MS) / 1000);
          return fail(`Timeout: ${agent.name} took too long to respond (${limit}s limit).`);
        }
        finalizeStreamingMessage(msgId, 0);
        setAgentStatus(agent.id, 'idle');
        return null;
      }
      return fail(`Connection error: ${err instanceof Error ? err.message : 'Unknown error'}. Is the backend running at ${API_BASE_URL || window.location.origin}?`);
    } finally {
      clearTimeout(timeoutId);
      controllers.current.delete(controller);
    }
  }, [requestBody, conversationFor, addMessage, updateStreamingMessage, finalizeStreamingMessage, setAgentStatus]);

  /** Every responder answers the same prompt; resolves when all of them finished (no timers guessing). */
  const askCouncil = useCallback(async (prompt: string, history: Message[], round: number) => {
    const group = responders();
    if (group.length === 0) {
      addMessage(notice('No active agents. Activate at least one in a new meeting or in Agents.', round));
      return;
    }
    setBusy('round');
    group.forEach(a => setAgentStatus(a.id, 'thinking'));
    // A short stagger keeps the answers from all landing in the same frame.
    await Promise.all(group.map(async (agent, i) => {
      await sleep(i * 350);
      await callAgentAPI(agent, prompt, history, { round });
    }));
    setBusy(null);
  }, [responders, addMessage, setAgentStatus, callAgentAPI]);

  const sendUserMessage = useCallback(async (content: string) => {
    if (!content.trim() || busy) return;
    const base = meetingRef.current;
    const round = base.currentRound + 1;
    const userMsg: Message = {
      id: uid('msg'), agentId: 'user', agentName: 'You', agentColor: '#ffffff', content,
      type: 'message', timestamp: new Date(), tokens: Math.ceil(content.split(/\s+/).length * 1.3), round,
    };
    setMeeting(prev => ({ ...prev, currentRound: round, status: 'active', messages: [...prev.messages, userMsg] }));
    setUserInput('');
    await askCouncil(content, [...base.messages, userMsg], round);
  }, [busy, askCouncil]);

  const triggerRound = useCallback(async () => {
    if (busy) return;
    const base = meetingRef.current;
    if (debateMessages(base.messages).length === 0) {
      addMessage(notice('Ask the council something first — rounds are rebuttals to what was said.', base.currentRound, '#00f5ff'));
      return;
    }
    const round = base.currentRound + 1;
    const announce = notice(`Round ${round} initiated. Each agent answers the others by name.`, round, '#00f5ff');
    setMeeting(prev => ({ ...prev, currentRound: round, messages: [...prev.messages, announce] }));
    await askCouncil(roundPrompt(round, currentTopic(base)), base.messages, round);
  }, [busy, addMessage, askCouncil]);

  const proposeDecision = useCallback(async (content: string) => {
    if (!content.trim() || busy) return;
    const base = meetingRef.current;
    const round = base.currentRound || 1;
    const voters = responders().filter(a => canVote(getForgeForAgent(a.id)));
    if (voters.length === 0) {
      addMessage(notice('No agent has voting rights (Forge → CAPS → DERECHO A VOTO).', round));
      return;
    }
    setBusy('vote');
    voters.forEach(a => setAgentStatus(a.id, 'thinking'));

    // Who said what, so the vote is about the actual debate.
    const discussion = mergeTurns(debateMessages(base.messages).slice(-12).map(m => ({
      role: 'user' as const,
      content: `[${m.agentId === 'user' ? 'User' : m.agentName}]: ${m.content}`,
    })));

    const votes: Decision['votes'] = {};
    const reasons: Record<string, string> = {};
    // Cada voto es independiente: se piden todos a la vez.
    await Promise.all(voters.map(async (agent) => {
      const forge = getForgeForAgent(agent.id);
      const controller = new AbortController();
      controllers.current.add(controller);
      const timeoutId = setTimeout(() => controller.abort(), 30000);
      try {
        const customUrl = getCustomUrl(agent.provider);
        const response = await fetch(`${API_BASE_URL}/api/vote`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            provider: agent.provider,
            model: agent.model,
            agent_name: agent.name,
            agent_role: agent.role,
            agent_mode: agent.mode,
            topic: content,
            discussion,
            temperature: forge.api['temperature'] ?? agent.temperature,
            api_keys: getApiKeys(agent.provider),
            ...(customUrl ? { custom_base_url: customUrl } : {}),
          }),
          signal: controller.signal,
        });
        if (response.ok) {
          const data = await response.json();
          votes[agent.id] = ['agree', 'disagree', 'abstain'].includes(data.vote) ? data.vote : 'abstain';
          if (typeof data.reasoning === 'string') reasons[agent.id] = data.reasoning.slice(0, 280);
        } else {
          votes[agent.id] = 'abstain';
          reasons[agent.id] = `Vote request failed (${response.status})`;
        }
      } catch (err) {
        if (err instanceof Error && err.name !== 'AbortError') console.warn(`Vote failed for ${agent.name}:`, err);
        votes[agent.id] = 'abstain';
        reasons[agent.id] = 'No answer in time';
      } finally {
        clearTimeout(timeoutId);
        controllers.current.delete(controller);
        setAgentStatus(agent.id, 'active');
      }
    }));

    const consensus = consensusOf(votes, voters.length);
    const decision: Decision = {
      id: uid('dec'), content, round, votes, reasons, consensus, timestamp: new Date(),
      status: consensus >= 60 ? 'accepted' : 'rejected',
    };
    const decisions = [...base.decisions, decision];
    const tally = voters.map(a => `${a.name}: ${votes[a.id]}`).join(' · ');
    setMeeting(prev => ({
      ...prev,
      decisions: [...prev.decisions, decision],
      messages: [...prev.messages, {
        id: uid('msg'), agentId: 'system', agentName: 'COUNCIL', agentColor: '#00f5ff',
        content: `Decision proposed: "${content}" — Consensus: ${consensus}% — Status: ${decision.status.toUpperCase()}\n${tally}`,
        type: 'decision', timestamp: new Date(), tokens: 0, round, votes, referencedIds: [decision.id],
      }],
    }));
    setAgents(prev => prev.map(a => (votes[a.id] ? { ...a, agreementScore: agreementFor(a.id, decisions) } : a)));
    setBusy(null);
  }, [busy, responders, addMessage, setAgentStatus]);

  /** An agent with "can propose" drafts a decision for the user to put to the vote. */
  const suggestProposal = useCallback(async (): Promise<string | null> => {
    if (busy) return null;
    const base = meetingRef.current;
    const proposer = responders().find(a => canPropose(getForgeForAgent(a.id)));
    if (!proposer || debateMessages(base.messages).length === 0) {
      addMessage(notice(proposer ? 'Debate something first, then ask for a proposal.' : 'No agent can propose (Forge → CAPS → PUEDE PROPONER).', base.currentRound, '#00f5ff'));
      return null;
    }
    setBusy('proposal');
    setAgentStatus(proposer.id, 'thinking');
    try {
      const response = await fetch(`${API_BASE_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody(proposer, conversationFor(proposer, proposalPrompt(currentTopic(base)), base.messages, base), { stream: false, max_tokens: 200 })),
      });
      if (!response.ok) throw new Error(`${response.status}`);
      const data = await response.json();
      const text = String(data.content ?? '').trim().replace(/^["'“”]+|["'“”]+$/g, '');
      return text || null;
    } catch (err) {
      addMessage(notice(`${proposer.name} could not draft a proposal (${err instanceof Error ? err.message : 'error'}).`, base.currentRound));
      return null;
    } finally {
      setAgentStatus(proposer.id, 'active');
      setBusy(null);
    }
  }, [busy, responders, addMessage, setAgentStatus, requestBody, conversationFor]);

  /** The chairman writes the resolution: consensus, disagreements, decisions, next steps. */
  const concludeMeeting = useCallback(async () => {
    if (busy) return;
    const base = meetingRef.current;
    const group = responders();
    const chairman = group.find(a => a.id === base.chairmanId) ?? group[0];
    if (!chairman || debateMessages(base.messages).length === 0) {
      addMessage(notice(chairman ? 'There is nothing to conclude yet — start the debate first.' : 'No active agent can chair the meeting.', base.currentRound, '#00f5ff'));
      return;
    }
    setBusy('synthesis');
    setAgentStatus(chairman.id, 'thinking');
    const synthesis = await callAgentAPI(chairman, synthesisPrompt(base, currentTopic(base)), base.messages, {
      round: base.currentRound, type: 'synthesis', maxTokens: 1500, timeoutMs: SYNTHESIS_TIMEOUT_MS,
    });
    if (synthesis) {
      await sleep(50); // let the last streamed chunk render into meetingRef
      const endedAt = new Date();
      const concluded: Meeting = {
        ...meetingRef.current,
        messages: meetingRef.current.messages.map(m => ({ ...m, isStreaming: false })),
        synthesis, status: 'concluded', endedAt, chairmanId: chairman.id,
      };
      setMeeting(prev => ({ ...prev, synthesis, status: 'concluded', endedAt, chairmanId: chairman.id }));
      setHistory(archiveMeeting(concluded));
    }
    setBusy(null);
  }, [busy, responders, addMessage, setAgentStatus, callAgentAPI]);

  const stopAll = useCallback(() => {
    controllers.current.forEach(c => c.abort());
    controllers.current.clear();
  }, []);

  const startMeeting = useCallback(async (input: NewMeetingInput) => {
    if (busy) return;
    const previous = meetingRef.current;
    if (debateMessages(previous.messages).length > 0) {
      setHistory(archiveMeeting({ ...previous, endedAt: previous.endedAt ?? new Date() }));
    }
    const next = freshMeeting(input);
    const ids = input.agentIds.length ? input.agentIds : agentsRef.current.map(a => a.id);
    setAgents(prev => prev.map(a => ({
      ...a, status: a.status === 'offline' ? 'offline' : 'idle', tokens: 0, messageCount: 0,
    })));
    setActiveAgents(ids);
    setMeeting(next);
    meetingRef.current = next;
    activeRef.current = ids;
    setShowNewMeeting(false);
    setView('council');
    // The objective is the opening question: the council starts on it right away.
    if (input.objective.trim()) {
      const userMsg: Message = {
        id: uid('msg'), agentId: 'user', agentName: 'You', agentColor: '#ffffff', content: input.objective.trim(),
        type: 'message', timestamp: new Date(), tokens: Math.ceil(input.objective.split(/\s+/).length * 1.3), round: 1,
      };
      setMeeting(prev => ({ ...prev, currentRound: 1, messages: [userMsg] }));
      await askCouncil(userMsg.content, [userMsg], 1);
    }
  }, [busy, askCouncil]);

  const downloadMarkdown = useCallback((m?: Meeting) => {
    const target = m ?? meetingRef.current;
    const md = meetingToMarkdown(target, agentsRef.current);
    if (typeof URL.createObjectURL !== 'function') return md;
    const url = URL.createObjectURL(new Blob([md], { type: 'text/markdown;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${slug(target.title)}-${new Date(target.startedAt ?? target.createdAt).toISOString().slice(0, 10)}.md`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return md;
  }, []);

  const removeFromHistory = useCallback((id: string) => setHistory(deleteFromHistory(id)), []);

  const addAgent = useCallback((agentData: Partial<Agent>) => {
    const newAgent: Agent = {
      id: `agent-${Date.now()}`,
      name: agentData.name || 'NEW AGENT',
      role: agentData.role || 'General Assistant',
      provider: agentData.provider || 'openai',
      model: agentData.model || 'gpt-4o',
      temperature: agentData.temperature ?? 0.7,
      systemPrompt: agentData.systemPrompt || 'You are a helpful AI assistant.',
      mode: agentData.mode || 'default',
      status: 'idle',
      color: AGENT_COLORS[agents.length % AGENT_COLORS.length],
      avatar: agentData.avatar || '🤖',
      tokens: 0,
      latency: 0,
      agreementScore: 50,
      messageCount: 0,
      expertise: agentData.expertise || [],
      memoryEnabled: agentData.memoryEnabled ?? true,
      createdAt: new Date(),
    };
    setAgents(prev => [...prev, newAgent]);
    setActiveAgents(prev => [...prev, newAgent.id]);
    return newAgent;
  }, [agents.length]);

  const removeAgent = useCallback((id: string) => {
    setAgents(prev => prev.filter(a => a.id !== id));
    setActiveAgents(prev => prev.filter(aid => aid !== id));
  }, []);

  const updateAgent = useCallback((id: string, data: Partial<Agent>) => {
    setAgents(prev => prev.map(a => a.id === id ? { ...a, ...data } : a));
  }, []);

  /**
   * Pull the live catalog from `/api/models/{provider}` and replace the
   * static list. The key is what unlocks the real catalog — without it the
   * backend can only answer with its fallback models.
   * Silently keeps the current list if the backend is down or returns [].
   */
  const refreshProviderModels = useCallback(async (providerId: string, keyOverride?: string) => {
    const key = keyOverride ?? getApiKeys(providerId)[0];
    const models = await fetchProviderModels(providerId, key);
    if (models.length === 0) return;
    setProviderConfigs(prev =>
      prev[providerId] ? { ...prev, [providerId]: { ...prev[providerId], models } } : prev
    );
  }, []);

  // On mount, refresh every provider that can actually answer: local ones
  // (no key needed) and remote ones with a stored key. Batched into a single
  // state update after all requests settle — no cascading renders.
  useEffect(() => {
    const LOCAL = ['ollama', 'lmstudio'];
    const ids = Object.keys(PROVIDER_INFO)
      .filter(id => LOCAL.includes(id) || getApiKeys(id).length > 0);
    if (ids.length === 0) return;

    let cancelled = false;
    (async () => {
      const results = await Promise.all(
        ids.map(async id => [id, await fetchProviderModels(id, getApiKeys(id)[0])] as const)
      );
      if (cancelled) return;
      const fresh = results.filter(([, models]) => models.length > 0);
      if (fresh.length === 0) return;
      setProviderConfigs(prev => {
        const next = { ...prev };
        for (const [id, models] of fresh) {
          if (next[id]) next[id] = { ...next[id], models };
        }
        return next;
      });
    })();
    return () => { cancelled = true; };
  }, []);

  const saveProviderConfig = useCallback((providerId: string, config: Partial<ProviderConfig>) => {
    if (config.apiKeys !== undefined) {
      localStorage.setItem(`council_keys_${providerId}`, JSON.stringify(config.apiKeys));
    }
    if (config.customBaseUrl !== undefined) {
      localStorage.setItem(`council_url_${providerId}`, config.customBaseUrl);
    }
    setProviderConfigs(prev => {
      const current = prev[providerId];
      const updated: ProviderConfig = {
        ...current,
        ...config,
        available: config.apiKeys ? config.apiKeys.length > 0 : (providerId === 'ollama' || providerId === 'lmstudio' ? true : (current?.apiKeys?.length ?? 0) > 0),
      } as ProviderConfig;
      return { ...prev, [providerId]: updated };
    });
    // A new key (or a new local host) means a different catalog is reachable.
    if (config.apiKeys?.length) {
      void refreshProviderModels(providerId, config.apiKeys[0]);
    } else if (config.customBaseUrl !== undefined) {
      void refreshProviderModels(providerId);
    }
  }, [refreshProviderModels]);

  const totalTokens = meeting.messages.reduce((sum, m) => sum + m.tokens, 0);
  const avgConsensus = meeting.decisions.length > 0
    ? Math.round(meeting.decisions.reduce((sum, d) => sum + d.consensus, 0) / meeting.decisions.length)
    : 0;

  return {
    view, setView,
    agents, setAgents,
    meeting,
    history,
    busy,
    isStreaming: busy !== null,
    restoredSession: Boolean(restored && debateMessages(restored.meeting.messages).length > 0),
    showNewAgent, setShowNewAgent,
    showNewMeeting, setShowNewMeeting,
    selectedAgent, setSelectedAgent,
    userInput, setUserInput,
    activeAgents, setActiveAgents,
    providerConfigs,
    sendUserMessage,
    triggerRound,
    proposeDecision,
    suggestProposal,
    concludeMeeting,
    startMeeting,
    stopAll,
    downloadMarkdown,
    removeFromHistory,
    addAgent,
    removeAgent,
    updateAgent,
    getAgent,
    saveProviderConfig,
    refreshProviderModels,
    totalTokens,
    avgConsensus,
  };
}
