---
title: AI Product Brief — Intake Triage & Routing Assistant
description: Product brief for a safety-first AI triage assistant for regulated intake, covering problem, decision, guardrails, evaluation, uncertainty, oversight, risks, and trade-offs.
---

# AI Product Brief: Intake Triage & Routing Assistant

## Executive Summary

The Intake Triage & Routing Assistant is a decision-support tool for teams that receive regulated, mixed-risk requests (research data access, banking complaints, and other domains that can be added via a rulebook). An LLM proposes a **category, route, priority, confidence, and reason** for each incoming message. That proposal is sandwiched between two deterministic layers — a pre-check before the model runs and a rulebook-driven `applyRules` layer after — and every proposal is a **reviewable draft**, never a final action. The model never touches attachment contents, never invents categories or routes outside the active rulebook, and never bypasses guardrails. Safety-critical routing does not depend on the model alone.

## Where This Pattern Generalizes

The rulebook is specific to research intake and banking complaints; the pattern underneath it is not. Unstructured input, a closed output vocabulary the model must pick from, and human review triggered by low confidence or a defined risk pattern — that shape holds regardless of domain. The same architecture describes a fintech transaction-monitoring queue: a model flags a suspicious transaction, a rules engine decides whether it's SAR-reportable, an analyst signs off before it's filed. It also describes a security operations triage queue: a model proposes a severity and category for an incoming alert, deterministic correlation rules decide whether it escalates, an analyst confirms before a ticket opens.

Decision rule applied throughout this build: use an LLM when input is unstructured, the output space is constrained, and a wrong answer is recoverable through human review — that's request classification here. Use deterministic rules when the decision is enumerable, legally binding, or must be reproducible in an audit — that's every guardrail, route derivation, and escalation trigger in this system.

## Problem

**What problem does this AI product solve?**

Regulated intake channels receive a firehose of free-text messages that must be read, classified, routed, and prioritized quickly and consistently. Manual triage is slow, inconsistent between reviewers, and prone to two very different failure modes: misrouting a routine request wastes cycle time, while misrouting a privacy incident, fraud report, or restricted-data request becomes a compliance and reputational event. The assistant compresses the read-classify-route step into a structured draft while keeping deterministic safety rules and a human decision in the loop.

## Users and Context

Two roles are implemented in `app_role` (`agent`, `viewer`); a third is planned.

| Role | What they do | Access |
|------|--------------|--------|
| **Agent** | Triage new requests, accept or override AI proposals, add reviewer notes, finalize decisions, run evaluations. | Full triage UI, queue filters, evaluation page. |
| **Viewer** | Monitor throughput, escalations, and routing distribution. | Read-only dashboard |
| **Auditor (future)** | Dedicated read-only view over the revision log, guardrail acknowledgments, and override reasons.| *Not implemented today* — the revision history table exists and is readable by any authenticated user; a dedicated role is on the roadmap. |

Two verticals ship as working rulebooks: **Research Data Requests** and **Banking Complaints**. Users switch verticals at runtime; all queue, dashboard, and evaluation views filter by the active `vertical`.

## AI Capability

The AI performs **single-turn text classification with a structured JSON output**. It is called via the Lovable AI Gateway (`google/gemini-3-flash-preview`) inside a server function protected by Supabase auth and an `agent`-role check. The call uses Vercel AI SDK's `generateText` with `Output.object({ schema })`, where the schema's `category` and `priority` enums are generated from the **active rulebook** — so the wire format itself rejects hallucinated categories.

## Model Decision

**What decision does the model make?**

For each request, the model produces exactly four fields:

- `category` — one value from the active rulebook's categories.
- `priority` — `urgent`, `normal`, or `low`.
- `reason` — one short sentence justifying the classification.
- `confidence` — a self-reported score.

The `route` is **not** chosen by the model. It is derived deterministically from `rulebook.routes[category]` after the response is validated. The model also does not decide whether the item is finalized, escalated, or auto-routed — those states are set by `applyRules` and by the human reviewer.

## Input → Processing → Output Flow

**Inputs**

- `requestText` (1–8000 chars).
- `attachments` — metadata only: `filename`, `mimeType`, `sizeBytes`. File bytes are never read.
- `vertical` — `research` or `banking`, selects the active rulebook.
  
**Processing (the "guardrail sandwich")**

```text
requestText ─▶ [ 1. Deterministic pre-check ]
                  │  privacy-incident triggers  ─▶ short-circuit, skip model
                  │  fraud triggers             ─▶ short-circuit, skip model
                  │  restricted-access-without-approval ─▶ log, still call model
                  ▼
              [ 2. LLM classification ]
                  │  enum-constrained JSON (category, priority, reason, confidence)
                  │  invalid/unparseable      ─▶ parseFailureDecision
                  ▼
              [ 3. Deterministic applyRules ]
                     confidence < threshold, attachment mismatch,
                     embargo without date, access without approval,
                     privacy incident, fraud
                  ▼
              Decision draft ─▶ Human review ─▶ Finalize (accept or override)
                  ▼
              Persisted to `requests` + `request_revisions`
```

**Outputs (persisted per request)**

- `ai_category`, `ai_priority`, `ai_route`, `ai_confidence`, `ai_reason`
- `final_category`, `final_priority`, `final_route`
- `status`: `auto_routed`, `escalated_low_confidence`, `escalated_attachment_mismatch`, `escalated_guardrail`, `escalated_privacy_incident`, `escalated_fraud`, `escalated_missing_embargo_date`, `escalated_parse_failure`, `overridden`
- `flags[]` — human-readable safety notes.
- `reviewer_name`, `reviewer_note`, and a full revision log with field-level diffs and guardrail-bypass acknowledgments.

## Output Boundaries and Guardrails

**What may the model never output?**

- **A category or priority outside the active rulebook.** Enforced by the `z.enum(rb.categories)` / `z.enum(rb.priorities)` schema on the structured-output call. Unknown values → `parseFailureDecision` → Human Review.
- **A route.** The model is not asked for a route; the server maps `category → route` from the rulebook.
- **A finalized decision.** All output is a draft.
- **Any claim derived from attachment contents.** The prompt states the model has not seen file bytes and must not claim to have read them.
- **A same-day embargo release date computed from a duration** (e.g. "6 months"). The prompt forbids inferring dates; only a human curator sets `YYYY-MM-DD`. `applyRules` escalates any embargo mention that lacks an exact date.
- **An auto-route for privacy-incident or fraud text.** The pre-check short-circuits the model entirely for these, and `applyRules` re-forces escalation even if the model returns something else.
- **Free-form text outside the JSON object.** Structured output enforces this.

*Full output contract, hallucination-prevention layers, and known gaps: [Output-Guardrails.md](./Output-Guardrails.md).*

## Evaluation Approach

**How is the system measured?**

Two loops:

1. **Offline evaluation** — the `/evaluation` page (agent-only) accepts a labeled CSV and computes:
   - Routing accuracy, category accuracy, priority accuracy.
   - Per-category confusion matrix.
   - Escalation recall — the share of items labeled risky that the system actually sent to human review.
2. **Operational metrics** — the dashboard tracks live volume, % escalated, % overridden, average AI confidence, and route/priority distributions per vertical.

| Metric | Why it matters | Target |
|--------|----------------|--------|
| Routing accuracy | Are requests reaching the right team on the labeled set? | > 90% |
| Category accuracy | Is the underlying classification correct? | > 85% |
| Priority accuracy | Are we surfacing urgency correctly? | > 85% |
| Escalation recall | Do risky items reach a human? | > 95% |
| Override rate | Drift and prompt/rulebook regression signal. | < 15% |
| Mean review time | Cycle-time impact of the assistant. | Baseline + trend |

*Missing information:* targets above are aspirational for the portfolio build; no production baseline dataset ships in the repo.

*Full evaluation methodology — dataset requirements, testing tiers, failure analysis, and post-launch measurement with rollback stop-conditions: [Evaluation-Framework.md](./Evaluation-Framework.md).*

## Handling Uncertainty

**What happens when the model is unsure?**

Uncertainty is treated as a first-class output, not a failure mode. Three distinct uncertainty paths:

1. **Self-reported low confidence.** `confidence < rulebook.confidenceThreshold` (default 0.7) sets `status = escalated_low_confidence`, rewrites `route` to `Human Review Queue`, and adds a flag naming the threshold. The prompt explicitly instructs the model that a wrong high-confidence answer is worse than a humble low-confidence one.
2. **Structural uncertainty.** Malformed JSON, schema violations, or an unknown category return `parseFailureDecision` with `confidence: 0`, `parseFailed: true`, and a "Model output invalid — routed to human review" flag. The system never accepts a hallucinated category.
3. **Evidence mismatch.** If the request text mentions attachments but none are provided, or an embargo is mentioned without an exact `YYYY-MM-DD` date, the item is escalated regardless of the model's confidence.

Guardrails always override confidence: a high-confidence model output on a privacy-incident or fraud text is still escalated.

*Full detection mechanisms and worked failure scenarios: [Uncertainty-and-Fallbacks.md](./Uncertainty-and-Fallbacks.md).*

## Human Oversight Model

**Where does the human sit in the workflow?**

The human is the decision-maker; the model is a drafter.

- Every AI proposal enters the queue as a **draft** with Accept / Override controls.
- **Override requires a reason.** Overrides that bypass a guardrail additionally require a checkbox acknowledging the safety-rule bypass — this is recorded verbatim in the revision log.
- Accepting an AI proposal does not require a note (the model's `reason` is already stored), but a reviewer note is optional.
- The **Queue collapses to one row per request**; expanding a row shows a full revision timeline with field-level diffs, timestamps, reviewer name, and any guardrail-bypass acknowledgment. New revisions append; nothing is edited in place.
- Reviewer identity comes from the authenticated Supabase session; the `classifyRequest` server function is gated by `requireSupabaseAuth` and an `agent`-role check via `has_role`.

*Full review workflows step-by-step, and the automation/human task balance: [Human-in-the-Loop.md](./Human-in-the-Loop.md).*

## Risks

**What can go wrong?**

| Risk | Where it appears | Mitigation in the build |
|------|------------------|-------------------------|
| Confident-but-wrong classification | Model returns high confidence on an ambiguous request. | Deterministic pre-check + `applyRules` post-check; guardrails override confidence; override rate tracked on the dashboard. |
| Hallucinated category or route | Model invents a value outside the rulebook. | Enum-constrained structured output; unknown category → `parseFailureDecision` → Human Review. |
| Privacy incident auto-routed to the wrong team | Model misclassifies a breach report. | Pre-check short-circuits the model; `applyRules` re-forces escalation. |
| Fraud report deprioritized | Model treats a fraud complaint as a general inquiry. | Banking pre-check + `applyRules` fraud rule; both force urgent + Human Review. |
| Restricted data auto-granted | Model classifies as `restricted_data_access` without approval evidence. | `accessRequiresApproval` guardrail requires stated approval terms or escalates. |
| Embargo set with the wrong release date | Model infers a date from a duration ("6 months"). | Prompt forbids date inference; `applyRules` escalates any embargo mention lacking `YYYY-MM-DD`. |
| Reviewer bypasses a guardrail | Human overrides an escalated draft. | Mandatory override reason + guardrail-bypass acknowledgment checkbox, both persisted to the revision log; reviewable by other agents (and, in the future, a dedicated auditor role). |
| Attachment reference without files | Requester mentions "see attached" but attaches nothing. | `escalated_attachment_mismatch` — flagged and escalated. |
| Model output invalid | JSON parse failure or schema violation. | `escalated_parse_failure`, confidence forced to 0, Human Review. |
| Unauthorized classification | Non-agent tries to call the server function. | `requireSupabaseAuth` middleware + `has_role('agent')` check inside the handler. |
| Attachment content misuse | Model claims to have read a file. | Attachments passed as metadata only; prompt states file bytes were not read. |
| Cross-vertical contamination | Banking rulebook applied to research data or vice versa. | `vertical` persisted per request; queue, dashboard, and evaluation filter strictly by active vertical. |

*Full risk matrix with severity/likelihood scoring, implementation evidence, and residual risk per item: [Risk-Analysis.md](./Risk-Analysis.md).*

## Trade-offs

**What product, technical, or business trade-offs were made?**

- **Safety over throughput.** The default 0.7 confidence threshold and aggressive guardrails deliberately over-escalate. This raises reviewer load in exchange for a much smaller tail of dangerous auto-routes. The threshold lives in the rulebook so it can be tuned per vertical.
- **Deterministic guardrails over prompt-only safety.** Safety rules are code in `applyRules`, not instructions inside the system prompt. Prompts drift; rulebooks are testable. The cost is that adding a new safety rule is a code change, not a prompt tweak.
- **Metadata-only attachments.** The model sees `filename`, `mimeType`, `sizeBytes` — never file contents. This eliminates a large PII/exfiltration surface and keeps the model call cheap and single-turn, at the cost of losing signal that would come from parsing the actual documents.
- **Rulebook-as-data, not per-vertical code.** Adding a new domain (healthcare, insurance, legal) is a new rulebook object plus guardrail patterns — the classifier, UI, database schema, and review workflow do not change. The trade-off is that verticals with very different linguistic shapes may need prompt work as well.
- **Single-model, single-call architecture.** No ensembles, no self-consistency, no retrieval. Cheaper and easier to reason about; leaves accuracy on the table for hard categories.
- **Structured output over free-form JSON parsing.** Enum-constrained schemas kill hallucinated categories at the wire, at the cost of coupling the prompt/schema to the active rulebook (regenerated per call).
- **Append-only revision log over editable records.** Every override creates a new revision with a diff; nothing is mutated in place. Storage grows with review activity — an acceptable cost for audit integrity.
- **Two roles today (`agent`, `viewer`).** A dedicated `auditor` role is deferred to the roadmap; audit history is currently readable by any authenticated user.

*Full trade-off evidence — implementation citations and when each trade-off might change: [Product-Tradeoffs.md](./Product-Tradeoffs.md).*

## Success Criteria

The product is successful when:

- Routing accuracy and escalation recall meet the targets in the Evaluation Approach table, on a representative labeled set for each vertical.
- Override rate stays within the target in the Evaluation Approach table and trends flat or down over time (no silent regression).
- Zero privacy-incident, fraud, or restricted-access items are auto-routed in production — every such item lands in Human Review with a flag.
- Reviewer cycle time is lower than the manual baseline, at equal or better accuracy.
- Every finalized decision is traceable end-to-end: original text, AI draft, guardrail flags, reviewer identity, override reason, and any guardrail-bypass acknowledgment are all present in the revision log.

*Missing information:* the manual-baseline cycle time is not measured in the current build.

## Future Direction

- **Dedicated Auditor role** with a read-only audit surface over the revision log (planned in `docs/Roadmap.md`).
- **Attachment content extraction** (PDF/OCR/spreadsheet parsing) with the same guardrail sandwich around it.
- **Calibration work** on the confidence score — the current threshold assumes the model's self-reported confidence is roughly calibrated; a held-out calibration set would let the threshold be tuned per vertical.
- **Active-learning loop** — feed overrides back into a labeled set that regenerates the evaluation baseline.
- **More verticals** — healthcare records, insurance claims, legal disclosures — as new rulebooks.
- **Multi-model routing / fallback** — cheaper model for high-confidence cases, larger model for ambiguous ones.
- **Reviewer workload analytics** on the dashboard to detect overload or drift by reviewer.

*Full prioritized backlog (P0 ship-blockers through P3 operational maturity): [Roadmap.md](./Roadmap.md).*
