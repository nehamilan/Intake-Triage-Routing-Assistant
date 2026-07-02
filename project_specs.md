# Project Specs — Intake Triage & Routing Assistant

_A decision-support tool that reads an incoming request and proposes a category, priority, routing destination, one-line reason, and confidence score. Low-confidence and high-risk requests escalate to a human review queue instead of auto-routing. A human reviews every decision and can override it._

---

## 1. Vision

Give a regulated intake operation (starting vertical: **research data repository requests**) a **reviewed first draft** for every incoming message. The system proposes; a human disposes. Safety-critical decisions are reserved for humans by rule, not by capability.

## 2. Users

- **Agent** — reviews the proposed triage, accepts or overrides, drains the queue.
- **Viewer** (Tier 3+) — read-only access to dashboard and history.

## 3. Inputs

- **Tier 1–2**: free-text intake message pasted into a textarea. Optional "Load sample requests" button seeds 12 hardcoded realistic messages.
- **Tier 3**: CSV upload for evaluation with columns `message, true_category, true_priority, true_route`.

## 4. Workflows

### 4.1 Single-item triage
1. User pastes a message and clicks **Triage**.
2. (Tier 2+) Deterministic **pre-checks** scan for privacy-incident / no-approval-access signals — high-risk cases can short-circuit the model.
3. **Classifier** produces `{ category, priority, route, reason, confidence }`.
    - Tier 1: local `mockClassify()` using keyword heuristics against the rulebook.
    - Tier 2+: server-side function calling the LLM via Lovable AI Gateway with strict-JSON output constrained to the rulebook vocabulary.
4. **Rules layer** `applyRules(decision, requestText)` runs in deterministic code and can override the classifier:
    - **Confidence gate** — `confidence < rulebook.confidenceThreshold` → `Human Review Queue`, status `escalated_low_confidence`.
    - **Guardrail A — access without approval** — restricted-data signals AND text lacks `approval|ethics|IRB|clearance` → `Human Review Queue`, status `escalated_guardrail`, flag "Access request without stated approval — must not be auto-granted."
    - **Guardrail B — suspected privacy incident** — text mentions `breach|exposed|accidentally uploaded|patient names|personal data` → `Human Review Queue`, urgent, status `escalated_privacy_incident`, flag "Suspected privacy incident — mandatory human handling."
    - (Tier 2) **Parse-failure guardrail** — malformed / off-vocabulary model output → `Human Review Queue`, status `escalated_parse_failure`.
5. **Decision Card** renders the proposal with color-coded priority, prominent status badge, flag callouts, confidence bar.
6. Reviewer clicks **Accept** or opens **Override** (dropdowns bound to rulebook) and confirms.
7. Finalized item is pushed into the queue.

### 4.2 Batch triage
"Load sample requests" seeds 12 messages covering every category, including: restricted-access WITH approval, restricted-access WITHOUT approval, suspected privacy incident, vague/low-confidence, urgent deadline. "Triage all" runs the full pipeline per row.

### 4.3 Evaluation (Tier 3)
Upload labeled CSV → run full pipeline → compute routing accuracy, priority accuracy, category accuracy, confusion matrix, and — the number that matters — escalation recall on the high-risk subset. Downloadable results.

## 5. Rulebook (data, not code)

Held in `src/lib/rulebook.ts`. A different vertical is a different JSON, not a different app.

- `vertical: "research_data_requests"`
- `categories`: `restricted_data_access, deposit_assistance, metadata_curation, technical_platform, licensing_rights, preservation_format, general_inquiry`
- `routes`: map from category → `Compliance | Curation | Infrastructure | General Support`
- `priorities`: `urgent | normal | low`
- `confidenceThreshold: 0.7`

Tier 3 adds a second rulebook (`banking_complaints`) and a runtime switcher to prove portability.

## 6. Outputs

Per request, the system produces three logically distinct objects (all persisted in Tier 3):

- **AI decision** — `{ category, priority, route, reason, confidence }`
- **Rules outcome** — `{ finalRoute, status, priority, flags[] }`
- **Reviewer decision** — `{ finalCategory, finalPriority, finalRoute, wasOverridden, reviewerNote?, timestamp }`

## 7. Tools & stack

- **Frontend framework**: TanStack Start (React 19), Tailwind v4, shadcn/ui, bun.
- **Runtime**: Cloudflare Workers (Lovable's server runtime).
- **Backend (Tier 2+)**: Lovable Cloud (Supabase-managed) + **Lovable AI Gateway** for the LLM call. The model key is a server env var; the browser never sees it.
- **Persistence (Tier 3+)**: Lovable Cloud Postgres. In-memory only in Tier 1.
- **Auth (Tier 3+)**: Lovable Cloud Auth with `agent` / `viewer` roles enforced by a `user_roles` table + `has_role()` security-definer function + RLS policies.
- **Charts (Tier 3+)**: Recharts.

## 8. Storage

- **Tier 1**: in-memory only (`processedQueue` in a React hook). No database, no localStorage.
- **Tier 3**: Postgres `requests` table storing `id, created_at, request_text, ai_category, ai_priority, ai_route, ai_confidence, ai_reason, final_category, final_priority, final_route, status, flags jsonb, was_overridden, reviewer_note`.

## 9. Deployment

- Lovable Publish → Cloudflare Workers. The stable preview URL and published URL are provided by the platform.
- **This project does NOT use the GitHub Pages / `pnpm` / `gh-pages` flow** described in the general `instructions.md`; that section targets a Vite-only stack and doesn't apply here.
- **No deployment without explicit confirmation.** The agent will not click Publish until the user says so per prompt.

## 10. Non-negotiables (all tiers)

- Guardrails and the confidence gate live in **deterministic code**, never in the model. Safety-critical logic is not movable into a prompt.
- Model output is validated against the rulebook; malformed or off-vocabulary responses fail **safely into human review**, never into a wrong auto-route.
- Rulebook is data. Categories and routes are never hardcoded into components.
- Strict TypeScript, no `any`. Explicit interfaces for `Decision`, `RulesOutcome`, `QueueItem`, `Rulebook`.
- No secrets in the browser. No API keys in client code.
- Every finalized decision records whether it was overridden — the override log is the future training signal.

## 11. Definition of Done

### Tier 1 (MVP 1 — mock, no backend)
- Pasting a message + Triage renders a Decision Card with all 5 fields, priority badge, status badge, confidence bar.
- No-approval restricted-access sample **always** escalates to Human Review with the correct flag.
- Privacy-incident sample **always** escalates as urgent with the correct flag.
- Short/ambiguous text falls below threshold and routes to Human Review, not to a team.
- Accept + Override both write to the in-memory queue with `was_overridden` recorded correctly.
- "Triage all" processes 12 seeded samples; Queue shows escalated vs auto-routed counts.
- Zero API calls, zero secrets, zero persistence.

### Tier 2 (real LLM, safe failure)
- Model call happens server-side; key never in the browser bundle.
- Strict-JSON output validated against the rulebook; parse or vocabulary failure → `escalated_parse_failure`.
- Deterministic pre-checks run **before** the model for the two highest-risk patterns.
- Loading skeleton on the Decision Card during async classification; graceful error UI on network failure.
- All Tier 1 guardrails and confidence-gate behavior still pass.

### Tier 3 (enterprise layer)
- Postgres-backed queue survives reload; Queue view has filters (status / route / priority).
- Auth with `agent` / `viewer` roles enforced via `has_role()` + RLS. Server function is auth-gated.
- Dashboard: volume-by-category bar, routing donut, auto-vs-escalated stacked-over-time, KPI cards, escalation-reasons table.
- Evaluation page: CSV upload → routing/priority/category accuracy + confusion matrix + **escalation recall on high-risk subset**, downloadable as CSV.
- Dark-mode toggle (persisted), rulebook switcher (research_data_requests ↔ banking_complaints), toast on save/override, accessible badge contrast.

## 12. Change discipline

- Build **one prompt at a time**; verify the described behavior in the preview before starting the next prompt.
- The rulebook, guardrails, review workflow, and queue behavior stay **identical across all tiers** — later tiers only swap plumbing.
- Update this file and `prompts.md` whenever a major new decision lands.
