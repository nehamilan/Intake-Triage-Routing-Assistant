---
title: AI Product Brief — Intake Triage & Routing Assistant
description: Overview of the problem, users, AI task, and success metrics for a safety-critical intake triage product.
---

# AI Product Brief: Intake Triage & Routing Assistant

## Problem

Organizations that handle regulated intake — research data requests, banking complaints, health records, insurance claims, legal disclosures — face a common bottleneck: every incoming message must be read, classified, routed to the right team, and prioritized by risk. Doing this manually is slow, inconsistent, and error-prone. A misrouted privacy incident or a delayed fraud complaint can become a compliance failure, reputational damage, or harm to a customer.

The product solves this by acting as a **decision-support layer** between the intake channel and the operational teams. It reads the request, proposes a category, route, and priority, and then wraps that proposal in deterministic guardrails and a human review step before anything is finalized.

This same model can easily be adapted for other regulated environments like healthcare, insurance, and legal intake. Two different domains — research data requests and banking complaints — are implemented here as working examples of that portability.

## Users & Roles

| Role | What they do | Access |
|------|--------------|--------|
| **Agent** | Triage new requests, accept or override AI proposals, add reviewer notes, finalize decisions. | Full triage and review UI; queue filters; evaluation page. |
| **Viewer** | Monitor throughput, escalations, and routing distribution. | Read-only dashboard and queue view. No accept/override actions. |
| **Admin / Auditor** (implicit) | Reviews the audit log of revisions, guardrail acknowledgments, and override reasons. | Implemented through the persisted revision history and role table. |

## AI's Job

The AI classifies an incoming request and produces a structured recommendation:

- **Category** — the type of request (e.g., `dataset_inquiry`, `fraud`).
- **Route** — the team or queue that should handle it (e.g., `Curation`, `Fraud`).
- **Priority** — urgency level (`urgent`, `normal`, `low`).
- **Confidence** — a calibrated score from 0 to 1.
- **Reason** — a short, human-readable justification.

The AI does not make final decisions. It produces a **reviewable draft** that must pass deterministic guardrails and, when required, human approval before it becomes operational.

## Inputs & Outputs

**Inputs**

- `requestText`: free-text message from the requester.
- `attachments`: metadata only — file name, type, and size. The model does not read file contents.
- `verticalId`: the active rulebook (`research_data` or `banking_complaints`).

**Outputs**

- `ai_category`, `ai_priority`, `ai_route`, `ai_confidence`, `ai_reason`
- `final_category`, `final_priority`, `final_route` (after human review)
- `status`: `auto_routed`, `escalated_low_confidence`, `escalated_guardrail`, `escalated_privacy_incident`, `escalated_parse_failure`, `overridden`
- `flags`: array of human-readable safety notes (e.g., "Restricted data access without approval — escalated.")
- `reviewer_note` and `reviewer_name`: captured at finalize time for audit.

## Success Metrics

| Metric | Why it matters | Target |
|--------|----------------|--------|
| **Routing accuracy** | % of final_route matching the labeled true_route on the evaluation set. | > 90% |
| **Priority accuracy** | % of final_priority matching true_priority. | > 85% |
| **Category accuracy** | % of final_category matching true_category. | > 85% |
| **Escalation recall** | % of truly risky items correctly sent to human review. | > 95% |
| **Override rate** | % of AI proposals changed by reviewers. Track to detect drift. | < 15% |
| **Mean review time** | Time from intake to finalized decision. | Baseline + trend |

## Non-Goals

- **No fully autonomous routing.** Every output is either above the confidence threshold and free of guardrails, or it goes to human review.
- **No document content extraction.** Attachments are metadata-only in this version; the model does not parse PDFs, images, or spreadsheets.
- **No identity verification.** Authentication gates access, but the product does not verify the requester's identity or authority.
- **No case management beyond triage.** Routing is the boundary; downstream workflow is out of scope.

## Vertical Portability

The product is built around a **rulebook-as-data** pattern. A rulebook defines:

- allowed categories,
- allowed routes per category,
- allowed priorities,
- deterministic guardrail patterns,
- the confidence threshold.

Two rulebooks ship with the product:

1. **Research Data Requests** — dataset access, embargo questions, restricted data, general inquiries.
2. **Banking Complaints** — fraud, billing disputes, account access, general inquiries.

Adding a new domain (healthcare records, insurance claims, legal intake) requires only a new rulebook object and, if needed, new guardrail patterns. The classifier, UI, database schema, and review workflow remain unchanged.
