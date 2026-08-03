---
title: Hiring-Manager Review
description: An AI Product Lead's assessment of this repository — what it demonstrates, where it reads as a developer demo, and what was added to close the gaps.
---

# Hiring-Manager Review

This document is deliberately adversarial. It is written as if an AI Product Lead were
reviewing the repository for a portfolio screen, scoring it against the competencies that
actually separate an AI PM from an engineer who shipped an LLM feature.

Scoring: **Strong** (portfolio-differentiating) / **Adequate** (present, unremarkable) /
**Gap** (missing or asserted without evidence).

## Scorecard

| Competency | Verdict | Basis |
|---|---|---|
| Problem framing | Strong | Problem is framed as *cost of a wrong auto-route in a regulated intake operation*, not "classify tickets with AI". The inversion — model as proposer, rulebook as decider — is stated and then actually implemented. |
| AI decision design | Strong | The decision is scoped to a closed vocabulary (`rulebook.ts`), the route is derived from the category rather than emitted by the model, and the failure mode of every layer is defined. |
| Responsible AI thinking | Strong | Deterministic pre-checks short-circuit privacy incidents *before* the model sees them; malformed output fails into `escalated_parse_failure`; overrides of safety rules require an explicit acknowledgement that is persisted. |
| Evaluation strategy | Adequate → improved | A working accuracy harness exists (`/evaluation`) with confusion matrix and escalation recall. What was missing: target thresholds, a release gate, and what happens when a metric regresses. Addressed in [Success-Metrics-and-Business-Case](./Success-Metrics-and-Business-Case.md). |
| Human oversight | Strong | Every decision is a draft until a human finalizes it; append-only revisions with per-field diffs, reviewer identity, and mandatory justification on override. |
| Risk awareness | Strong | Risk register is tied to code paths rather than generic LLM-risk boilerplate. |
| Product trade-offs | Strong | Ten trade-offs documented with what was sacrificed, not just what was chosen. |
| Technical understanding | Strong | Architecture doc is written from the code, including corrections to its own earlier stale claims. |

## Where it read as a developer demo

These were the real gaps. Each is now addressed by a named document; none were fixed by
adding features to the app.

1. **No discovery trail.** The problem statement was asserted, not evidenced. There was no
   record of who the users are, what their current workflow costs, or which assumptions
   remain unvalidated. A hiring manager reads an unevidenced problem statement as a
   rationalisation written after the code. → [Discovery-and-User-Research](./Discovery-and-User-Research.md),
   which states the user model *and labels every unvalidated assumption as such*.

2. **No baseline and no numbers.** "Mis-routing has real consequences" with no estimate of
   how often it happens today, what it costs, or what improvement would justify the build.
   Evaluation measured model accuracy but never connected it to a business outcome.
   → [Success-Metrics-and-Business-Case](./Success-Metrics-and-Business-Case.md).

3. **No launch thinking.** The product jumped from "built" to "roadmap". Nothing about
   shadow mode, phased exposure, who signs off, or the rollback trigger — which is the
   single most telling omission for a regulated AI product.
   → [Launch-and-Rollout-Plan](./Launch-and-Rollout-Plan.md).

4. **No operational ownership.** A system that escalates to humans needs someone watching
   the escalation rate, an on-call path when the gateway is down, and a defined response to
   a bad-routing incident. → [Operations-Runbook](./Operations-Runbook.md).

5. **No data governance.** Free-text intake in a regulated domain is stored in Postgres with
   no stated retention period, deletion path, or position on whether prompts may be used
   for training. → [Data-Governance](./Data-Governance.md).

6. **No decision archaeology.** The docs described the end state, so every choice looked
   inevitable. The interesting PM signal is the option that was rejected and why.
   → [Decision-Log](./Decision-Log.md).

## What still does not exist, stated plainly

Honesty about scope is itself a signal, so the limits are recorded rather than hidden:

- No production deployment, so every operational number in these docs is a target or an
  estimate, never a measurement. They are labelled accordingly.
- No real users have used this system; the user model is derived from domain reasoning, not
  from interviews.
- The labeled evaluation set is small and author-generated, so reported accuracy is a smoke
  test, not a quality claim.
- Attachment contents are never read; classification uses filenames and MIME types only.
- The Auditor role is designed but not implemented.

## How to read this repository in ten minutes

1. [`src/lib/rulebook.ts`](../src/lib/rulebook.ts) — the closed vocabulary. The whole product
   thesis is that this file, not the model, decides where things go.
2. [`src/lib/classify-request.functions.ts`](../src/lib/classify-request.functions.ts) — the
   pre-check layer, the model call, and safe parsing.
3. [`src/lib/apply-rules.ts`](../src/lib/apply-rules.ts) — the post-check layer where every
   escalation status is produced.
4. [AI-Product-Brief](./AI-Product-Brief.md) → [Model-Decision-Design](./Model-Decision-Design.md)
   → [Output-Guardrails](./Output-Guardrails.md) for the product reasoning behind them.
