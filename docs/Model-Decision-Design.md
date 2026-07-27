---
title: Model Decision Design
description: How the classification model is scoped, constrained, and mapped to operational decisions.
---

# Model Decision Design

## Task Shape

The model performs a constrained, multi-output classification over a short free-text input:

- **Category classification** — pick one label from a closed list defined by the active rulebook.
- **Route selection** — map the chosen category to an allowed destination team.
- **Priority assignment** — pick one of `urgent`, `normal`, or `low`.
- **Confidence estimation** — return a scalar between 0 and 1 representing the model's certainty.
- **Reasoning** — return a concise justification the reviewer can read.

This is deliberately not a generative or open-ended task. The output is forced into a JSON schema so downstream rules can validate it deterministically.

## Model Inputs

The model receives:

- `requestText`: the raw intake message.
- `verticalId`: which rulebook is active.
- `categories`: the allowed category labels for that rulebook.
- `routes`: the allowed route labels for that rulebook.
- `priorities`: the allowed priority labels.
- `attachment metadata`: file names, types, and sizes (no contents).

No user identity, history, or organizational context is passed. This keeps the decision local to the request and reduces the risk of leaking information across cases.

## Model Outputs

The model must return a single JSON object:

```json
{
  "category": "dataset_inquiry",
  "route": "Curation",
  "priority": "normal",
  "confidence": 0.91,
  "reason": "The request asks about availability of a public dataset and does not mention restricted data or embargo."
}
```

All fields are required. The downstream system validates:

- `category` is in the allowed list.
- `route` is the rulebook-mapped route for that category.
- `priority` is in the allowed list.
- `confidence` is a number between 0 and 1.

If any validation fails, the request is escalated as a parse failure rather than routed automatically.

## Category-to-Route Mapping

Routes are not inferred by the model. They are looked up from the rulebook based on the model's category:

```ts
const route = RULEBOOK.routes[category];
```

This prevents the model from inventing teams or sending a request to a destination that does not exist. It also makes the mapping auditable: a reviewer can open the rulebook and see exactly why `dataset_inquiry` maps to `Curation`.

## Confidence as a Signal

Confidence is used as a safety signal, not as a probability of correctness. The system uses a fixed threshold of **0.7**:

- `confidence >= 0.7` and no guardrails triggered → `auto_routed`.
- `confidence < 0.7` → `escalated_low_confidence`.

Guardrails can override a high-confidence output. A confident but unsafe recommendation is still escalated.

The threshold is configurable per rulebook in principle, but the shipped rulebooks share 0.7 to keep behavior consistent during evaluation.

## What the Model Does Not See

To reduce attack surface and privacy risk, the model is intentionally blind to:

- **Attachment contents** — only names, types, and sizes are shown.
- **Full file system paths** — only file names are exposed.
- **Other requests in the queue** — each classification is stateless.
- **Reviewer identity or history** — the model does not personalize outputs.

This means the model cannot make decisions based on document contents or cross-request patterns. If those become necessary, they should be added as separate, explicitly governed capabilities rather than quietly expanding the prompt.
