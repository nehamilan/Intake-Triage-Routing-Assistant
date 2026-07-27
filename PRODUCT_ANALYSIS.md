# Intake Triage & Routing Assistant — Product Analysis

*An AI PM case study of a shipped, safety-critical classification product. Written for hiring readers evaluating product judgment, not code style.*

---

## TL;DR

- **Problem.** Regulated intake teams have to categorize, prioritize, and route incoming free-text requests. A wrong route on a privacy incident or a restricted-data request is a compliance failure — not just a UX bug.
- **AI's job.** One narrow, enum-constrained classification call per request: pick a category, a priority, and write a one-sentence reason with a self-reported confidence. Nothing else.
- **Safety design.** The AI is sandwiched between two layers of deterministic code — pre-checks that can skip the model entirely, and post-checks that can override it — so no safety-critical routing depends on the model alone.
- **Evidence layer.** A live dashboard and a labeled-CSV Evaluation page exist as first-class product surfaces, because "the model feels good" is not an answer a regulated operator can give an auditor.

---

## 1. The problem

A research data repository (the seed vertical) receives messages that mix seven very different jobs: deposit help, metadata curation, licensing questions, technical incidents, restricted-data access requests, preservation format questions, and general chit-chat. Two things about this workload matter:

1. **The volume is boring and the tails are dangerous.** Most requests are routine and would be fine if a keyword bot handled them. A small minority — a leaked patient list, an access request that skipped IRB approval, a suspected fraud report on the banking vertical — are the ones the operation cannot afford to get wrong.
2. **Auto-routing an LLM's guess is not acceptable.** An LLM that is right 92% of the time is a compliance liability, because the 8% it gets wrong includes the cases with named individuals, embargoed data, or regulatory exposure.

The product's insight: **the scarce resource being protected is not agent time — it is correct handling of the high-risk minority.** Everything about the design follows from that.

The reframe: **the AI produces a reviewed first draft, not a decision.** A human always finalizes. The system is judged on how reliably it (a) auto-routes the easy cases and (b) *refuses to auto-route* the dangerous ones.

## 2. Users and jobs-to-be-done

| User | Role in the system | What they come to do |
|---|---|---|
| **Agent** | `agent` role, enforced via `user_roles` + `has_role()` + RLS | Drain the queue: accept the AI's draft, or override and log why. |
| **Viewer** | `viewer` role, structurally read-only | Watch the operation without being able to change it (compliance, oversight). |
| **Auditor / PM** *(implicit)* | Not a login — the Dashboard and Evaluation pages | Prove the product works, catch drift, defend the routing logic. |

The `agent` and `viewer` split is not cosmetic. Viewers cannot write because the database policies say so, not because a button is hidden.

## 3. What the AI actually does (and what it deliberately doesn't)

The AI performs **one narrow classification call per request**. That's the whole surface area.

- **Task shape.** Single-shot classification + a short justification. No agent loop, no tools, no streaming, no chat.
- **Output constraint.** A JSON object whose `category` is validated against the active rulebook's enum. Anything off-vocabulary is treated as a hard failure.
- **What the AI does not choose.** The **route** (e.g. "Compliance", "Fraud", "Curation") is *not* picked by the model. It is looked up deterministically from `rulebook.routes[category]`. The AI is not trusted with the mapping from "what is this?" to "who handles this?" — that mapping is data.
- **What the AI does not see.** User identity, prior queue history, override history, attachment bytes, embargo dates. It's a stateless classifier.

This is a deliberately small AI job. Almost every non-trivial product decision is made by rules around it.

## 4. Inputs and outputs contract

### Model inputs

| Input | Notes |
|---|---|
| `requestText` (1–8,000 chars) | The user-pasted message. |
| Attachment **metadata only** | Filename, MIME type, size. The prompt explicitly forbids claiming the bytes were read. |
| Rulebook enums | Categories and priorities are injected into the system prompt; the model cannot invent new ones. |
| Vertical id | Selects which rulebook (research vs banking). |

### Outputs per request (three logically distinct objects, all persisted)

| Object | Fields | Who writes it |
|---|---|---|
| **AI decision** | `category, priority, route, reason, confidence, parseFailed?` | The model call. |
| **Rules outcome** | `finalRoute, status, flags[], priority, embargo` | Deterministic code in `applyRules`. |
| **Reviewer decision** | `finalCategory, finalPriority, finalRoute, wasOverridden, reviewerNote?, guardrailAcknowledged, timestamp, reviewer` | A human. Appended as a new revision — never an in-place update. |

## 5. The safety architecture — a guardrail sandwich

```text
  requestText ──▶ [ deterministic PRE-checks ]
                       │
                       ├─ privacy incident?  ─▶ short-circuit, urgent, Human Review
                       ├─ suspected fraud?   ─▶ short-circuit, urgent, Human Review
                       │
                       ▼
                  [ LLM classifier ]  (enum-constrained JSON)
                       │
                       ▼
                  [ deterministic POST-checks ]
                       │
                       ├─ parse failure?         ─▶ Human Review, confidence 0
                       ├─ confidence < 0.7?      ─▶ Human Review
                       ├─ attachments mentioned but missing?  ─▶ Human Review
                       ├─ embargo without exact date?         ─▶ Human Review
                       ├─ restricted access without approval? ─▶ Human Review
                       │
                       ▼
                    auto_routed  (only if every check passes)
```

There are **eight escalation statuses**, and every one routes to the Human Review Queue regardless of what the model said. The design principle stated in code: *safety-critical routing never depends on the model alone.*

Two enforcement points (pre and post) for the highest-risk patterns is deliberate redundancy. It's more code to maintain, and it means either layer can fail without the safety property failing.

## 6. Human-in-the-loop by construction

- **The AI never writes `final_*` fields.** A human clicking Accept or Override is the only path into the finalized state.
- **Revisions are append-only.** The `request_revisions` table denies `UPDATE` and `DELETE` at the RLS layer. v1 is immutable; a reopened decision becomes v2, v3, etc.
- **Overrides require a reason.** Accepts don't (the AI's `reason` field already justifies it) — this is an intentional friction gradient.
- **Bypassing a guardrail is a distinct action.** Overriding *any* decision needs a reason; overriding a decision that fired a safety guardrail requires a **separate acknowledgment checkbox**. The audit log distinguishes "reviewer disagreed with the model" from "reviewer knowingly bypassed a safety rule." Those are different events for different reasons.
- **Viewer read-only is enforced by the database, not the UI.** Hiding buttons is not a security control.

The revision log is also the substrate for a future training signal — every override is a labeled datum saying "the model got this wrong in this specific way."

## 7. Failure catalog — what can go wrong, and what already stops it

| Failure mode | Mitigation in code today |
|---|---|
| Model hallucinates a category not in the enum | Schema validation fails → `parseFailureDecision` → Human Review, confidence 0. |
| Model is confidently wrong on a safety-critical case | Deterministic pre-checks short-circuit the model; post-checks override it regardless of confidence. |
| Model is overconfident on ambiguous short text | System prompt instructs low confidence on ambiguity; `confidence < 0.7` forces Human Review. |
| Model claims to have read an attached PDF | Prompt explicitly states "you have NOT seen the file bytes." The model only receives metadata. |
| Model invents an embargo release date from a phrase like "6 months" | Prompt forbids computing dates. `detectEmbargo()` is the only date source; an embargo mention without an exact `YYYY-MM-DD` escalates. |
| Silent model or network failure | `try/catch` wraps the call, returns a parse-failure decision instead of crashing the request. |
| A message says "see attached IRB approval" but no file is uploaded | `escalated_attachment_mismatch` — routed to a human to chase the missing file. |

## 8. Trade-offs the current implementation makes

- **Safety over throughput.** Every failure mode above resolves to "send it to a human." The intended consequence is a high human-review rate. That's the trade the product makes on purpose.
- **Rulebook as data, not as prompt.** Categories and routes are enum-validated in code and injected into the prompt. Adding a category is a code change + redeploy, not a runtime toggle. This buys auditability at the cost of operational agility.
- **Duplicate enforcement of the highest-risk patterns.** Privacy and fraud keyword lists live in both the pre-check and the post-check paths. Two places to keep in sync; two places that must both fail to leak a bad routing.
- **Fixed 0.7 confidence gate.** Simple and legible. Not learned from the Evaluation page's outputs. No feedback loop from real overrides back into thresholds.
- **Attachments are metadata-only.** Cheap, private, fast — and blind to whether `irb_approval.pdf` actually contains an IRB approval. The attachment-mismatch guardrail helps but does not verify content.
- **Single model, single provider** (Gemini via Lovable AI Gateway). No fallback, no ensemble, no cross-model agreement check.
- **Reviewer identity is a free-text field.** *What* changed and *why* are rigorously logged; *who* is soft — it's whatever the reviewer typed.
- **Revision log is unbounded.** Great for audit today; needs a retention policy at scale.
- **Evaluation is offline and manual.** CSV upload, run once, download results. No continuous eval, no drift alert.
- **Two-vertical portability is partial.** Research and banking share one pipeline, but the `Rulebook` type hardcodes the *shape* of guardrails (`privacyIncident`, `fraud`, `accessRequiresApproval`, `embargoRequiresDate`). A third vertical with a new guardrail class is a code change, not a data change.

## 9. The evidence layer

An AI product that cannot show its numbers is not shippable into a regulated context. Two surfaces exist for exactly this reason:

- **Dashboard.** Volume by category, routing distribution across teams, auto-routed vs escalated over time, and KPI cards for total requests, % escalated, % overridden, and average confidence.
- **Evaluation page.** Upload a labeled CSV; the full pipeline runs on every row; the app reports routing accuracy, priority accuracy, category accuracy, a confusion matrix, and — the number that actually matters — **escalation recall on the high-risk subset**. Downloadable as CSV.

Escalation recall is the KPI the product should be judged on. Auto-routing accuracy is a secondary metric; refusing to auto-route the dangerous minority is the primary one.

## 10. Roadmap — known limits and next versions

Prioritized by risk-reduction per unit of work. Each item: **problem → proposal → success metric.**

### P0 — Ship-blockers for a real regulated customer

- **Calibrated confidence gate.** Fixed 0.7 is a guess. → Learn per-category thresholds from the labeled Evaluation set; recompute weekly. **Success:** escalation recall on the high-risk subset ≥ 0.98 while auto-route rate on the routine subset improves by ≥ 10%.
- **Identity-bound reviewer.** Free-text `reviewer` is not audit-grade. → Bind reviews to `auth.uid()` + display name; make the revision log tamper-evident (append-only + hash chain). **Success:** every revision provably attributable to a specific authenticated user.

### P1 — Continuous quality

- **Continuous evaluation & drift monitoring.** → Run the Evaluation set nightly against the live model; alert when routing accuracy, category accuracy, or escalation recall drops by more than a defined delta. **Success:** median time-to-detect a regression < 24h.
- **Override-driven learning loop.** → Mine `request_revisions` diffs to (a) propose rulebook edits, (b) generate few-shot examples for the prompt. Nothing auto-applies. **Success:** override rate on the top-5 override categories drops month-over-month.
- **Multilingual and paraphrase-robust guardrails.** English substring matching is bypassable by a rewording. → Replace with a small embedding-based classifier for the pre-check patterns. **Success:** escalation recall holds on an adversarial paraphrase test set.

### P2 — Capability expansion

- **Attachment content extraction (opt-in Tier 4).** → Optionally read PDFs/images for the attachment-mismatch and IRB-verification guardrails. Explicit privacy trade-off; requires per-tenant consent. **Success:** false-positive rate on attachment-mismatch drops without new privacy incidents.
- **Model diversity & fallback.** → Second provider for availability; cross-model disagreement as an extra escalation signal. **Success:** provider outage no longer blocks triage; disagreement-triggered escalations catch real errors > noise.
- **Rulebook guardrail plugins.** → Turn guardrails into a registered plugin registry so a new vertical is truly zero-code. **Success:** onboarding a third vertical requires only a rulebook file + a plugin registration, no changes to `applyRules`.

### P3 — Operational maturity

- **Retention & summarization.** Revision-log lifecycle policy; per-request summarization for long-lived items. **Success:** query performance on the queue stays flat as history grows past 1M rows.

## 11. What this project is meant to demonstrate

For the reader evaluating this as an AI PM portfolio piece:

1. **Product framing over model framing.** The scarce resource is correct handling of the dangerous minority, not agent throughput. Every design choice — the guardrail sandwich, the append-only revisions, the acknowledgment checkbox — falls out of that.
2. **Safety-critical decisions are held outside the model.** The LLM does the one job it is good at (fuzzy classification), and no more. Routing, gating, and escalation are deterministic code that a regulator can read.
3. **Evidence is a product surface, not an afterthought.** The Dashboard and Evaluation pages exist because a regulated operator has to be able to answer "how do you know?"
4. **Trade-offs are named, not hidden.** Sections 8 and 10 are the point of the document: this system optimizes for one thing at the explicit cost of others, and the next version knows what to fix first.
5. **Portability is proven, not claimed.** Two verticals share one pipeline. The remaining coupling (guardrail shape) is called out and scheduled.
