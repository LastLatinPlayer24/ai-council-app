import type { Agent, Meeting, Message, Decision } from './types';

export const AGENT_COLORS = [
  '#00f5ff', '#a855f7', '#00ff9d', '#f59e0b', '#f87171',
  '#60a5fa', '#34d399', '#fb923c', '#e879f9', '#38bdf8'
];

export const PROVIDER_MODELS: Record<string, string[]> = {
  openai: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'],
  anthropic: ['claude-opus-4-6', 'claude-sonnet-4-6', 'claude-haiku-4-5'],
  gemini: ['gemini-2.0-flash', 'gemini-1.5-pro', 'gemini-1.5-flash'],
  groq: ['llama-3.1-70b', 'mixtral-8x7b', 'gemma-7b'],
  ollama: ['llama3.2', 'mistral', 'mixtral', 'phi3', 'gemma2', 'qwen2.5'],
  lmstudio: [],
  ollama_cloud: ['gpt-oss:120b', 'gpt-oss:20b', 'qwen3-coder:480b', 'deepseek-v3.1:671b'],
};

// Sin VITE_API_URL: en desarrollo, el backend local; en producción, el mismo dominio
// (en Vercel el backend corre como función en /api, ver api/index.py).
export const API_BASE_URL: string =
  import.meta.env.VITE_API_URL || (import.meta.env.PROD ? '' : 'http://localhost:8000');

export const MOCK_AGENTS: Agent[] = [
  {
    id: 'agent-1',
    name: 'APEX',
    role: 'Strategic Analyst',
    provider: 'anthropic',
    model: 'claude-sonnet-4-6',
    temperature: 0.7,
    systemPrompt: 'You are a strategic analyst focused on long-term implications and systemic thinking. Analyze proposals from a strategic perspective, consider second-order effects, and provide clear recommendations.',
    mode: 'analyst',
    status: 'idle',
    color: '#00f5ff',
    avatar: '🧠',
    tokens: 0,
    latency: 0,
    agreementScore: 50,
    messageCount: 0,
    expertise: ['Strategy', 'Systems Thinking', 'Risk Analysis'],
    memoryEnabled: true,
    createdAt: new Date(),
  },
  {
    id: 'agent-2',
    name: 'NEXUS',
    role: 'Technical Architect',
    provider: 'openai',
    model: 'gpt-4o',
    temperature: 0.3,
    systemPrompt: 'You are a technical architect who evaluates feasibility and implementation complexity. Focus on practical constraints, engineering trade-offs, and realistic timelines.',
    mode: 'default',
    status: 'idle',
    color: '#a855f7',
    avatar: '⚙️',
    tokens: 0,
    latency: 0,
    agreementScore: 50,
    messageCount: 0,
    expertise: ['Architecture', 'Engineering', 'Scalability'],
    memoryEnabled: true,
    createdAt: new Date(),
  },
  {
    id: 'agent-3',
    name: 'VELA',
    role: "Devil's Advocate",
    provider: 'anthropic',
    model: 'claude-opus-4-6',
    temperature: 0.9,
    systemPrompt: 'You challenge assumptions and identify flaws in reasoning. Be constructively critical. Your role is to stress-test ideas, find weaknesses, and ensure the council does not fall into groupthink.',
    mode: 'devils_advocate',
    status: 'idle',
    color: '#f87171',
    avatar: '😈',
    tokens: 0,
    latency: 0,
    agreementScore: 50,
    messageCount: 0,
    expertise: ['Critical Analysis', 'Risk Identification', 'Debate'],
    memoryEnabled: true,
    createdAt: new Date(),
  },
  {
    id: 'agent-4',
    name: 'ORION',
    role: 'Consensus Builder',
    provider: 'gemini',
    model: 'gemini-2.0-flash',
    temperature: 0.5,
    systemPrompt: 'You seek common ground and synthesize different perspectives into unified conclusions. Find the overlap between opposing views and propose compromises that maximize shared benefits.',
    mode: 'consensus_builder',
    status: 'idle',
    color: '#00ff9d',
    avatar: '🤝',
    tokens: 0,
    latency: 0,
    agreementScore: 50,
    messageCount: 0,
    expertise: ['Negotiation', 'Synthesis', 'Mediation'],
    memoryEnabled: true,
    createdAt: new Date(),
  },
  {
    id: 'agent-5',
    name: 'LYRA',
    role: 'Data Scientist',
    provider: 'groq',
    model: 'llama-3.1-70b',
    temperature: 0.4,
    systemPrompt: 'You provide data-driven insights and quantitative analysis to support decisions. Reference statistics, benchmarks, and empirical evidence whenever possible.',
    mode: 'analyst',
    status: 'idle',
    color: '#f59e0b',
    avatar: '📊',
    tokens: 0,
    latency: 0,
    agreementScore: 50,
    messageCount: 0,
    expertise: ['Data Analysis', 'Statistics', 'ML'],
    memoryEnabled: true,
    createdAt: new Date(),
  },
];

export const MOCK_MESSAGES: Message[] = [];

export const MOCK_DECISIONS: Decision[] = [];

export const MOCK_MEETING: Meeting = {
  id: 'meeting-1',
  title: 'AI Council Session',
  description: 'Multi-agent deliberation session',
  objective: 'Reach consensus through structured debate',
  status: 'active',
  agents: ['agent-1', 'agent-2', 'agent-3', 'agent-4', 'agent-5'],
  messages: [],
  currentRound: 0,
  totalRounds: 3,
  startedAt: new Date(),
  decisions: [],
  createdAt: new Date(),
  tags: [],
};