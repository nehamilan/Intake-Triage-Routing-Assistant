---
title: Launch and Rollout Plan
description: Phased exposure from shadow mode to steady state, with entry and exit criteria, sign-offs, rollback triggers, and change management.
---

# Launch and Rollout Plan

The system is not deployed. This is the plan that would govern deployment. In a regulated
intake operation, *how* an AI system is introduced is part of the product; a correct model
rolled out carelessly is still an incident.

## Principle

Exposure increases only when evidence justifies it, and every phase has a pre-agreed exit
condition and a rollback that is one configuration change, never a code deploy.

## Phase 0 — Shadow mode (2–4 weeks)

The pipeline runs on live requests; **no output is shown to agents**. Agents triage as they
always have. Both decisions are recorded.

- **Purpose:** obtain the baseline that [Success-Metrics-and-Business-Case](./Success-Metrics-and-Business-Case.md)
  currently lacks, and measure agreement between the pipeline and human decisions on real
  traffic rather than on author-written fixtures.
- **Exit criteria:** agreement ≥ 85% on category; escalation recall ≥ 0.95 on every request a
  human treated as high-risk; parse-failure rate < 1%.
- **Rollback:** none required — nothing is user-visible.

## Phase 1 — Assisted mode, single vertical, small cohort (4 weeks)

Three to five volunteer agents on one vertical see the Decision Card. Every decision still
requires a human to accept or override. This is the mode the product is currently built for.

- **Purpose:** measure override rate and time-on-task, and collect the qualitative reason
  agents give when they override.
- **Exit criteria:** override rate 10–25%; no safety-rule bypass without a recorded
  acknowledgement; no mis-route attributable to draft anchoring.
- **Rollback trigger:** two mis-routes traced to reviewers accepting a wrong draft. Anchoring
  is a real risk of showing a confident-looking suggestion, and it is caught here or not at all.

## Phase 2 — Full cohort, both verticals (4–6 weeks)

All agents, both rulebooks. Dashboard becomes the operating review artefact.

- **Exit criteria:** metrics hold at full volume; time-to-finalize improves against the
  Phase 0 baseline; no unresolved compliance finding.
- **Rollback:** disable per vertical by switching the active rulebook; the queue and audit
  trail are unaffected.

## Phase 3 — Steady state

Weekly evaluation runs against a growing labeled set, monthly guardrail review with
compliance, quarterly rulebook review.

**What is explicitly not in any phase:** full auto-routing without a human. Removing the
reviewer is not a later phase of this product; it is a different product with a different
risk acceptance, and it would require its own approval.

## Sign-offs

| Gate | Owner | Artefact reviewed |
|---|---|---|
| Enter Phase 0 | Engineering + Ops lead | Architecture, RLS policies, audit-trail export |
| Enter Phase 1 | Compliance / risk owner | Guardrail coverage vs policy, retention position, sample audit export |
| Enter Phase 2 | Ops lead + Compliance | Phase 1 metrics, override reasons, incident log |
| Rulebook change | Compliance owner | Diff of categories, routes, and guardrail patterns |

Prompt and model changes follow the release gates in the metrics doc and do not require a
compliance sign-off unless they alter guardrail behaviour — which, by design, they cannot,
since guardrails are deterministic code outside the prompt.

## Change management

Adoption fails for social reasons more often than technical ones. Three things are non-optional:

1. **Name the tool a draft, everywhere.** The UI says "reviewed first draft"; training says
   the same. The moment agents believe it is an answer, oversight becomes theatre.
2. **Make overriding cheap and non-punitive.** Override rate is a product metric, never an
   agent performance metric. If agents believe overriding reflects badly on them, the audit
   trail stops being truthful and the system loses its only quality signal.
3. **Close the loop visibly.** Override reasons are reviewed weekly and the resulting prompt
   or rulebook change is announced. Agents who see their corrections change the system keep
   supplying good corrections.

## Communications to downstream teams

Receiving teams are told: routing may now arrive with an AI-proposed category, always
human-confirmed, and every decision carries a reason and a reviewer name they can query.
Nothing in their intake contract changes — which is the point of deriving the route from the
existing rulebook rather than letting the model invent destinations.
