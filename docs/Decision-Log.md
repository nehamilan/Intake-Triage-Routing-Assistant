---
title: Decision Log
description: The consequential product decisions, the options rejected, and what would reverse each one.
---

# Decision Log

The rest of the documentation describes the end state, which makes every choice look
inevitable. It was not. Each entry records the option that was rejected and the condition
that would reverse the decision.

---

## D1 — The model proposes; the rulebook decides

**Chosen:** the model returns a category; the route is looked up from
`rulebook.routes[category]`. The model's own route suggestion is discarded.

**Rejected:** letting the model emit the destination team directly. It is simpler and handles
novel cases, but it makes a hallucinated destination indistinguishable from a valid one.

**Why:** wrongness must be *detectable*. A category outside the closed vocabulary fails
validation; a plausible-sounding team name does not.

**Reverses if:** the taxonomy grows large or volatile enough that maintaining the rulebook
costs more than the errors it prevents — an argument for retrieval over enumeration, not for
trusting free-form output.

---

## D2 — Deterministic checks on both sides of the model

**Chosen:** privacy-incident patterns short-circuit before the model; confidence, guardrails,
embargo, and parse validation run after.

**Rejected:** putting all safety instructions in the prompt. Far less code.

**Why:** a prompt instruction is a request, not a constraint. Safety behaviour that lives in
the prompt disappears when the model changes, the provider silently updates, or an input
happens to be adversarial. Pre-checks also keep the most sensitive text from egressing at all.

**Cost:** keyword patterns are brittle and produce false positives, which inflate the
escalation rate. Accepted: a false escalation costs reviewer minutes; a missed breach costs a
reportable incident.

**Reverses if:** a validated classifier for the risk subset outperforms patterns on recall —
in which case it becomes a *second* pre-check, not a replacement.

---

## D3 — A cheap fast model, not the strongest available

**Chosen:** a low-cost fast model behind the gateway, swappable in one server file.

**Rejected:** a frontier model for better first-pass accuracy.

**Why:** the architecture caps the damage a weaker model can do — a wrong proposal is caught
by validation, the confidence gate, or the human. Spending the budget on determinism and
review throughput buys more safety per unit cost than spending it on inference. Latency also
matters more than marginal accuracy when a human is waiting to review.

**Reverses if:** evaluation shows category accuracy is the binding constraint on override
rate, rather than ambiguity in the requests themselves.

---

## D4 — Every decision is a draft; no full-auto mode

**Chosen:** a human accepts or overrides every decision, including high-confidence ones.

**Rejected:** auto-finalising above a confidence ceiling (e.g. 0.95).

**Why:** it is the compliance owner's veto condition, and confidence is not calibrated well
enough to be a safety mechanism on its own. Also, if only the escalations were reviewed, the
system would lose its ground-truth signal for the easy cases — the accept stream is what
proves the auto-drafts are actually right.

**Reverses if:** calibration data from a full pilot shows the ≥0.95 band is accurate at that
rate over a meaningful sample, *and* compliance re-approves. It is a separate risk acceptance,
not a threshold tweak.

---

## D5 — Append-and-supersede instead of mutable rows

**Chosen:** revisions append; the queue shows one row per request with the history inside it.

**Rejected (and initially built):** a new queue row per revision. It was implemented, shipped,
and removed — it made the queue unreadable and produced counters ("superseded: 2") that
described the data model rather than the operation.

**Why:** the audit requirement is about the *log*, not the worklist. The log belongs inside
the row; the worklist should show current state only. Counters now describe the live queue.

**Lesson worth keeping:** an audit feature that degrades the daily surface will be worked
around, and a worked-around audit trail is worse than none.

---

## D6 — Attachment metadata only, never contents

**Chosen:** filename, MIME type, size are sent; contents are never read or stored.

**Rejected:** parsing PDFs and spreadsheets for better classification.

**Why:** attachments in these domains are the densest source of sensitive data. Reading them
expands the data-protection surface far more than it improves routing, and routing rarely
depends on the contents. A missing-attachment guardrail recovers most of the value: if the
text references an attachment that is not present, the request escalates.

**Reverses if:** evaluation attributes a material share of misclassification to
metadata-only inputs — and then only with explicit consent and per-access audit logging.

---

## D7 — Two verticals in the box

**Chosen:** ship research data requests *and* banking complaints.

**Rejected:** one polished vertical.

**Why:** the central claim is that the architecture generalises across regulated domains. One
vertical makes that a claim; two make it a demonstration, and it forced the domain specifics
out of the pipeline and into the rulebook where they belong.

**Cost:** neither vertical has the depth a single-domain build would have, and both use
author-invented taxonomies rather than real policy documents.

---

## D8 — Escalate on an embargo mention without an exact date

**Chosen:** a mentioned embargo without a `YYYY-MM-DD` date escalates (Guardrail C).

**Rejected:** letting the model infer the date from relative phrasing ("next spring").

**Why:** an embargo date is a hard obligation with a legal consequence for being wrong. An
inferred date is a fabricated commitment. Refusing to guess and asking a human is the correct
behaviour for any field where being confidently wrong is worse than being slow.

**Generalises to:** any date, amount, or identifier the model would have to infer rather than
read. This is the template for future guardrails.
