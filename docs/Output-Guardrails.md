---
title: Output Guardrails
description: Deterministic pre-checks and post-checks that wrap the model and fail safe to human review.
---

# Output Guardrails

## Guardrail Sandwich

Safety-critical routing never depends on the model alone. The pipeline is structured as:

```
Deterministic Pre-Checks → LLM Classifier → Deterministic Post-Checks
```

This "sandwich" ensures that the riskiest signals are caught before the model runs, and that the model's output is validated before it becomes operational.

## Pre-Check Layer

Before the LLM is called, the request text is scanned with simple, deterministic rules:

- **Privacy incident patterns** — phrases like "breach", "exposed", "accidentally uploaded", "patient names".
  - Action: **short-circuit**. Skip the model entirely.
  - Result: `escalated_privacy_incident`, `urgent`, `Human Review Queue`.
  - Rationale: privacy incidents are high-stakes and low-volume. A deterministic escalation removes any chance of the model downplaying the issue.

- **Restricted-access-without-approval patterns** — phrases indicating the requester wants restricted data but has not provided approval.
  - Action: **still call the model** for category and reason, but force a guardrail escalation regardless of confidence.
  - Result: `escalated_guardrail` with a flag like "Restricted data access without approval — escalated."

## Post-Check Layer

After the model responds, the following checks run in order:

1. **JSON parse check** — if the response is not valid JSON, mark `escalated_parse_failure`.
2. **Schema validation** — verify the object has `category`, `route`, `priority`, `confidence`, and `reason`.
3. **Category whitelist** — `category` must be in the rulebook's allowed list.
4. **Route validation** — `route` must equal `RULEBOOK.routes[category]`.
5. **Priority whitelist** — `priority` must be in `urgent`, `normal`, `low`.
6. **Confidence gate** — `confidence < 0.7` triggers `escalated_low_confidence`.
7. **Embargo date check** — if the text mentions an embargo without an exact `YYYY-MM-DD` date, escalate.

Any failure routes the request to the `Human Review Queue` with a descriptive flag.

## Escalation Statuses

| Status | Trigger | Final route |
|--------|---------|-------------|
| `auto_routed` | Confidence >= 0.7 and no guardrails. | Rulebook route |
| `escalated_low_confidence` | Model confidence below 0.7. | Human Review Queue |
| `escalated_guardrail` | Restricted-access or embargo rule hit. | Human Review Queue |
| `escalated_privacy_incident` | Privacy incident pre-check hit. | Human Review Queue |
| `escalated_parse_failure` | Invalid JSON, missing fields, or invalid category/route. | Human Review Queue |
| `overridden` | Reviewer changed the AI proposal. | Reviewer's chosen route |

## Fail-Safe Parsing

If the model returns malformed JSON, an invalid category, or a route that does not match the rulebook, the system does not crash and does not accept the output. It returns:

```ts
{
  status: "escalated_parse_failure",
  finalRoute: "Human Review Queue",
  confidence: 0,
  flags: ["Model output invalid — routed to human review."]
}
```

This is a deliberate fail-safe: a broken or hallucinated model response can never auto-route into the wrong queue.

## Confidence Gate

The 0.7 confidence threshold is the primary uncertainty gate. It is simple, inspectable, and easy to tune with evaluation data. Items below the threshold are not "wrong"; they are "not certain enough to route automatically." That distinction is important for reviewer trust and for auditability.
