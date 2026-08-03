# Intake Triage & Routing Assistant

A **reviewed first draft** for every incoming request in a regulated intake operation. An LLM proposes a category, priority, routing destination, one-line reason, and confidence score. Deterministic rules run **before and after** the model to catch safety-critical cases. A human reviews every decision and can override it, with a full audit log.

Two verticals ship in the box — **research data requests** and **banking complaints** — to demonstrate that the same architecture powers different regulated domains by swapping a rulebook, not by rewriting code. The same pattern extends naturally to **healthcare intake, insurance claims, legal case intake, HR ER cases**, and any other domain where mis-routing has real consequences.

---

## Why this exists

In regulated environments, the cost of a wrong auto-route is not a bad user experience — it is a compliance incident. Existing "AI triage" tools optimize for throughput and treat the model's answer as the answer. This project inverts that:

- **The model is a proposer, never a decider.** Routing is derived from a rulebook, not free-form model output.
- **Safety-critical routes never depend on the model alone.** Privacy incidents, restricted-data access without approval, embargo mentions without dates, and low-confidence outputs are caught in deterministic code that runs on both sides of the model call.
- **Every decision is auditable.** Original AI proposal, reviewer identity, timestamp, per-field diff, and — for safety-rule overrides — an explicit acknowledgement checkbox are persisted as an append-only revision log.

---

## The architecture: guardrail sandwich

```text
   free-text request + attachment metadata
                    │
                    ▼
   ┌────────────────────────────────┐
   │  1. Deterministic PRE-checks   │  ← privacy-incident patterns short-circuit the model
   └────────────────────────────────┘
                    │
                    ▼
   ┌────────────────────────────────┐
   │  2. LLM classifier             │  ← strict-JSON, constrained to rulebook vocabulary
   │     (Lovable AI Gateway)       │
   └────────────────────────────────┘
                    │
                    ▼
   ┌────────────────────────────────┐
   │  3. Deterministic POST-rules   │  ← confidence gate, guardrails, embargo, parse-failure
   └────────────────────────────────┘
                    │
                    ▼
        Decision Card → Human review → Persisted revision
```

Layers 1 and 3 are pure functions with no network calls, no model dependency, and full test coverage via the Evaluation page. If the model is down, hallucinating, or returns malformed JSON, the request fails safe into the Human Review Queue — never into a wrong auto-route.

---

## Adapting to a new domain

**A new vertical is a new rulebook, not a new app.** To add e.g. `healthcare_intake`:

1. Add a rulebook object to `src/lib/rulebook.ts`:
   - `categories` — the closed vocabulary the model must pick from (`symptom_report`, `medication_question`, `records_request`, …).
   - `routes` — the map from category → team (`Clinical Triage`, `Records`, `Pharmacy`, `Human Review Queue`).
   - `priorities` and `confidenceThreshold` (default `0.7`).
   - `guardrails` — pattern lists for privacy incidents and restricted-data-without-approval that apply to your domain (PHI leak language, minor's records without guardian consent, controlled substance requests, etc.).
2. Register it in the `RULEBOOKS` map and add a label to the header vertical switcher.
3. If the domain has date-bound obligations analogous to embargoes (release dates, HIPAA disclosure deadlines), extend `src/lib/embargo.ts` or add a sibling detector — the post-rules layer picks it up automatically.
4. Seed `src/lib/sample-requests.ts` with realistic domain examples covering each category and each guardrail.
5. Upload a labeled CSV to the **Evaluation** page to measure routing/priority/category accuracy and — the number that matters — **escalation recall** on the high-risk subset.

No changes to the classifier, the review UI, the persistence layer, the dashboard, or the auth model are required. The two shipped verticals (`research_data_requests`, `banking_complaints`) are the reference implementation of this pattern.

---

## Feature surface

- **Triage view** — paste a request, attach mock files, get a Decision Card with status badge, confidence bar, flagged guardrails, and embargo details.
- **Queue** — one row per request with an internal revision timeline (v1, v2, v3…), per-field diffs, reviewer name, timestamp, and (for safety-rule overrides) an acknowledgement record. Sortable by time and priority; filterable by status, route, priority, and vertical.
- **Dashboard** — KPI cards, category volume, routing distribution, auto-routed vs escalated over time, escalation-reason breakdown. All metrics scoped to the active vertical.
- **Evaluation** — upload labeled CSV, run the full pipeline, get accuracy per axis + confusion matrix + escalation recall, download results.
- **Roles** — `agent` (triage + review) and `viewer` (read-only dashboard). Server functions enforce auth; RLS enforces it at the database.
- **Vertical switcher, dark mode, keyboard submit, toast notifications, accessible badges.**

---

## Tech stack

- **TanStack Start v1** on Vite 7, React 19, TypeScript, Tailwind v4
- **Lovable Cloud** (Postgres + Auth + RLS) for persistence and identity
- **Lovable AI Gateway** (Gemini-1.5-Flash) for the classifier — swappable via one server file
- **Recharts** for the evidence layer
- **shadcn/ui** primitives

Deterministic layers (`apply-rules.ts`, `embargo.ts`, pre-check patterns in `classify-request.functions.ts`, `rulebook.ts`) are plain TypeScript with no framework coupling and could be extracted as a package.

---

## Local development

```bash
bun install
bun run dev            # http://localhost:8080
bun run build          # production build
```

Environment: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, and `LOVABLE_API_KEY` (server-only) are provisioned by Lovable Cloud when the project is connected. Self-hosting requires providing equivalents.

---

## Repository map

```text
src/
  lib/
    rulebook.ts                  ← the closed vocabulary — this is what you edit per vertical
    classify-request.functions.ts← server function: pre-checks + LLM call + safe parsing
    apply-rules.ts               ← deterministic post-rules (confidence, guardrails, embargo, parse-failure)
    embargo.ts                   ← YYYY-MM-DD extractor used by Guardrail C
    queue-db.ts                  ← persistence + revision log
    sample-requests.ts           ← domain fixtures
  routes/
    index.tsx                    ← triage + queue
    dashboard.tsx                ← evidence layer
    evaluation.tsx               ← accuracy harness
    auth.tsx, _authenticated/    ← identity + role gates
  components/
    AuthGate.tsx, AccountMenu.tsx, ui/ (shadcn)
PRODUCT_ANALYSIS.md              ← case-study writeup (problem, users, risks, trade-offs, roadmap)
project_specs.md                 ← full spec, tier by tier
```

---

## What this project is not

- Not a general-purpose classifier — it deliberately constrains the model to a rulebook to make wrong answers detectable.
- Not a replacement for human reviewers — it is a decision-support layer measured by how well it protects them from routine work while surfacing the risky items.
- Not a "trust the AI" product — the entire architecture is designed so that a failed, slow, or hallucinating model degrades to human review, never to a wrong auto-route.

For the full case study (problem framing, user model, risk analysis, trade-offs, roadmap), see [`PRODUCT_ANALYSIS.md`](./PRODUCT_ANALYSIS.md).

## Product documentation

Full product documentation lives in [`docs/`](./docs/README.md) — problem framing, discovery
and unvalidated assumptions, decision design, guardrails, evaluation and release gates,
launch and rollout, operations runbook, data governance, risk register, trade-offs, and a
decision log of the options that were rejected.

Start with the [Hiring-Manager Review](./docs/Hiring-Manager-Review.md), which scores the
project against AI product competencies and states plainly what is built, what is only
designed, and which claims remain unvalidated.

