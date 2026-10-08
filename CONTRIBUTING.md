# Contributing to AI Council

Thanks for helping! Bug reports, new providers, translations and UI polish are all welcome.

## Run it locally

```bash
# backend (Python 3.10+)
cd backend
python -m venv venv && source venv/bin/activate   # Windows: venv\Scripts\activate
pip install -r requirements.txt -r requirements-dev.txt
uvicorn main:app --reload --port 8000

# frontend (Node 22)
npm install
npm run dev        # http://localhost:5173 — /api is proxied to :8000
```

No API key? Run a local model with [Ollama](https://ollama.com) and pick it for an agent.

## Before opening a pull request

```bash
npm run lint && npm test && npm run build      # frontend
cd backend && pytest -q                        # backend
```

All four must pass — CI runs the same commands.

## Where things live

| Path | What |
|------|------|
| `src/council.ts` | Debate logic without React: what each agent sees, round/synthesis prompts, export, persistence. Start here. |
| `src/store.ts` | App state and the calls to the backend (rounds, votes, chairman). |
| `src/components/` | Screens: council room, agents, memory, analytics, settings. |
| `src/forge/` | Agent Forge — `paramSchema.ts` is the single source of truth for tunable parameters. |
| `src/tour/` | The guided tour (steps in `tours.ts`, targets marked with `data-tour`). |
| `backend/main.py` | FastAPI: provider adapters, streaming, voting, SSRF guard, rate limit. |
| `api/index.py` | Vercel entry point for the backend. |

## Adding a provider

1. Backend: add it to `PROVIDERS` in `backend/main.py`. If it speaks the OpenAI
   chat format, `call_openai_compatible` already works; otherwise write an adapter
   like `call_anthropic` and add it to `_resolve_dispatch`.
2. Frontend: add it to `PROVIDER_INFO` in `src/types.ts` (Settings and the agent
   form pick it up automatically) and to `PROVIDER_MODELS` in `src/data.ts`.
3. If it supports extra sampling parameters, list it under `providers` in
   `src/forge/paramSchema.ts`.
4. Add a backend test that mocks its HTTP response.

## Style

- TypeScript strict, functional React, Tailwind classes.
- Code, comments and commits in English; UI copy may be Spanish or English.
- Keep `council.ts` free of React so it stays unit-testable.
- One topic per pull request, with a short description of what and why.
