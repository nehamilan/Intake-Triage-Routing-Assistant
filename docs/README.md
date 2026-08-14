---
title: Documentation Index
description: Reading order for the Intake Triage & Routing Assistant product documentation.
---

# Documentation Index

Start with the brief. Everything else here goes deeper on one specific part of it.

## Start here

- **[AI-Product-Brief.md](./AI-Product-Brief.md)** — problem, users, AI decision, guardrails, evaluation, uncertainty handling, human oversight, risks, and trade-offs in one document. Every section links out to the deep-dive doc that covers it in full.

## Product & users

- **[Discovery-and-User-Research.md](./Discovery-and-User-Research.md)** — who this is for, the current-state workflow it replaces, and which assumptions behind the build are still unvalidated.

## The AI decision

- **[Model-Decision-Design.md](./Model-Decision-Design.md)** — what decision the model makes, why it's framed as classification rather than generation or recommendation, and what the model is deliberately never shown.
- **[Prompt-Design.md](./Prompt-Design.md)** — the actual system prompt structure: enum injection, attachment-metadata handling, embargo instructions, confidence calibration.
- **[Output-Guardrails.md](./Output-Guardrails.md)** — the output contract: what the model may return, what it must never return, and how each boundary is enforced in code.
- **[Uncertainty-and-Fallbacks.md](./Uncertainty-and-Fallbacks.md)** — how uncertainty is detected, the confidence thresholds, and seven worked failure scenarios.

## Evaluation & metrics

- **[Evaluation-Framework.md](./Evaluation-Framework.md)** — the full evaluation methodology: AI quality, product, reliability, and cost/latency metrics, dataset requirements, testing tiers, and failure analysis.
- **[Success-Metrics-and-Business-Case.md](./Success-Metrics-and-Business-Case.md)** — how model quality ladders up to a business outcome, a modelled cost/savings case, release gates, and kill criteria.

## Human oversight & risk

- **[Human-in-the-Loop.md](./Human-in-the-Loop.md)** — where humans review, the accept/override/reopen workflows, and what's automated versus what isn't.
- **[Risk-Analysis.md](./Risk-Analysis.md)** — the full risk register with severity/likelihood scoring, implementation evidence, and residual risk per item.
- **[Data-Governance.md](./Data-Governance.md)** — what data is held, the retention and deletion position, and the training-data stance.

## Trade-offs & history

- **[Product-Tradeoffs.md](./Product-Tradeoffs.md)** — ten trade-offs with implementation evidence and the conditions under which each might change.
- **[Decision-Log.md](./Decision-Log.md)** — consequential decisions, the options rejected, and what would reverse each one.

## Operations & launch

- **[Launch-and-Rollout-Plan.md](./Launch-and-Rollout-Plan.md)** — phased exposure from shadow mode to steady state, with exit criteria and rollback triggers per phase.
- **[Operations-Runbook.md](./Operations-Runbook.md)** — ownership, monitored signals, and incident procedures.
- **[Roadmap.md](./Roadmap.md)** — the prioritized backlog, P0 through P3.

## Technical reference

- **[Technical-Architecture.md](./Technical-Architecture.md)** — system design, data flow, model interaction, storage, deployment, and security, with the product reason behind each technical choice.
