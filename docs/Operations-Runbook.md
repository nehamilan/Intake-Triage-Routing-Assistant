---
title: Operations Runbook
description: Who owns the system in production, what is monitored, and the response procedure for each failure mode.
---

# Operations Runbook

Written against the implemented behaviour of `classify-request.functions.ts`,
`apply-rules.ts`, and `queue-db.ts`. Where a capability does not exist yet, it is marked
**[NOT IMPLEMENTED]** rather than described as if it did.

## Ownership

| Area | Owner |
|---|---|
| Pipeline availability, gateway errors | Engineering on-call |
| Queue health, escalation backlog, SLA | Operations lead |
| Guardrail coverage, audit exports, incident reporting | Compliance owner |
| Prompt, rulebook, thresholds | Product, with compliance sign-off on rulebook changes |

## What is watched

Currently visible on `/dashboard`: volume, routing distribution, escalation reasons,
auto-routed vs escalated over time, average confidence, override rate.

**[NOT IMPLEMENTED]** — alerting. Every threshold below is a manual review item until
alerting is built; that gap is a P1 on the [Roadmap](./Roadmap.md).

| Signal | Normal | Investigate | Page |
|---|---|---|---|
| Parse-failure rate | < 1% | > 3% over an hour | > 20% — model or gateway is broken |
| Escalation rate | 20–35% | ±10 points day over day | > 60% — everything is falling into human review |
| Override rate | 10–25% | > 35% for two days | — |
| Average confidence | Stable | Sudden shift of >0.1 | — |
| Classification latency | < 5 s | > 15 s p95 | Timeouts visible to agents |

A sudden confidence shift with unchanged input mix usually means the model behind the
gateway changed. That is a release event even though nothing in this repository changed, and
it is why the evaluation set must be re-run on a schedule, not only on deploy.

## Incident procedures

### AI gateway is down or erroring

Failure is already safe by construction: the server function returns an escalation rather
than a guess, and the UI surfaces a retry with a non-technical message.

1. Confirm the error class (429 rate limit, 402 credits exhausted, 5xx upstream).
2. For 402, restore credits — the user-visible symptom is every request escalating.
3. Announce degraded mode to agents: everything routes to human review; the queue is a plain
   worklist until the gateway returns.
4. No rollback is needed. Do **not** relax the confidence threshold to compensate.

### Parse-failure spike

Every affected request is already `escalated_parse_failure` with confidence 0 and no route.

1. Sample the raw responses; determine whether the model changed or the prompt was edited.
2. Revert the prompt if it was edited; otherwise pin or switch the model in
   `ai-gateway.server.ts`.
3. Re-run the labeled evaluation set before declaring recovery.

### A mis-route reached a downstream team

The highest-severity operational event.

1. Retrieve the request's full revision history — AI proposal, reviewer, timestamp, diff, and
   any guardrail acknowledgement.
2. Classify the cause: model error the human accepted (anchoring), guardrail gap, or reviewer
   override.
3. Guardrail gap → add a deterministic pattern the same day; a fix that only edits the prompt
   is not an acceptable remedy for a safety miss.
4. Anchoring → the Phase 1 rollback trigger in [Launch-and-Rollout-Plan](./Launch-and-Rollout-Plan.md) applies.
5. Add the request to the labeled evaluation set so the regression is permanently guarded.

### Suspected privacy incident inside a request body

Pre-checks short-circuit the model for privacy-incident language, so the text should never
have reached the gateway. Verify that in the record, then follow the organisation's incident
policy. See [Data-Governance](./Data-Governance.md) for the deletion path.

### Escalation backlog grows

Not a system fault — it is the intended pressure valve, and it must not be relieved by
weakening the gate.

1. Check the escalation-reason breakdown. Low-confidence-dominated means a model or prompt
   issue; guardrail-dominated means the input mix changed.
2. Staff the queue or narrow an over-broad guardrail pattern with compliance approval.
3. Never raise throughput by lowering the confidence threshold under backlog pressure.

## Routine cadence

| Cadence | Activity |
|---|---|
| Daily | Escalation backlog and oldest-urgent check |
| Weekly | Override-reason review; feed corrections into the labeled set; report changes to agents |
| Monthly | Full evaluation run; guardrail review with compliance; calibration check |
| Quarterly | Rulebook review; retention purge; access review of `agent` / `viewer` assignments |
