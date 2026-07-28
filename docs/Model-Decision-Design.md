---
title: Model Decision Design
description: What decision the AI makes, how it makes it, and where deterministic rules override it.
---

# Model Decision Design

This document answers a single question: **what decision does the AI system make, and why is it scoped this way?**

## Decision Type

**Classification** — with a small structured-extraction component.

Considered and rejected:

| Type | Why not |
|---|---|
| **Generation** | The output must be auditable and enum-constrained. Free text would defeat routing. |
| **Recommendation** | Implies a ranked list. Intake has one destination per request. |
| **Ranking** | Same as above — there is a single winner, not an ordered list. |
| **Prediction** | No temporal or numeric target; the label space is fixed by the rulebook. |
| **Transformation** | We are not rewriting the request, only labeling it. |
| **Extraction** | Used *within* the classifier (embargo date, attachment references), but not the primary decision. |

The model performs **multi-label constrained classification** — one category, one priority, plus a self-reported confidence and a short reason string. Route is not classified; it is deterministically derived from the category via the rulebook.

**Product reasoning:** intake triage is fundamentally a "which bucket does this belong in?" problem. Framing it as classification makes evaluation tractable (accuracy, confusion matrix, per-class recall) and makes the output shape safe to consume programmatically. A generation framing would have been faster to prototype but impossible to measure against a labeled set.

## Decision Inputs

The model sees, per request:

- `requestText` — the raw intake message (free text).
- `verticalId` — which rulebook is active (`research_data` or `banking_complaints`).
- `categories`, `routes`, `priorities` — the allowed label sets for that rulebook.
- `attachment metadata` — file names, types, sizes. **Never file contents.**

The model does **not** see:

- Requester identity, tenure, or history.
- Other queue items or prior decisions.
- Reviewer identity.
- Attachment contents or file paths.

**Product reasoning:** every input widens the attack surface and the bias surface. Identity would enable disparate treatment. Cross-request context would let one poisoned request contaminate others. Attachment contents would require a separate data-handling regime (PHI, PII). We add inputs only when a specific decision demonstrably needs them.

## Decision Process

The decision is a three-stage sandwich. The model sits in the middle; deterministic rules bracket it on both sides.

```text
requestText
     │
     ▼
┌────────────────────────────────────┐
│ 1. Deterministic pre-check         │
│    - Privacy incident patterns     │  → short-circuit escalate
│    - Restricted-access patterns    │  → force guardrail flag
└────────────────────────────────────┘
     │
     ▼
┌────────────────────────────────────┐
│ 2. LLM classification (Gemini)     │
│    - Enum-constrained JSON output  │
│    - category, priority,           │
│      confidence, reason            │
└────────────────────────────────────┘
     │
     ▼
┌────────────────────────────────────┐
│ 3. Deterministic post-check        │
│    - Schema + enum validation      │
│    - Confidence threshold (0.7)    │
│    - Embargo date check            │
│    - Attachment-reference check    │
│    - Route lookup from rulebook    │
└────────────────────────────────────┘
     │
     ▼
final decision + status
```

Stage 1 catches the highest-severity signals (breach, exposure) even if the model fails or is unreachable. Stage 3 catches malformed or unsafe outputs before they reach a routing team.

**Product reasoning:** safety-critical routing must never depend on the model alone. A single failure mode in the model must not translate to a wrong auto-route. The sandwich makes each layer independently auditable.

## Decision Output

The model returns a single validated JSON object:

```json
{
  "category": "dataset_inquiry",
  "route": "Curation",
  "priority": "normal",
  "confidence": 0.91,
  "reason": "Asks about a public dataset; no restricted data or embargo mentioned."
}
```

After post-checks, the system attaches a **status** that determines what happens next:

| Status | Meaning | Destination |
|---|---|---|
| `auto_routed` | Confident, no guardrails triggered | Mapped team |
| `escalated_low_confidence` | Confidence below 0.7 | Human Review Queue |
| `escalated_guardrail` | Restricted-access without approval | Human Review Queue |
| `escalated_privacy_incident` | Breach / exposure language | Human Review Queue (urgent) |
| `escalated_embargo_missing_date` | Embargo mentioned without a `YYYY-MM-DD` date | Human Review Queue |
| `escalated_missing_attachments` | Text references files not attached | Human Review Queue |
| `escalated_parse_failure` | Model output invalid or unparseable | Human Review Queue |

**Product reasoning:** the status is what humans actually consume. It compresses "what the model said" + "what the rules said" into a single label a reviewer can filter and prioritize on.

## Confidence Considerations

Confidence is a **safety signal**, not a calibrated probability. Concretely:

- **Threshold: 0.7** — below this, the request escalates regardless of the model's stated reason.
- **Guardrails outrank confidence** — a confident (0.95) but unsafe classification still escalates.
- **Confidence is self-reported** — the model produces it; we do not currently calibrate it against outcomes.
- **Parse failure = confidence 0** — a malformed response is treated as maximally uncertain.

Known limitations, documented honestly:

1. **LLM confidence is not calibrated.** A 0.9 from the model does not mean 90% accuracy. The threshold is a policy choice, not a statistical guarantee.
2. **No abstention token.** The model cannot say "I don't know." Low confidence is the closest proxy.
3. **Threshold is global.** Every category shares 0.7. High-stakes categories arguably deserve a higher bar; this is a roadmap item.

**Product reasoning:** treating confidence as *policy* rather than *probability* is intentional. It means the threshold is defensible to a compliance reviewer ("we escalate anything below 0.7") without over-claiming statistical properties we have not proven.

## Where Incorrect Decisions Could Create Harm

Ordered by severity:

1. **Missed privacy incident** — a breach report gets auto-routed to a general queue and sits for hours instead of triggering incident response. **Mitigation:** deterministic pre-check runs *before* the model.
2. **Restricted-data request auto-approved via routing** — a request for restricted data lands in a fulfillment queue without approval review. **Mitigation:** guardrail forces escalation even on high model confidence.
3. **Wrong team, no escalation** — a request is confidently misclassified and routed to a team that cannot action it. **Mitigation:** confusion matrix in the Evaluation page surfaces systematic misroutes; humans can override and the override is logged as ground truth for future prompt tuning.
4. **Priority inflation / deflation** — everything routed as `urgent` desensitizes teams; everything routed as `low` buries real urgency. **Mitigation:** priority is in the eval set; distribution is visible on the Dashboard.
5. **Reviewer bypass** — a human overrides a guardrail escalation without proper cause. **Mitigation:** override requires a written reason; guardrail bypass additionally requires an explicit acknowledgment checkbox, and both are stored in the immutable revision log.

## Where Deterministic Rules Override the Model

The model is **never** the final authority on:

| Concern | Deterministic rule |
|---|---|
| **Route destination** | Looked up from `RULEBOOK.routes[category]`. Model cannot invent a team. |
| **Allowed labels** | `category` and `priority` must be in the enum. Anything else = parse failure. |
| **Privacy-incident signals** | Pattern match on `breach`, `exposed`, `accidentally uploaded`, `patient names` → escalate regardless of model. |
| **Restricted-access without approval** | Pattern match forces guardrail flag even at high confidence. |
| **Embargo without a date** | Regex requires `YYYY-MM-DD` when embargo language is present. |
| **Referenced-but-missing attachments** | Text mentions "attached", but no file was actually attached → escalate. |
| **Confidence threshold** | Hard 0.7 cutoff; the model does not decide whether to escalate itself. |
| **Schema validity** | Malformed JSON, extra fields, or unparseable output → escalate as parse failure with confidence 0. |

**Product reasoning:** anything a regulator or auditor might ask "how do you guarantee X?" about must be deterministic. A model can be part of the *evidence* for a decision, but it cannot be the *guarantee*. Every rule above corresponds to a specific harm we do not want to explain away after the fact.

---

## Summary

The AI makes one narrow decision — **which category (and therefore which team) and which priority does this intake request belong to?** — and returns a confidence and reason to support human review. Everything safety-critical (routing map, escalation triggers, output shape) is enforced by code, not by the model. This is what makes the system defensible, measurable, and portable across verticals.
