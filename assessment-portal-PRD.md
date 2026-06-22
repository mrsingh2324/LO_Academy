# Assessment Portal — Product Requirements Document (PRD v2)

> A build-ready spec for a single, DB-backed portal with **two sides** — an organisation/admin side and a student side — that tracks candidates from "cleared the offline assessment" through the React/web-dev test and the two technical rounds. It automates every status-driven step, syncs availability and scores from connected sheets, books interviews on a calendar, and uses AI to (a) answer natural-language questions about the data and (b) generate technical-round reports.

---

## 0. How to use this document

Paste the **Kickoff prompt** below into Codex or Claude Code, attaching this whole file. The agent should read the full PRD, confirm the items in **§14 Open decisions**, then build in the phases defined in **§13**.

### Kickoff prompt (paste this)

```
You are building the internal "Assessment Portal" specified in the attached PRD
(assessment-portal-PRD.md). It is a single database with two UIs (an org/admin
side and a student side), two AI features (a natural-language query assistant and
a Claude-powered report generator), and integrations with sheets, a calendar, and
a messaging provider. Before writing any code:

1. Read the entire PRD.
2. List the open decisions in §14 and ask me to confirm each one. Do NOT guess —
   the TR2-failure routing, the messaging/calendar/sheets providers, how a "bucket"
   is defined, and the external final-stage portal all materially change the build.
3. Propose a short build plan that follows the phases in §13, and confirm the tech
   stack in §12 (or suggest a better one and tell me why).

Then build phase by phase. After each phase: run migrations, write and run tests
for the state transitions (§6) and the automation/AI rules (§7), and show me what
changed. The data model in §5 is the source of truth. Every automation rule must
be idempotent and every state transition logged to the audit table. The AI query
feature MUST be read-only and validated server-side — never execute model-emitted
SQL directly. Treat §15 as the definition of done.
```

---

## 1. Overview

The portal is the single system of record for candidates moving through a multi-stage assessment. A candidate **enters the database the moment they clear the offline assessment**. From that point the portal drives the rest of the journey: the **React/web-dev test**, **Technical Round 1 (TR1)**, **Technical Round 2 (TR2)**, and finally a handoff/redirect to a separate downstream portal.

The same database is presented through **two UIs**:
- **Organisation side** — internal staff see every student's information, current stage, and a clean, detailed view of last-stage performance; they query the data in natural language, trigger actions (ask for availability, generate reports), enter scores and panel feedback, and schedule rounds.
- **Student side** — candidates are notified, fill out availability/application forms, pick slots, view their marks and remarks, receive prep/guidance docs, get interview invites, and are redirected onward when they reach the final stage.

The three assessment stages run the *same* underlying cycle (request availability → schedule → remind → assess → score → share + branch). The differences are at the endpoints (React ends in a submission; the TRs end in a live panel interview with feedback and an AI-generated report) and in what a failure produces.

### Goals
- One source of truth; two role-appropriate UIs over it.
- Automate status-driven actions: onboarding, scheduling (within fixed weekend slots), reminders, result sharing, stage advancement, prep docs, and the final redirect.
- Sheet-connected intake of availability responses and scores that update the DB directly.
- AI for ad-hoc querying ("all students who failed TR1 from bucket A") and for generating TR reports from collected round data.

### Non-goals
- Conducting interviews or auto-grading subjective work (unless React auto-grading is enabled — §14).
- Owning the downstream/final-stage portal (separate system; we hand off to it).

---

## 2. The two sides of the portal

### 2.1 Organisation / admin side
- **Roster view:** all students with current stage, status, bucket, and score-at-a-glance.
- **Student detail:** clean, detailed history — every stage attempt, scores, remarks, panel feedback, generated reports, and prep docs, ordered as a timeline.
- **AI query box:** type or speak a question (e.g. "all students failed in TR1 from bucket A") → the system asks Claude to translate it into a safe, read-only query over the schema, runs it, and returns the matching student list.
- **Action buttons:** "Ask availability" (sends the availability form to a student/selection of students), "Generate TR report" (collects the student's round data and has Claude write the report), "Schedule", "Share result".
- **Score & feedback entry:** team enters React scores (directly or via a synced sheet); panel enters TR feedback on the same platform.

### 2.2 Student side
- **Notifications:** availability requests, schedule confirmations, reminders, results, prep docs, interview invites.
- **Forms:** fill availability/application; pick a slot from the offered (fixed weekend) options.
- **Results:** view marks + remarks per stage.
- **Prep:** receive guidance/preparation docs (on a pass, to prepare for the next round; on a fail, to prepare for a retry).
- **Final stage:** when selected, the student is redirected/handed off to the separate downstream portal.

---

## 3. Users & roles

| Role | Who | Can do |
|------|-----|--------|
| Admin | Process owner | Everything, plus settings, templates, RBAC, AI prompt config. |
| Ops | Coordinator | View all records, run AI queries, trigger actions (ask availability, schedule, generate report, share result), enter React scores. |
| Evaluator | Reviews React submissions | Open assigned submissions, enter score + remarks. |
| Panelist | Conducts TR1/TR2 | Submit structured feedback for a round they ran. |
| Candidate | The student | Uses the **student side**: receive notifications, fill availability, pick slots, submit work, view results/prep, get redirected at the final stage. |

Candidate access default: signed, expiring magic links per action (no password). Full candidate accounts are an alternative (§14).

---

## 4. Core concepts & lifecycle

- **Bucket:** a cohort/batch grouping a student belongs to (used for filtering and AI queries, e.g. "bucket A"). Definition/source TBD (§14).
- **Entry point:** a student record is created in the DB when the offline assessment is cleared (direct entry or upstream import). This is when the React stage begins.
- **Stage Attempt:** each time a student enters a stage, an attempt record is created. A retry creates a new attempt for the same stage (attempt_number increments).
- **Fixed assessment slots:** the React test (and round scheduling) is offered only on fixed weekend slots (default: Saturday & Sunday). Students apply for a weekend slot; a scheduled message goes out on the slot day (e.g. Saturday morning) carrying the test/invite.
- **Stages:** `react` → `tr1` → `tr2` → `selected` → redirect to external portal.

Within one attempt the status moves through:
```
availability_requested → scheduled → (reminders) → awaiting_result
  → under_evaluation → evaluated → result_shared → passed | failed
```
`passed` advances to the next stage (and, on a React/TR pass, shares marks + opens the next round's availability + sends prep docs). `failed` shares marks + sends retry prep docs and reopens the stage (§7 rule 8). TR2 pass marks `selected` and triggers the redirect.

---

## 5. Data model (the database)

Recommended: PostgreSQL. All tables get `id` (uuid, pk), `created_at`, `updated_at` (timestamptz). Soft-delete (`deleted_at`) on `students` and `users`.

### 5.1 `buckets`
`name` (text, unique), `description` (text). (Or model `bucket` as a plain text field on `students` if buckets are free-form — confirm in §14.)

### 5.2 `students`
| Column | Type | Notes |
|--------|------|-------|
| external_ref | text, unique | Key from intake (idempotency anchor). |
| name | text | |
| email | text | |
| phone | text | E.164. |
| bucket_id | uuid, fk → buckets, nullable | Cohort grouping. |
| offline_cleared_at | timestamptz | Entry trigger. |
| current_stage | enum(`react`,`tr1`,`tr2`,`selected`,`rejected`) | Denormalized for listing. |
| current_status | text | Mirrors the active attempt's status. |
| current_attempt_id | uuid, fk → stage_attempts | Active attempt. |
| final_portal_redirected_at | timestamptz, nullable | Set on handoff to the downstream portal. |

### 5.3 `stage_attempts` (the heart of the system)
| Column | Type | Notes |
|--------|------|-------|
| student_id | uuid, fk → students | |
| stage | enum(`react`,`tr1`,`tr2`) | |
| attempt_number | int | Increments on retry. |
| status | enum (see §6) | |
| availability_options | jsonb | Offered (fixed weekend) slots. |
| chosen_slot | timestamptz | Candidate's pick. |
| scheduled_at | timestamptz | Confirmed date/time. |
| calendar_event_id | text, nullable | Booked calendar event (TR interviews). |
| availability_sheet_ref | text, nullable | Row key in the connected availability sheet. |
| score_sheet_ref | text, nullable | Row key in the connected scores sheet. |
| submitted_at | timestamptz | React only. |
| attended_at | timestamptz | TR only. |
| score | numeric | Null until evaluated. |
| result | enum(`pending`,`pass`,`fail`) | |
| remarks | text | |
| evaluator_id | uuid, fk → users, nullable | React grading owner. |
| prep_due_until | timestamptz, nullable | When a reattempt may be scheduled. |

Unique (`student_id`, `stage`, `attempt_number`).

### 5.4 `panel_feedback` (TR only)
`attempt_id` (fk), `panelist_id` (fk), `scores` (jsonb, per-competency), `strengths` (text), `weaknesses` (text), `recommendation` (enum `advance`/`reject`/`borderline`), `submitted_at`.

### 5.5 `reports` (AI-generated TR performance reports)
| Column | Type | Notes |
|--------|------|-------|
| attempt_id | uuid, fk → stage_attempts | The TR1/TR2 attempt. |
| student_id | uuid, fk → students | Stored with the student. |
| stage | enum(`tr1`,`tr2`) | |
| source_data | jsonb | Snapshot of everything passed to Claude (scores, feedback, remarks, history) — for reproducibility. |
| prompt_version | text | Which configured prompt/template produced it. |
| content | text | Claude-generated report (markdown). |
| model | text | e.g. claude-opus-4-x. |
| generated_by | uuid, fk → users | Who clicked the button. |
| status | enum(`generated`,`reviewed`,`shared`) | |

### 5.6 `prep_artifacts` (guidance/prep docs)
`attempt_id` (fk), `type` (enum `react_guideline`/`tr_prep`/`pass_forward_prep`), `topics` (jsonb), `resources` (jsonb), `body` (text), `reopen_at` (timestamptz, nullable), `generated_at`.

### 5.7 `scheduled_jobs` (automation queue)
`attempt_id` (fk, nullable), `type` (enum `send_availability`,`fixed_slot_send`,`send_reminder`,`reopen_attempt`,`escalate_no_response`,`redirect_final`), `run_at`, `status` (enum `pending`/`done`/`skipped`/`failed`), `attempts` (int), `payload` (jsonb), `executed_at`.

### 5.8 `messages` (outbound comms log)
`student_id` (fk), `attempt_id` (fk, nullable), `channel` (enum `email`/`sms`/`whatsapp`), `template_key` (text), `payload` (jsonb), `status` (enum `queued`/`sent`/`delivered`/`failed`), `provider_message_id` (text), `sent_at`.

### 5.9 `ai_query_log` (NL query audit)
`actor_id` (fk), `question` (text), `generated_filter` (jsonb — the validated structured query), `result_count` (int), `executed_at`, `status` (enum `ok`/`rejected`/`error`).

### 5.10 `sheet_sync_log`
`sheet` (enum `availability`/`scores`), `direction` (enum `in`/`out`), `row_ref` (text), `mapped_attempt_id` (fk, nullable), `payload` (jsonb), `status`, `synced_at`.

### 5.11 `users`
`name`, `email` (unique), `role` (enum admin/ops/evaluator/panelist), `active`.

### 5.12 `settings`
Key-value config (§11/§9): fixed assessment days (default Sat/Sun), fixed-slot send time (e.g. Saturday 09:00), reminder offsets (default T-1d, T-2h), React prep window (default 14 days), TR2-fail routing, retry cap, AI prompt versions, integration credentials/sheet IDs/calendar IDs, external final-portal URL.

### 5.13 `audit_log`
`entity`, `entity_id`, `actor_id` (nullable for system), `action`, `before` (jsonb), `after` (jsonb), `at`. Every state transition and automated/AI action writes here.

---

## 6. Stage attempt state machine

Statuses: `availability_requested` · `scheduled` · `awaiting_result` · `under_evaluation` · `evaluated` · `result_shared` · `passed` · `failed`.

| From | To | Trigger | Side effects |
|------|----|---------|--------------|
| (new) | availability_requested | Attempt created | "Ask availability" sent (manual button or auto on entry); enqueue `escalate_no_response`. |
| availability_requested | scheduled | Availability response synced from sheet | Set `chosen_slot`/`scheduled_at`; confirm; enqueue reminders; for TR, book calendar (`calendar_event_id`); enqueue `fixed_slot_send` for the slot day. |
| scheduled | awaiting_result | Fixed-slot send fires / round time passes | React: send the test on the slot day; mark `submitted_at`/`attended_at` when received. |
| awaiting_result | under_evaluation | React submission received / TR panel begins feedback | Assign evaluator (React). |
| under_evaluation | evaluated | Score+remarks saved (React, direct or via scores sheet) / panel feedback submitted (TR) | Set `score`,`result`. |
| evaluated | result_shared | Automatic | Share marks + remarks. On pass: also ask next-round availability + send prep docs. On fail: send retry prep docs. |
| result_shared | passed | `result = pass` | Create next stage attempt; TR2 pass → `selected` + enqueue `redirect_final`. |
| result_shared | failed | `result = fail` | Generate prep artifact; schedule reopen / new attempt (§7 rule 8). |

Transitions are validated server-side (illegal transitions rejected) and written to `audit_log`. UI never sets status directly.

---

## 7. Automation & AI rules (trigger → action)

Each rule is idempotent and logged.

1. **Entry → onboarding.** Offline cleared → create `students` row (upsert on `external_ref`), create first `react` attempt, set status `availability_requested`. *(Auto)*
2. **Ask availability (button or auto).** Ops clicks "Ask availability" (or auto on entry) → send the availability form (with the offered fixed weekend slots) to the student. *(Auto on click)*
3. **Availability sheet sync.** Responses land in the connected availability sheet → sync into the DB, set `chosen_slot`/`scheduled_at`, status → `scheduled`. *(Auto)*
4. **Schedule confirm + reminders + calendar.** On `scheduled` → send confirmation, enqueue reminder job(s); for TR interviews, book the calendar event and include it in the invite. *(Auto)*
5. **Fixed-slot send.** On the slot day at the configured time (e.g. Saturday 09:00) → send the scheduled mail/message carrying the React test (or interview details) to the student. *(Auto, time-triggered)*
6. **Scores sync.** Team enters React scores directly on the portal or in the connected scores sheet → sheet syncs to the DB, status → `under_evaluation` → `evaluated`. *(Manual entry / Auto sync)*
7. **Share + branch.** On `evaluated` → status `result_shared`: share marks + remarks. If pass → ask next-round availability + send prep/guidance docs + create next attempt. If TR2 pass → `selected` + redirect. *(Auto)*
8. **Failure follow-up.**
   - React fail → generate `react_guideline` prep doc, `reopen_at = now + react_prep_days` (default 14), enqueue `reopen_attempt` (new React attempt with a different question set). *(Auto)*
   - TR fail → (after the AI report, rule 10) send retry prep docs, reopen the round per the **TR2-fail routing decision** (§14). *(Auto)*
9. **AI natural-language query.** Ops asks a question → backend sends the schema + question to Claude, which returns a **structured, read-only filter (JSON), not raw SQL**; backend validates against an allowlist of queryable fields, runs a parameterized query, returns the student list, and logs to `ai_query_log`. *(AI, read-only)*
10. **AI TR report (button).** Ops clicks "Generate TR report" → backend collects all of the student's data for that TR (scores, panel feedback, remarks, attempt history), passes it to Claude with the configured prompt/template, receives the report, and saves it to `reports` (with the `source_data` snapshot) attached to the student. Same flow for TR2. *(AI)*
11. **Final redirect.** TR2 pass → `selected`; enqueue `redirect_final` → present the student a handoff link to the external downstream portal; set `final_portal_redirected_at`. *(Auto)*
12. **No-response escalation (optional).** Availability requested but no reply by threshold → flag on the dashboard / notify ops. *(Auto flag)*

---

## 8. AI features (detail)

### 8.1 Natural-language query assistant
- **Input:** free-text question from an authenticated Ops/Admin user.
- **Process:** send a compact schema description + the question to Claude with instructions to output a constrained JSON filter (fields, operators, values) — never executable SQL. Example output for "all students failed in TR1 from bucket A":
  `{ "stage": "tr1", "result": "fail", "bucket": "A" }`
- **Guardrails:** backend validates every field/operator against an allowlist, rejects anything else, and runs only parameterized, read-only queries. No write operations. Log question + validated filter + result_count to `ai_query_log`.
- **Output:** the matching student list, rendered in the roster view; offer CSV export.

### 8.2 TR report generation
- **Trigger:** "Generate TR report" button on a completed TR attempt.
- **Data passed:** the attempt's scores, all `panel_feedback`, remarks, and the student's prior-stage performance — assembled into a single `source_data` payload.
- **Prompt:** an admin-configurable, versioned template (stored in settings) instructing Claude on structure, tone, and the "what went well / what to improve / recommended topics + resources" sections.
- **Output:** markdown report saved to `reports` with `source_data`, `prompt_version`, and `model` for reproducibility; reviewable before sharing.
- **Reuse:** identical flow for TR1 and TR2.

---

## 9. Integrations

- **Sheets (inbound):** an **availability sheet** collects student form responses and syncs to the DB (updates `chosen_slot`/`scheduled_at`); a **scores sheet** lets the team enter React scores that sync to the DB. Both keyed by a row reference for idempotent reconciliation. (Scores may alternatively be entered directly on the portal.)
- **Calendar:** on interview scheduling, create/book a calendar event and store `calendar_event_id`; include it in the candidate invite.
- **Messaging:** email + SMS/WhatsApp behind one pluggable adapter; used for availability requests, confirmations, fixed-slot sends, reminders, results, and prep docs.
- **External final-stage portal:** on `selected`, hand off the student (link + necessary data) to the separate downstream portal.
- **Claude API:** for the NL query assistant and report generation (§8).

Providers for sheets, calendar, and messaging are TBD (§14).

---

## 10. Screens

### Organisation side
1. **Login** (RBAC-gated).
2. **Dashboard** — counts per stage/bucket, actions due (submissions to grade, feedback pending, no-response flags).
3. **Roster / students table** — name+id, bucket, stage, status, score, next step (Auto/Manual/Panel tag); search + filters; **AI query box** at the top.
4. **Student detail** — clean, detailed timeline: every attempt, scores, remarks, panel feedback, generated reports, prep docs; action buttons (ask availability, schedule, generate report, share result); manual overrides (audited).
5. **React evaluation** — open submission, enter score + remarks.
6. **Panel feedback form** — per-competency scores, strengths, weaknesses, recommendation.
7. **Report view** — generated TR report, review + share.
8. **Settings** — fixed slots, send times, reminder offsets, prep window, TR2-fail routing, AI prompt versions, integration config, external portal URL.

### Student side
9. **Availability form** — pick from offered fixed weekend slots.
10. **Test/round page** — receive the test (React) or interview details (TR) on the slot day.
11. **Result page** — marks + remarks; prep/guidance docs.
12. **Redirect** — handoff to the external portal at the final stage.

UI styling: clean, flat, native-feeling tables and forms; the roster table is the centerpiece (a working visual reference exists from the design phase).

---

## 11. Notifications & templates

Templated, variable-driven, logged to `messages`, idempotent per (attempt, template_key):
`availability_request`, `schedule_confirmation`, `fixed_slot_test_send`, `interview_invite` (with calendar event), `reminder`, `result_pass` (+ next-round availability + prep doc), `result_fail_react` (+ guideline), `result_fail_tr` (+ report + prep doc), `selected_redirect`.

---

## 12. Recommended tech stack (confirm or replace)

- **Frontend:** Next.js (App Router) + TypeScript + React; two route groups for org vs student side.
- **Database:** PostgreSQL. **ORM/migrations:** Prisma (or Drizzle).
- **Jobs/scheduler:** durable queue + worker (BullMQ + Redis, or pg-boss) for `scheduled_jobs`; minute-level cron promotes due jobs; supports time-triggered fixed-slot sends.
- **AI:** Anthropic Claude API for NL query + report generation; structured-output prompting; server-side validation.
- **Integrations:** Sheets API, Calendar API, messaging provider — each behind an adapter interface.
- **Auth:** staff via email/password or SSO; candidates via signed magic links.

The stack is a recommendation; the agent may propose alternatives with justification before building.

---

## 13. Build plan (phases)

1. **Schema & migrations** — all tables in §5, enums, constraints, seed, audit plumbing.
2. **State machine** — transition function + guards + tests for every transition in §6.
3. **Entry & roster** — record creation on offline-clear; org-side roster + student detail.
4. **Ask availability + availability sheet sync** — button action, form, inbound sync → `scheduled`.
5. **Scheduling, reminders, fixed-slot send, calendar** — confirmation, reminder jobs, time-triggered sends, calendar booking for TRs.
6. **Scores intake** — direct portal entry + scores sheet sync → evaluation.
7. **Share + branch** — pass/fail handling, marks+remarks sharing, next-attempt creation, prep docs.
8. **Failure follow-ups** — React 14-day guideline + reopen; TR reopen per routing.
9. **AI NL query** — schema-grounded structured filter, validation, roster integration, logging.
10. **AI TR report** — data assembly, configured prompt, save to `reports`, review/share.
11. **Final redirect** — selected → handoff to external portal.
12. **Student side** — availability/test/result/redirect pages via magic links.
13. **Auth, RBAC, audit, hardening** — permissions, timezone handling, job retries, observability.

Each phase ends with passing tests and a migration that runs cleanly from scratch.

---

## 14. Open decisions (confirm before building)

1. **TR2-failure routing.** On a TR2 fail, repeat **TR2** or restart from **TR1**? *(Default to confirm: repeat the failed round.)*
2. **Bucket definition.** Is a bucket a managed list (table) or a free-text label? Where does a student's bucket come from?
3. **Sheets provider & schema.** Which sheet platform (Google Sheets?), the exact columns for the availability and scores sheets, and sync mode (poll vs webhook).
4. **Calendar provider.** Which calendar (Google/Microsoft?) for interview booking.
5. **Messaging provider(s).** Email + SMS/WhatsApp providers for the adapter.
6. **External final-stage portal.** URL and what data/auth the handoff needs.
7. **Fixed slots.** Confirm days (default Sat/Sun) and the fixed-slot send time (e.g. Saturday 09:00).
8. **React auto-grading.** Human-reviewed (default) or auto-scored against tests?
9. **Retry cap.** Max attempts per stage before auto-rejection? *(Default: none; flag after attempt 3.)*
10. **Candidate identity.** Magic links (default) vs full accounts.
11. **Reminder cadence & timezone.** Confirm offsets (default T-1d + T-2h) and timezone.
12. **AI report prompt.** Provide the existing/configured report template to seed `prompt_version`.

---

## 15. Acceptance criteria (definition of done)

- Clearing the offline assessment creates a `students` row and a `react` attempt in `availability_requested`; re-running intake does **not** duplicate it.
- "Ask availability" sends the form; a response in the connected sheet syncs to the DB and moves the attempt to `scheduled`, without manual re-keying.
- On the fixed slot day, the scheduled message carrying the test is sent once at the configured time and is not re-sent on worker restart; reminders fire once per offset.
- For TR interviews, scheduling books a calendar event and stores its id on the attempt.
- Saving a React score (portal or synced sheet) moves the attempt to `evaluated` → `result_shared`: marks + remarks are shared; a pass shares prep docs, asks TR1 availability, and creates a `tr1` attempt; a fail generates a `react_guideline` and reopens React 14 days out with a new attempt.
- Saving TR panel feedback follows the same path; "Generate TR report" assembles the student's TR data, calls Claude with the configured prompt, and saves a `reports` row (with `source_data`) attached to the student; TR2 pass marks `selected` and produces a redirect handoff.
- The AI query box answers "all students failed in TR1 from bucket A" by returning the correct list, using only a validated read-only filter; the question and result are logged to `ai_query_log`; no model-emitted SQL is ever executed directly.
- The org side shows current stage and a clean, detailed last-stage performance view per student; the student side shows results and prep docs.
- Every state transition and automated/AI action appears in `audit_log`.
- Illegal status transitions are rejected server-side, not just hidden in the UI.
- RBAC enforced: evaluators see only assigned submissions; panelists submit feedback only for rounds they ran.

---

*End of PRD (v2).*
