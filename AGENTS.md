# AI Council - Project Memory

## Project Overview
Multi-agent AI debate platform. 6 AI providers (OpenAI, Anthropic, Gemini, Groq, Ollama, LMStudio) debate topics with real-time streaming, voting, and consensus.

**Core purpose (do not lose sight of this):** a virtual meeting room where agents from different providers debate, share knowledge, reach consensus and define next steps for whatever project the user is working on. Every new feature must be additive to that, never at its expense.

## Tech Stack
- Frontend: Vite + React 19 + TypeScript + Tailwind CSS 3.4.1
- Backend: FastAPI (Python) on port 8000
- Vite proxy: `/api` → `localhost:8000`
- API keys stored in localStorage, sent per-request to backend
- Round-robin key rotation for multiple keys per provider

## Architecture
- `backend/main.py` — FastAPI server with SSE streaming, 6 provider adapters, `/api/chat`, `/api/vote`, `/api/models/{provider}`, `/api/health`
- `src/council.ts` — React-free debate logic: `buildAgentMessages` (what each agent sees: other speakers as `[NAME]: …` user turns, own answers as assistant turns, consecutive turns merged), round/synthesis/proposal prompts, Markdown export, localStorage persistence (session, agents, history)
- `src/store.ts` — `useAppState` hook: rounds (resolve when every answer arrives), votes with reasons, chairman synthesis, AI-drafted proposals, new meeting, STOP, persistence effects
- `src/health.ts` — real backend health check used by the sidebar and the boot screen
- `src/data.ts` — Agent definitions, provider models, API_BASE_URL
- `src/utils.ts` — React-free helpers: `getApiKeys`, `getCustomUrl`, `fetchProviderModels()` (calls `/api/models/{provider}?api_key=…`), `modelsForProvider()` (live catalog with static fallback)
- `src/types.ts` — TypeScript types including `ProviderConfig`, `PROVIDER_INFO`, `AgentStatus` (idle|active|thinking|offline|error), `lmstudio` provider, `AppView` (includes `forge`)
- `src/components/CouncilRoom.tsx` — Main debate UI with chat/graph/split layouts, mobile responsive
- `src/components/MemoryAndSettings.tsx` — API key management (add/remove multiple keys per provider, test connection)
- `src/components/AgentGraph.tsx` — D3 SVG visualization of agent connections
- `src/components/Dashboard.tsx` — Overview stats
- `src/components/Sidebar.tsx` / `BottomNav.tsx` / `TopBar.tsx` — Navigation

### Agent Forge (`src/forge/`)
Parameter calibration terminal. Entirely additive — if never opened, app behaves exactly as before.
- `paramSchema.ts` — **single source of truth.** Declarative definition of every tunable parameter: ranges, steps, defaults, which providers support it, which control renders it. Adding a parameter here makes it appear in the UI automatically. Also holds the synthetic dial definitions and `buildSyntheticPrompt()`.
- `ForgeView.tsx` — 3D cover-flow agent carousel + flip panel with 3 faces (API / MIND / CAPS). Draft-first: nothing applies until FORGE is pressed.
- `PresetDrawer.tsx` — 5 factory presets, user-saved presets, JSON export/import.
- `forgeStorage.ts` — localStorage persistence. **Kept separate from components** so `store.ts` can import it without pulling React (and so fast-refresh lint passes).
- `controls/RotaryDial.tsx` — arc-drag rotary knob, pointer events, double-tap resets to default.
- `controls/Controls.tsx` — PlainSlider, BipolarSlider, LogSlider, SegmentedRing, NeonToggle.

## Key Decisions
- localStorage for API keys (frontend-managed) — keys sent per-request
- OpenAI-compatible adapter reused for Groq, Ollama, LMStudio (all share `/chat/completions`)
- `isStreaming` flag on messages for typing cursor effect
- 60-second timeout on agent API calls — sets agent to `error` status on timeout
- Agent status transitions: idle → thinking → active (on success) or error (on failure/timeout)

### Forge decisions
- **Two parameter layers.** API layer = real knobs the provider accepts (temperature, top_p, top_k, penalties, max_tokens). Prompt layer = synthetic dials (obedience, reasoning, verbosity, skepticism, formality) that inject predefined text blocks into the system prompt. There is no `obedience=0.8` API — do not pretend otherwise. The live PROMPT PREVIEW panel exists precisely to keep this honest.
- **Double clamp.** `clampApiParam()` in the browser, `sanitize_request()` on the server. A hand-crafted request still cannot push a model out of range.
- **All Forge params optional in `ChatRequest`.** Omit them → identical behaviour to a stock request. This is what guarantees nothing breaks.
- **Per-provider filtering.** Controls render from `paramsForProvider()`, so no dead knobs (Anthropic never shows `top_k`).
- Anthropic temperature capped at 1.0 in the backend — its API rejects higher.
- CSS 3D transforms chosen over Three.js: ~600KB saved, 60fps on iPhone.

## Build & Run
```bash
npm run dev        # frontend on :5173 (proxies /api to :8000)
cd backend && uvicorn main:app --reload --port 8000  # backend
npm run build      # tsc + vite build (production)
npm test           # vitest
cd backend && pytest -q   # pytest (needs requirements-dev.txt)
npm run lint
```

## Completed Work
- Converted from mockup to functional multi-agent platform
- Removed 43 unused shadcn/ui components + 222 dead npm packages
- Removed App.css, pnpm-lock.yaml
- Fixed CSS @import order (Google Fonts before @tailwind)
- Added streaming typing cursor on in-progress messages
- Added 60s timeout for agents stuck in thinking state
- Agent status set to `error` on API failures and timeouts
- **Agent Forge**: param schema, 6 touch controls, 3-face panel, 3D carousel, presets + export/import, backend param plumbing with server-side clamping
- **Ollama Cloud provider** + live model catalog: the frontend now actually calls `GET /api/models/{provider}` with the stored key (on mount and whenever a key is saved), so the model dropdown shows the real catalog instead of the 4 hardcoded fallbacks. Falls back silently to the static list if the backend is down or answers empty. The key travels in the `X-API-Key` header (`Authorization: Bearer` also accepted; `?api_key=` still works for compatibility) — never in the query string, which would land in access logs.

## Known Issues
- AgentGraph re-renders the full SVG on every state change (perf issue with many agents)
- Model catalogs are fetched but not cached: every mount re-queries each configured provider
- The in-memory rate limiter is per instance; on serverless add a platform rule (Vercel Firewall)

## Forge capabilities (enforced)
- `canVote` — only these agents vote
- `canPropose` — the first such agent drafts proposals (✨ in the vote bar)
- `memoryPrivate` — the agent keeps its own last two answers even outside `memoryWindow`
- `memoryShared` — the meeting's voted decisions go into the agent's system prompt

## Conventions
- Spanish in UI copy, English in code/comments/commits
- Orbitron for headings, JetBrains Mono for data/labels, Inter for body
- Agent color drives accent colour throughout its panels
- Mobile: `font-size: 16px` on inputs (prevents iOS zoom), safe-area insets on fixed bars, `WebkitTapHighlightColor: transparent` on buttons
- Every phase must build clean and pass tests before moving on
