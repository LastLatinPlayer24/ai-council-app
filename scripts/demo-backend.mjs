#!/usr/bin/env node
// Scripted stand-in for the FastAPI backend, used to record the README demo and
// to work on the UI without API keys. It speaks the same HTTP/SSE protocol as
// backend/main.py but every answer is pre-written — nothing here calls a model.
//
//   node scripts/demo-backend.mjs        # listens on :8000
//   npm run dev                          # the Vite proxy sends /api here
import http from 'node:http';

const PORT = Number(process.env.PORT || 8000);
const DELAY_MS = Number(process.env.DEMO_DELAY_MS || 22);

const ROUND1 = {
  APEX: 'Strategically, freemium buys distribution we could never afford with ads. But it only works if the free tier builds a habit and has a natural upgrade trigger. I would launch **freemium with a hard usage cap** — 3 projects — so the value is obvious and the ceiling is felt within two weeks.',
  NEXUS: 'From the engineering side, freemium is not free: every free user costs compute, support and abuse handling. A paid-only launch with a **14-day trial** keeps infrastructure predictable while we harden onboarding. We can open a free tier later; closing one is much harder.',
  VELA: 'Both options assume people will love the product. What if they don\'t? Freemium hides that behind vanity signups; a trial forces the truth in 14 days. I am also skeptical that a 3-project cap is ever felt — most users never create a second project.',
  ORION: 'There is more overlap than it looks: everyone wants a fast, honest signal of value and bounded costs. A **reverse trial** gives both — 14 days of the full plan, then users drop to a limited free tier instead of losing access.',
  LYRA: 'Benchmarks: B2B freemium converts at **2–5%**, trials at **15–25%** with far fewer signups. Reverse trials land around **8–12%** while keeping the top of the funnel. Our CAC says we need at least 6% to break even.',
};

const ROUND2 = {
  APEX: 'VELA is right that my cap may never bite — let\'s cap by **collaborators** instead of projects, since that is where teams feel the limit. I can back ORION\'s reverse trial if the free tier keeps that collaborator cap.',
  NEXUS: 'I agree with ORION and LYRA. A reverse trial is also the cheapest to build: one downgrade job and a feature flag. My condition: rate limits on the free tier from day one, as VELA warned.',
  VELA: 'LYRA\'s numbers make me less hostile. My remaining objection, APEX: we must measure **activation, not signups**. If fewer than 40% of trial users finish onboarding, no pricing model will save us.',
  ORION: 'We now agree on the shape: reverse trial, collaborator-capped free tier, activation as the north-star metric. The open question is price — NEXUS and LYRA should size the plan from usage data.',
  LYRA: 'Agreed with VELA on activation. I\'ll set the go/no-go at **8% trial→paid** after 60 days; below that we revisit. NEXUS\'s rate limits also protect margins — a free user costs us about $0.40/month.',
};

const SYNTHESIS = `## Consensus
- Launch with a **14-day reverse trial**: full plan first, then a limited free tier.
- Cap the free tier by **collaborators**, not projects (APEX, after VELA's objection).
- Track **activation**, not signups, as the main metric.

## Disagreements
- **VELA** wants an activation gate before launch; the others prefer to launch and measure.

## Decisions
- Reverse trial with a 2-collaborator free tier — **accepted, 80%** (VELA against).

## Next steps
1. NEXUS: downgrade job and rate limits on the free tier.
2. LYRA: activation dashboard; go/no-go at 8% trial→paid after 60 days.
3. APEX: pricing page and upgrade prompts at the collaborator limit.

## Open questions
- Final price of the paid plan.
- What exactly counts as "activated"?`;

const PROPOSAL = 'Launch with a 14-day reverse trial that drops to a free tier capped at 2 collaborators.';

const VOTES = {
  APEX: ['agree', 'Keeps distribution and gives a clear upgrade trigger.'],
  NEXUS: ['agree', 'Cheapest to build, and costs stay bounded.'],
  VELA: ['disagree', 'Right shape, but I want an activation gate before launch.'],
  ORION: ['agree', 'It is the overlap everyone asked for.'],
  LYRA: ['agree', 'Expected 8–12% conversion clears our 6% break-even.'],
};

const nameFrom = (messages) => /You are ([A-Z][A-Z0-9_ -]*?),/.exec(messages?.[0]?.content ?? '')?.[1]?.trim() ?? 'APEX';
const lastUser = (messages) => [...(messages ?? [])].reverse().find(m => m.role === 'user')?.content ?? '';

function answerFor(body) {
  const name = nameFrom(body.messages);
  const prompt = lastUser(body.messages);
  if (prompt.includes('You are chairing')) return SYNTHESIS;
  if (prompt.includes('draft ONE concrete decision')) return PROPOSAL;
  if (/Round [2-9]/.test(prompt)) return ROUND2[name] ?? ROUND2.APEX;
  return ROUND1[name] ?? `${name} here. ${ROUND1.ORION}`;
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function json(res, code, data) {
  res.writeHead(code, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify(data));
}

async function readBody(req) {
  let raw = '';
  for await (const chunk of req) raw += chunk;
  try { return JSON.parse(raw || '{}'); } catch { return {}; }
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (req.method === 'OPTIONS') {
    res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET,POST' });
    return res.end();
  }
  if (url.pathname === '/api/health') return json(res, 200, { status: 'ok', version: '2.1.0-demo' });
  if (url.pathname.startsWith('/api/models/')) return json(res, 200, { models: [] });
  if (url.pathname === '/api/providers') return json(res, 200, {});

  if (url.pathname === '/api/vote' && req.method === 'POST') {
    const body = await readBody(req);
    await sleep(600 + Math.random() * 700);
    const [vote, reasoning] = VOTES[body.agent_name] ?? ['abstain', 'No scripted vote.'];
    return json(res, 200, { vote, reasoning, provider: body.provider, model: body.model });
  }

  if (url.pathname === '/api/chat' && req.method === 'POST') {
    const body = await readBody(req);
    const text = answerFor(body);
    if (!body.stream) {
      await sleep(900);
      return json(res, 200, { content: text, provider: body.provider, model: body.model, tokens: 0 });
    }
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    await sleep(250 + Math.random() * 500);
    // stream word by word, keeping newlines so Markdown survives
    for (const piece of text.match(/\S+\s*/g) ?? []) {
      res.write(`data: ${JSON.stringify({ content: piece })}\n\n`);
      await sleep(DELAY_MS + Math.random() * DELAY_MS);
    }
    res.write(`data: ${JSON.stringify({ usage: { total_tokens: Math.round(text.length / 3.6) } })}\n\n`);
    res.write('data: [DONE]\n\n');
    return res.end();
  }

  json(res, 404, { detail: 'not found' });
}).listen(PORT, () => console.log(`AI Council demo backend (scripted, no models) on http://localhost:${PORT}`));
