export type AgentProvider = 'openai' | 'anthropic' | 'gemini' | 'ollama' | 'ollama_cloud' | 'lmstudio' | 'groq';
export type AgentStatus = 'active' | 'idle' | 'thinking' | 'offline' | 'error';
export type AgentMode = 'default' | 'devils_advocate' | 'consensus_builder' | 'analyst' | 'critic';
export type MessageType = 'message' | 'vote' | 'consensus' | 'system' | 'decision' | 'streaming' | 'synthesis';
export type RoundStatus = 'pending' | 'active' | 'voting' | 'concluded';

export interface Agent {
  id: string;
  name: string;
  role: string;
  provider: AgentProvider;
  model: string;
  temperature: number;
  systemPrompt: string;
  mode: AgentMode;
  status: AgentStatus;
  color: string;
  avatar: string;
  tokens: number;
  latency: number;
  agreementScore: number;
  messageCount: number;
  expertise: string[];
  memoryEnabled: boolean;
  createdAt: Date;
}

export interface Message {
  id: string;
  agentId: string;
  agentName: string;
  agentColor: string;
  content: string;
  type: MessageType;
  timestamp: Date;
  tokens: number;
  round?: number;
  votes?: Record<string, 'agree' | 'disagree' | 'abstain'>;
  confidence?: number;
  referencedIds?: string[];
  isStreaming?: boolean;
}

export interface Meeting {
  id: string;
  title: string;
  description: string;
  objective: string;
  status: 'draft' | 'active' | 'paused' | 'concluded';
  agents: string[];
  messages: Message[];
  currentRound: number;
  totalRounds: number;
  startedAt?: Date;
  endedAt?: Date;
  decisions: Decision[];
  createdAt: Date;
  tags: string[];
  /** Agent that writes the final resolution (defaults to the first active agent). */
  chairmanId?: string;
  /** Markdown resolution written by the chairman when the meeting is concluded. */
  synthesis?: string;
}

export interface Decision {
  id: string;
  content: string;
  round: number;
  votes: Record<string, 'agree' | 'disagree' | 'abstain'>;
  /** Each agent's one-line reason for its vote. */
  reasons?: Record<string, string>;
  consensus: number;
  timestamp: Date;
  status: 'proposed' | 'accepted' | 'rejected';
}

export interface VoteResult {
  agree: number;
  disagree: number;
  abstain: number;
  consensus: number;
}

export type AppView = 'dashboard' | 'council' | 'agents' | 'forge' | 'memory' | 'analytics' | 'settings';

export interface ProviderConfig {
  id: AgentProvider;
  name: string;
  baseUrl: string;
  apiKeys: string[];
  available: boolean;
  models: string[];
  customBaseUrl?: string;
}

export const PROVIDER_INFO: Record<AgentProvider, { name: string; baseUrl: string; defaultModels: string[] }> = {
  openai: { name: 'OpenAI', baseUrl: 'https://api.openai.com/v1', defaultModels: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'] },
  anthropic: { name: 'Anthropic', baseUrl: 'https://api.anthropic.com/v1', defaultModels: ['claude-opus-4-6', 'claude-sonnet-4-6', 'claude-haiku-4-5'] },
  gemini: { name: 'Google Gemini', baseUrl: 'https://generativelanguage.googleapis.com/v1beta', defaultModels: ['gemini-2.0-flash', 'gemini-1.5-pro', 'gemini-1.5-flash'] },
  groq: { name: 'Groq', baseUrl: 'https://api.groq.com/openai/v1', defaultModels: ['llama-3.1-70b', 'mixtral-8x7b', 'gemma-7b'] },
  ollama: { name: 'Ollama', baseUrl: 'http://localhost:11434', defaultModels: ['llama3.2', 'mistral', 'mixtral', 'phi3', 'gemma2', 'qwen2.5'] },
  ollama_cloud: { name: 'Ollama Cloud', baseUrl: 'https://ollama.com/v1', defaultModels: ['gpt-oss:120b', 'gpt-oss:20b', 'qwen3-coder:480b', 'deepseek-v3.1:671b'] },
  lmstudio: { name: 'LM Studio', baseUrl: 'http://localhost:1234', defaultModels: [] },
};