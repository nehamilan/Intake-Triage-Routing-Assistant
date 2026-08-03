---
title: Documentation Index
description: Reading order for the Intake Triage & Routing Assistant product documentation.
---

# Documentation Index

Start with the [Hiring-Manager Review](./Hiring-Manager-Review.md) — it scores the project
against AI product competencies, names the gaps honestly, and points to the document that
addresses each one.

## Problem and decision

| Doc | What it answers |
|---|---|
| [AI Product Brief](./AI-Product-Brief.md) | What problem, for whom, and what the system is prohibited from doing |
| [Discovery and User Research](./Discovery-and-User-Research.md) | Users, current-state baseline, and which assumptions remain unvalidated |
| [Model Decision Design](./Model-Decision-Design.md) | What the model is asked to decide, and why classification over generation |
| [Decision Log](./Decision-Log.md) | The consequential choices, the options rejected, and what would reverse each |

## Responsible AI

| Doc | What it answers |
|---|---|
| [Output Guardrails](./Output-Guardrails.md) | Constraints on model output and how they are enforced |
| [Uncertainty and Fallbacks](./Uncertainty-and-Fallbacks.md) | Detection of uncertainty, thresholds, refusal, and escalation |
| [Human in the Loop](./Human-in-the-Loop.md) | Review points, override mechanics, and automation boundaries |
| [Risk Analysis](./Risk-Analysis.md) | Prioritised risk register tied to code paths |
| [Data Governance](./Data-Governance.md) | Data inventory, egress, retention, training position, and gaps |

## Measurement and operations

| Doc | What it answers |
|---|---|
| [Evaluation Framework](./Evaluation-Framework.md) | How quality is measured across five layers |
| [Success Metrics and Business Case](./Success-Metrics-and-Business-Case.md) | Targets, release gates, cost model, and kill criteria |
| [Launch and Rollout Plan](./Launch-and-Rollout-Plan.md) | Shadow mode through steady state, sign-offs and rollback triggers |
| [Operations Runbook](./Operations-Runbook.md) | Ownership, monitoring, and incident procedures |

## Build

| Doc | What it answers |
|---|---|
| [Technical Architecture](./Technical-Architecture.md) | System, data flow, storage, deployment, security |
| [Prompt Design](./Prompt-Design.md) | System prompt, enum injection, calibration guidance |
| [Product Trade-offs](./Product-Tradeoffs.md) | What was optimised and what was sacrificed |
| [Roadmap](./Roadmap.md) | Shipped, next, and deferred |

**Evidence status:** the system has no production deployment. Documents distinguish
implemented behaviour (written from code) from targets, estimates, and unvalidated
assumptions, which are labelled inline.
