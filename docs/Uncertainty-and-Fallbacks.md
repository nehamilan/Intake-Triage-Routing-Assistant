---
title: Uncertainty & Fallbacks
description: How the system behaves when the model is uncertain, unparseable, or unavailable.
---

# Uncertainty & Fallbacks

## Confidence Threshold

The system treats confidence as a decision signal, not a vanity metric. Any classification with a confidence score below **0.7** is escalated to human review. This threshold is explicit, consistent across both shipped verticals, and easy to tune with evaluation data.

When an item is escalated for low confidence, the AI's proposed category and route are still stored and displayed to the reviewer as a starting point. The reviewer can accept it, override it, or send it elsewhere.

## Parse Failures

Large language models can return malformed JSON, hallucinate a category, or produce a route that does not exist in the rulebook. The system handles this with a dedicated fail-safe path:

- The response is parsed inside a `try/catch`.
- The category is checked against the rulebook whitelist.
- The route is verified against `RULEBOOK.routes[category]`.
- Any failure produces `escalated_parse_failure`, final route `Human Review Queue`, confidence `0`, and a flag explaining the issue.

A parse failure is treated as a safety event, not a UI bug. It is logged, surfaced to the reviewer, and counted in the escalation-reasons table on the Dashboard.

## Network Failures

If the server function fails to reach the model provider, the UI shows a non-technical error message and a **Retry** button. The request is not silently dropped. The triage button enters a disabled loading state while the call is in flight, and the result panel shows a shimmer skeleton to set expectations.

For batch processing, rows are processed sequentially. If one row fails, the error is surfaced but earlier successful rows remain visible. This prevents a single network hiccup from invalidating an entire evaluation run.

## Model Hallucinations

The two most common hallucination risks are mitigated:

- **Invented categories** — blocked by the category whitelist.
- **Invented routes** — blocked by the rulebook route lookup.
- **Overconfident unsafe outputs** — overridden by deterministic guardrails.

If the model returns a valid category but an incorrect route, the post-check corrects the route to the rulebook value. If the model returns an invalid category entirely, it becomes a parse failure.

## Short-Circuit Escalations

The pre-check layer can skip the model entirely when a privacy-incident pattern is detected. This is the strongest fallback: no model call means no chance of the model misclassifying a high-risk request. The result is deterministic, fast, and fully auditable.

Short-circuit paths are:

- Privacy incident language → `escalated_privacy_incident`.
- Restricted access without approval → `escalated_guardrail` (model still called for context).
