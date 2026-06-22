# Assessment Portal

Internal portal that tracks candidates from "cleared the offline assessment" through React → TR1 → TR2 → selected. Built per `../assessment-portal-PRD.md`.

This is a **one-day demoable vertical slice**: the data model, state machine, and AI features are real; external integrations (sheets / calendar / messaging) are **mocked behind adapters** so real providers can drop in later.

## Stack
- Next.js 16 (App Router) + TypeScript + Tailwind
- SQLite via Prisma (schema is Postgres-portable)
- Gemini for the two AI features, behind a provider-agnostic `LLMAdapter`

## Setup
```bash
npm install
# put your key in .env:  GEMINI_API_KEY="..."   GEMINI_MODEL="gemini-2.0-flash"
npx prisma migrate dev          # create the DB
npx tsx prisma/seed.ts          # seed demo data
npm run dev                     # http://localhost:3000
```
Without a Gemini key the AI features run a **stub** (the rest of the app works fully).

## Where things live
| Area | Path |
|------|------|
| Data model | `prisma/schema.prisma` |
| State machine (§6) + automation (§7) | `src/lib/stateMachine.ts` |
| AI NL query (validated filter, §8.1) | `src/lib/nlquery.ts` |
| AI TR report (§8.2) | `src/lib/report.ts` |
| LLM adapter (Gemini today) | `src/lib/llm.ts` |
| Mock integrations | `src/lib/adapters.ts` |
| Job runner (durable queue) | `src/lib/jobs.ts` |
| Org UI | `src/app/org/*` |
| Student UI | `src/app/student/[studentId]` |
| API routes | `src/app/api/*` |

## Tests
```bash
npx tsx prisma/test-statemachine.ts   # §6 guards + §7 idempotency (10 assertions)
```

## Demo path
1. `/org` dashboard → "Run due jobs" to advance the queue.
2. `/org/roster` → AI query box ("all students who failed TR1 from bucket A").
3. Click a student → timeline, enter React score / panel feedback, "Generate TR report".
4. "Open student view" → availability picker, results, prep docs, selected→redirect.
5. Switch the "Acting as" role (top-right) to see RBAC.

## Still mocked / to wire for production
- Google Sheets / Calendar / WhatsApp+SMS+email adapters (`src/lib/adapters.ts`, `/api/sheets/sync`)
- Real auth (magic links / SSO) — currently a cookie-based role switch
- Durable worker + cron (currently `/api/jobs/run` on demand)
- Swap SQLite → Postgres (change `datasource` provider + `DATABASE_URL`)
