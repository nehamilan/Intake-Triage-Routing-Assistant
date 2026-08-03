---
title: Discovery and User Research
description: Who this is for, the current-state workflow it replaces, the assumptions behind it, and which of them remain unvalidated.
---

# Discovery and User Research

**Status of evidence:** this product was built as a portfolio exercise. No user interviews
were conducted. Everything below is a *reasoned model* of the domain, and every claim that
would normally require research is explicitly marked **[UNVALIDATED]**. Presenting a model
as a finding is the failure mode this section exists to avoid.

## The operation being modelled

A regulated intake desk: a shared inbox or form endpoint where external and internal parties
send free-text requests that must reach the correct team within a time bound. Research data
requests and banking complaints are the two shipped instances; healthcare intake, insurance
FNOL, and HR employee-relations cases share the same shape.

Defining characteristics of this class of operation:

- Requests arrive as unstructured prose written by someone who does not know the internal
  taxonomy.
- A small subset carries disproportionate risk — a privacy breach, a restricted-data request,
  a regulatory clock starting.
- The routing taxonomy is *known and finite*, maintained by compliance, and changes rarely.
- Mis-routing is not merely annoying; it is a reportable event or a missed statutory deadline.

## Users

### Intake agent — primary

Handles the queue day to day. Optimises for clearing volume without being the person who
missed the breach report.

- **Job:** get each request to the right team, fast, with a defensible record.
- **Current-state pain [UNVALIDATED]:** reads every request in full, including the ~70% that
  are unambiguous; context-switches between the inbox and a routing matrix; has no record of
  *why* a past request was routed a given way.
- **What the product gives them:** a pre-filled draft with a stated reason, and the risky
  items visibly flagged rather than buried in volume.
- **What would make them abandon it:** a draft that is wrong often enough that verifying it
  costs more than deciding from scratch. This is the adoption risk that matters, and it is
  why override rate is a primary metric rather than a vanity one.

### Compliance / risk owner — approver, not daily user

Does not triage. Decides whether the system is allowed to operate.

- **Job:** be able to answer "who decided this, on what basis, and when" for any request,
  months later.
- **Requirement that shaped the build:** the audit trail is append-only with per-field diffs
  and an explicit acknowledgement when a reviewer overrides a safety rule.
- **Their veto condition:** any path where the model's output reaches a downstream team
  without a human in between. This is why there is no full-auto mode, despite it being the
  obvious throughput win.

### Operations lead — buyer

- **Job:** reduce time-to-route and backlog without adding headcount or risk.
- **Cares about:** escalation rate (how much work actually gets absorbed), override rate
  (whether the drafts are trusted), and time-to-finalize by priority.

### Viewer — read-only stakeholder

Team leads and adjacent functions who need visibility into inbound volume and mix but must
not be able to alter a decision. Implemented as the `viewer` role.

### Auditor — designed, not built

A read-only role scoped to the full revision history and compliance export. Deliberately
deferred; see [Roadmap](./Roadmap.md).

## Current-state workflow (the baseline the product must beat)

```text
request arrives → agent reads in full → recalls or looks up the routing matrix
  → forwards to a team → (usually) no record of the reasoning
  → mis-routes surface days later as a complaint or a missed deadline
```

Three failure modes in that loop, and how the product targets each:

| Baseline failure | Product response |
|---|---|
| Uniform attention across non-uniform risk | Deterministic pre-checks surface high-risk requests before anything else happens |
| Reasoning is not recorded | Every finalized decision persists the AI proposal, the human action, the diff, and a reason |
| Taxonomy knowledge lives in people's heads | Taxonomy lives in `rulebook.ts` and is injected into the prompt and enforced on the output |

## Assumptions, and how each would be tested

| # | Assumption | Status | Test |
|---|---|---|---|
| A1 | A meaningful share of intake is unambiguous enough to auto-draft confidently | **[UNVALIDATED]** | Label 200 historical requests; measure the fraction the pipeline routes at ≥0.7 confidence *and* correctly |
| A2 | Agents will trust a draft rather than re-decide from scratch | **[UNVALIDATED]** | Shadow mode: measure override rate and time-on-task against a control group |
| A3 | The high-risk subset is detectable with deterministic patterns | Partially supported — patterns work on the fixtures, but keyword matching is brittle by construction | Adversarial set of paraphrased breach reports; measure escalation recall specifically on that subset |
| A4 | Compliance will accept an LLM in the loop if it never decides alone | **[UNVALIDATED]** | Review the audit-trail export with a compliance owner before any pilot |
| A5 | The taxonomy is stable enough to hard-code per vertical | Supported by domain structure — routing matrices are governed artifacts that change quarterly at most | Version the rulebook and track change frequency in the pilot |

## What discovery would come first if this were funded

1. Ten shadowing sessions with intake agents to obtain a real baseline for time-to-route and
   mis-route frequency — A1 and A2 are load-bearing for the whole business case and both are
   currently unvalidated.
2. A compliance workshop to convert the guardrail list from author-invented patterns into a
   policy-derived one.
3. A retrospective mis-routing audit to find out which errors actually cost money, so that
   escalation recall can be weighted by consequence rather than treated uniformly.
