---
title: Success Metrics and Business Case
description: Baseline assumptions, target thresholds, release gates, cost model, and the conditions under which this product should be shut down.
---

# Success Metrics and Business Case

**All numbers here are targets or modelled estimates, not measurements.** Nothing has run in
production. The purpose of the document is to show what would be measured and what would be
done about each result — the part usually missing from an AI demo.

## The metric tree

```text
Business outcome:   fewer mis-routes, faster time-to-route, no compliance incidents
        ▲
Product outcome:    agents accept most drafts; risky items always surface
        ▲
Model quality:      category / priority accuracy, escalation recall, calibration
        ▲
System reliability: parse-failure rate, latency, gateway availability
```

Model accuracy is never reported on its own. An accuracy number that does not move an
outcome metric is a demo artefact.

## Layer 1 — Model quality (measured by `/evaluation`)

| Metric | Definition | Target | If it misses |
|---|---|---|---|
| Escalation recall | Of requests labelled high-risk, the share the pipeline escalates | **≥ 0.99** | Ship-blocking. Add deterministic patterns; never compensate by lowering the confidence threshold |
| Category accuracy | Correct category on the auto-routed subset | ≥ 0.90 | Prompt revision, then rulebook vocabulary revision — categories that are frequently confused are usually badly defined, not badly predicted |
| Priority accuracy | Correct priority on the auto-routed subset | ≥ 0.85 | Lower blast radius; priority errors are recoverable, so this threshold is deliberately looser |
| Parse-failure rate | Share of calls returning unusable JSON | < 1% | Investigate model/gateway before touching product logic |
| Calibration | Actual accuracy within each confidence band | ≥0.9 band should be ≥90% correct | Overconfidence means the 0.7 threshold is meaningless — raise the threshold rather than trusting the score |

Escalation recall is the only metric with a hard gate, because it is the only one whose
failure mode is a compliance incident rather than a rework cost.

## Layer 2 — Product outcomes (measured in the pilot)

| Metric | Definition | Target | Reading |
|---|---|---|---|
| Override rate | Finalized decisions where the reviewer changed a field | 10–25% | Below 10% suggests rubber-stamping, not accuracy — a red flag, not a win. Above 25% means drafts are not trusted |
| Escalation rate | Share of requests forced to human review | 20–35% | Too low means guardrails are not firing; too high means no work was absorbed |
| Time-to-finalize | Request created → finalized, by priority | 40% below baseline | Requires a baseline, which does not exist yet |
| Guardrail acknowledgement rate | Overrides that bypass a safety rule | Tracked, not targeted | A rising trend is an early signal that guardrails are mis-tuned or being routed around |

**Deliberate anti-metric:** automation rate is *not* a success metric. Optimising it directly
pressures the system toward auto-routing risky requests, which is precisely the failure this
product exists to prevent.

## Layer 3 — Business case (modelled)

Illustrative for a 500-request/week desk. Inputs are assumptions and are labelled as such.

| Input | Assumed value | Source |
|---|---|---|
| Requests per week | 500 | Assumption |
| Manual triage time per request | 4 min | Assumption |
| Mis-route rate today | 5% | Assumption |
| Cost of an average mis-route (rework + delay) | 30 min | Assumption |
| Cost of a reportable privacy mis-handling | Regulatory, non-linear | Not modelled — treated as a constraint, not a cost line |

Modelled effect, if the Layer 2 targets hold: triage time drops to roughly 1.5 min on the
auto-drafted majority while escalated items are unchanged or slightly slower — a net ~45%
reduction in triage effort. The stronger argument is not the time saved; it is that the
high-risk tail becomes *systematically* detected rather than dependent on which agent is on
shift.

Running cost is one LLM call per request on a low-cost model, plus Postgres. At this volume
inference cost is immaterial next to a single hour of reviewer time, which is why the
[trade-offs doc](./Product-Tradeoffs.md) chooses a cheap fast model and spends the savings on
determinism rather than on a larger model.

## Release gates

A build ships only if, on the labeled set:

1. Escalation recall ≥ 0.99 on the high-risk subset.
2. Category accuracy ≥ 0.90 with no regression greater than 2 points versus the previous run.
3. Parse-failure rate < 1%.
4. No new pattern appears in the misclassification review that lacks a deterministic backstop.

Prompt and model changes are treated as releases and must clear the same gates. A prompt edit
is a production change, not a config tweak.

## Kill criteria

Stated up front so the decision is not made under sunk-cost pressure:

- Override rate stays above 40% after two prompt iterations — reviewers are doing the work
  twice and the product is negative value.
- Any auto-routed decision causes a reportable incident — revert to shadow mode immediately
  and re-derive the guardrails from policy.
- Escalation rate exceeds 60% steady-state — the system is a routing form with extra latency.
