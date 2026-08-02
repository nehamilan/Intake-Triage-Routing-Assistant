---
title: Uncertainty & Fallbacks
description: How the Intake Triage & Routing Assistant detects uncertainty, fails safely, and decides when to escalate to human review.
---

# Uncertainty & Fallbacks

The Intake Triage & Routing Assistant treats uncertainty as a first-class signal, not a bug. Every request passes through a **deterministic pre-check → LLM classification → deterministic post-check** pipeline (the "guardrail sandwich"). At each layer the system can decide the model's answer is too risky to act on and route the item to a human reviewer instead.

This document explains how uncertainty is detected, what thresholds trigger action, and what happens in each fallback path.

## 1. How uncertainty is detected

Uncertainty is detected in three independent ways:

### 1.1 Self-reported low confidence

The LLM returns a `confidence` score between `0` and `1`. The active rulebook defines a `confidenceThreshold` (currently `0.7` for both research and banking verticals). Any classification below that threshold is treated as uncertain, regardless of whether the category looks reasonable.

The prompt explicitly instructs the model to prefer a low-confidence answer over a wrong high-confidence guess:

> "If the message is ambiguous, short, or plausibly fits several categories, return a LOW confidence (<= 0.6) rather than guessing. A wrong high-confidence answer is worse than a humble low-confidence one."

### 1.2 Structural uncertainty (parse failures)

After the model responds, the server attempts to parse the output as JSON and validate it against a Zod schema. Structural uncertainty occurs when:

- The response is not valid JSON.
- The `category` is not one of the allowed enum values for the active rulebook.
- The `priority` is not one of the allowed priorities.
- The `confidence` is outside `[0, 1]`.
- The chosen category has no mapped route in `rulebook.routes`.

These failures are caught in a `try/catch` block and converted to a safe fallback decision with `parseFailed: true` and `confidence: 0`.

### 1.3 Evidence mismatch

Even a high-confidence, structurally valid response can be uncertain if the text contradicts the metadata supplied:

- **Attachment mismatch:** The request text uses words like "attached", "enclosed", or "see attached", but no attachments were provided.
- **Embargo without a date:** The request mentions an embargo but does not include an exact `YYYY-MM-DD` release date.
- **Restricted access without approval:** The request asks for restricted/sensitive data but does not mention approval, ethics review, IRB clearance, or similar authorization.

These are detected by deterministic text scans in `applyRules`, not by the LLM.

## 2. Confidence thresholds

| Threshold | Value | Behavior |
|-----------|-------|----------|
| Confidence gate | `< 0.7` | Escalate to human review as `escalated_low_confidence`. |
| Parse failure | `confidence = 0` | Escalate as `escalated_parse_failure`. |
| Pre-check incident | `confidence = 1` (placeholder) | Short-circuit the model and escalate as `escalated_privacy_incident` or `escalated_fraud`. |

The `0.7` threshold is stored in the rulebook so it can be tuned per vertical. It was chosen deliberately to over-escalate rather than auto-route borderline cases in safety-sensitive intake.

## 3. Fallback behavior

When any uncertainty signal fires, the system performs the same safe fallback:

1. **Route is rewritten to `Human Review Queue`.**
2. **Status is set to an `escalated_*` value** that names the reason.
3. **A human-readable flag is added** to the decision card and persisted to the revision log.
4. **The item appears in the Queue** with an "Accept" / "Override" control so a reviewer can finalize or correct it.

The fallback statuses are:

- `escalated_low_confidence`
- `escalated_parse_failure`
- `escalated_attachment_mismatch`
- `escalated_missing_embargo_date`
- `escalated_guardrail` (restricted access without approval)
- `escalated_privacy_incident`
- `escalated_fraud`

Only items with status `auto_routed` are considered finalized without human touch.

## 4. When the system should refuse

The system refuses to auto-route (i.e., it always escalates) when any of the following are true:

- The request text matches privacy-incident patterns such as "breach", "exposed", "accidentally uploaded", "patient names", or "personal data".
- The request text matches fraud patterns such as "fraud", "unauthorized", "stolen card", "identity theft", or "phishing".
- The model's confidence is below `0.7`.
- The model output is invalid, unparseable, or names an unknown category.
- The request asks for restricted data access without evidence of approval.
- The request mentions attachments but none were provided.
- The request mentions an embargo but lacks an exact `YYYY-MM-DD` release date.

In all of these cases the system **does not trust the model** and forces a human review.

## 5. When it should ask for more information

*Current implementation:* The system does **not** automatically ask the requester for clarification. Instead, it escalates to an internal human reviewer who can either:

- Chase missing attachments,
- Request an exact embargo date from the requester, or
- Ask for approval documentation before granting restricted access.

This keeps the assistant a single-turn, deterministic tool and places the judgment call with a human. A future improvement could add an outbound "clarification requested" state that pauses the item and notifies the requester, but that workflow is not implemented today.

## 6. When it should escalate to humans

Escalation is the default response to uncertainty. The system escalates in two phases:

### 6.1 Pre-check escalation (before the model runs)

The riskiest signals are caught before the LLM is called, so a model failure cannot hide them:

- **Privacy incident:** Short-circuit the model entirely; return `escalated_privacy_incident`, urgent priority, and route to Human Review Queue.
- **Fraud incident:** Short-circuit the model entirely; return `escalated_fraud`, urgent priority, and route to Human Review Queue.
- **Restricted access without approval:** Log the hit, still call the model for category and reason, but force `escalated_guardrail` downstream.

### 6.2 Post-check escalation (after the model runs)

`applyRules` re-evaluates the model's draft against deterministic rules:

- Confidence below threshold → `escalated_low_confidence`
- Attachment mention with no files → `escalated_attachment_mismatch`
- Embargo without exact date → `escalated_missing_embargo_date`
- Restricted access without approval → `escalated_guardrail`
- Privacy/fraud patterns still present in text → override route and priority to Human Review Queue / urgent

Guardrails always override confidence: a high-confidence model output on a privacy or fraud request is still escalated.

## 7. Examples of failure scenarios

### Scenario A: Low-confidence classification

**Input:** "Hi, I have a question about my deposit."  
**Model output:** `category: general_inquiry`, `confidence: 0.55`  
**Result:** `escalated_low_confidence`. Route becomes Human Review Queue. Flag: "Confidence 55% is below threshold 70% — human review required."

### Scenario B: Hallucinated category

**Input:** "Please help me fix a 500 error on the download page."  
**Model output:** `category: account_access` (not in the research rulebook)  
**Result:** `escalated_parse_failure`. Confidence forced to `0`. Flag: "Model output invalid — routed to human review."

### Scenario C: Privacy incident short-circuit

**Input:** "I accidentally uploaded a spreadsheet with patient names exposed."  
**Pre-check:** Matches "accidentally uploaded" and "patient names".  
**Result:** Model is skipped. `escalated_privacy_incident`, urgent priority, Human Review Queue. Flag: "Suspected privacy incident — mandatory human handling."

### Scenario D: Missing attachments

**Input:** "Please find the IRB approval attached."  
**Attachments:** None provided.  
**Result:** `escalated_attachment_mismatch`. Flag: "Request references attachments but none were provided — chase the missing files before routing."

### Scenario E: Embargo without exact date

**Input:** "I want to embargo this deposit for 6 months."  
**Embargo detection:** "6 months" is a relative duration, not a `YYYY-MM-DD` date.  
**Result:** `escalated_missing_embargo_date`. Flag: "Embargo mentioned (\"for 6 months\") but no exact release date — curator must confirm anchor and set YYYY-MM-DD."

### Scenario F: Restricted access without approval

**Input:** "I need access to the restricted sensitive dataset."  
**Model output:** `category: restricted_data_access`, `confidence: 0.85`  
**Guardrail check:** Text contains "access", "restricted", and "sensitive" but no approval terms.  
**Result:** `escalated_guardrail`. Flag: "Access request without stated approval — must not be auto-granted."

### Scenario G: Network or provider failure

**Input:** Any valid request.  
**Failure:** The LLM provider returns an error or times out.  
**Result:** `escalated_parse_failure`. Confidence `0`. The UI shows a non-technical error message and a **Retry** button. The request is not silently dropped.

## Summary

Uncertainty in this system is not suppressed — it is surfaced, labeled, and routed to a human. The design principle is:

> **When in doubt, escalate.**

The combination of pre-check rules, a confidence threshold, schema validation, and post-check guardrails ensures that unsafe or unclear classifications never become finalized auto-routes.
