---
title: Product Tradeoffs
description: Explicit design tradeoffs made to prioritize safety, auditability, and portability over throughput.
---

# Product Tradeoffs

## Safety Over Throughput

The product intentionally routes fewer items automatically than it theoretically could. A request with 0.69 confidence is escalated even if a human might have routed it correctly. The goal is to avoid high-cost routing errors, not to maximize automation rate.

**Implication:** Reviewers see more escalations than a pure throughput-optimized system. This is acceptable because the target domain is regulated intake, where the cost of a wrong route is high.

## Rulebook as Data

Categories, routes, priorities, and guardrail patterns live in a configuration object rather than being hard-coded in the prompt or model. This makes the product portable across domains but adds a maintenance burden: someone must keep the rulebook aligned with organizational structure.

**Implication:** Adding a new vertical does not require retraining or prompt engineering, but it does require domain expertise to define the rulebook correctly.

## Metadata-Only Attachments

The model sees attachment names, types, and sizes but not contents. This avoids document parsing complexity, reduces token costs, and limits exposure of sensitive document contents to the model provider.

**Implication:** The system cannot verify claims made about attachments. If a request says "see the spreadsheet for patient names," the model can flag the mention but cannot confirm the contents.

## Single Model

The current implementation uses one model (Gemini 1.5 Flash via the Lovable AI Gateway). This keeps the architecture simple and costs predictable but creates a single point of failure and a single source of bias.

**Implication:** Future versions should support model fallback, ensemble scoring, or A/B testing without changing the rulebook layer.

## Free-Text Reviewer Identity

Reviewer names are captured as free text at finalize time rather than being auto-populated from the authenticated session. This allows flexibility (e.g., a supervisor finalizing on behalf of a trainee) but weakens the audit link between the action and the authenticated user.

**Implication:** The current design trusts agents to enter accurate names. A stricter environment would bind reviewer identity to the auth session and allow delegation only through explicit role assignments.
