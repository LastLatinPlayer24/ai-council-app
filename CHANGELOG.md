# Changelog

All notable changes to this project. Dates are UTC.

## [2.1.0] — 2026-10-08

### Added
- **Chairman resolution** — `⚑ CONCLUDE` makes the chosen chairman write the
  outcome: consensus, disagreements (by name), decisions with votes, next steps
  and open questions.
- **New meeting** dialog: question, members, chairman and planned rounds. The
  council starts debating the question right away.
- **AI-drafted proposals** — `✨` in the vote bar: an agent with "can propose"
  drafts the decision to vote on.
- **Vote reasons** — each agent's one-line reason is kept with the decision and
  shown in the chat and the export.
- **Markdown export** of a whole session (resolution, votes with reasons, transcript).
- **Persistence** — the current session, custom agents and the last 30 meetings
  are saved in the browser and restored on reload.
- **Memory Core** shows real data: shared memory (decisions), what each agent
  remembers, and past sessions with their resolutions.
- **Guided tour** on every screen, replayable with `?`.
- `STOP` button to cancel answers in flight.
- Community files: LICENSE, SECURITY, CONTRIBUTING, CODE_OF_CONDUCT, issue/PR templates.

### Changed
- Agents now know **who said what**: other members' messages reach each model
  with the speaker's name, and rounds explicitly ask them to answer each other.
- Rounds finish when the last answer arrives (no more timers guessing).
- Forge capabilities are enforced: voting rights, private memory (own past answers
  beyond the window) and shared memory (decisions).
- Gemini receives the system prompt as `systemInstruction` and alternating turns.
- Votes always end with the proposal itself, so they work with an empty discussion.
- Status lights are real: backend health and latency, providers with keys,
  session state. The startup screen runs real checks.
- Agreement score and latency per agent are measured, not placeholders.
- Agents screen uses one column on phones.

### Fixed
- Docker health check used `curl`, which the image does not have.
- SSE parsing no longer drops events split across network chunks.

### Security (2.0.x)
- SSRF guard resolves real IPs; strict CSP; shared HTTP client with timeouts;
  client IP not spoofable; bounded rate-limit memory.

## [2.0.0] — 2026-10-07
- Deploy frontend and backend as one Vercel project; Ollama / LM Studio `/v1`
  fix; a failing agent no longer breaks the next round.
