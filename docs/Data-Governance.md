---
title: Data Governance
description: What data the system holds, where it goes, retention and deletion, the position on training use, and the gaps that remain.
---

# Data Governance

Free-text intake in a regulated domain is sensitive by default. This document states the
position rather than leaving it implicit, and marks the parts that are **[NOT IMPLEMENTED]**.

## Data inventory

| Data | Where it lives | Sensitivity | Notes |
|---|---|---|---|
| Request text (verbatim, as written) | `requests` table | High — may contain names, account numbers, health details | Stored unmodified; no redaction today |
| Attachment metadata (name, MIME type, size) | `requests` row | Low–medium — filenames can leak subject identity | File **contents are never stored or read** |
| AI proposal (category, priority, confidence, reason) | `requests` row | Low | The reason string can quote request text |
| Revision log (reviewer name, timestamp, field diffs, justification, guardrail acknowledgement) | `request_revisions` | Medium — identifies staff decisions | Append-only by design |
| Identity (email, role) | Auth tables, `profiles`, `user_roles` | Medium | Roles held in a separate table, never on the profile |

## Flow, and what leaves the system

```text
browser → server function (authenticated) → deterministic pre-check
        → [only if not short-circuited] AI gateway ← the sole external egress
        → deterministic post-rules → Postgres
```

Two properties worth stating explicitly, because both are product decisions:

- **Requests matching privacy-incident patterns never reach the model at all.** The pre-check
  short-circuits before egress, so the most sensitive class of text stays inside the system.
- **Attachment contents never leave the browser** — only metadata is sent. This caps
  classification quality on purpose; see [Product-Tradeoffs](./Product-Tradeoffs.md).

## Access control

- `agent` — triage, review, override. Enforced in the server function *and* by RLS.
- `viewer` — read-only dashboard, scoped to the active vertical.
- `Auditor` — designed, **[NOT IMPLEMENTED]**.

Authorisation is enforced at the database, not only in the UI, so a client-side bypass yields
nothing. The service role key is never exposed to the browser and the LLM key is server-only.

## Training and model use

**Position: request data is not to be used for model training or fine-tuning.** Requests are
sent to the gateway for inference only. If a future model change would require training on
this data, it is a new consent question and a compliance decision, not an engineering one.

**[GAP]** — this position is asserted by policy here and is not yet contractually verified
against the gateway provider's data-use terms. That verification is a Phase 0 prerequisite in
the [Launch plan](./Launch-and-Rollout-Plan.md).

## Retention and deletion

**[NOT IMPLEMENTED]** — there is currently no retention policy in code. Rows persist
indefinitely. The intended policy:

| Data | Retention | Rationale |
|---|---|---|
| Request text | 24 months, then purge the body and keep the decision record | The audit obligation is about the *decision*, not the verbatim text |
| Decision + revision log | 7 years | Typical regulated audit horizon |
| Identity records | Duration of employment + audit horizon | |

Deletion request handling (erasure rights): purge the request body and attachment metadata,
retain the revision log with the body reference tombstoned. Deleting the audit trail itself
would break the append-only guarantee that compliance relies on, so the design deletes the
content and preserves the decision.

Implementing a scheduled purge job and a deletion endpoint is a P1 item.

## Known gaps

1. No PII redaction before model egress. The pre-check protects the *worst* class of text, not
   all of it. A redaction pass ahead of the gateway call is the highest-value governance
   addition and is tracked in [Output-Guardrails](./Output-Guardrails.md).
2. No retention automation (above).
3. Reviewer name is a free-text field rather than being derived from the session, so the audit
   trail records a typed name rather than a verified identity. This is a genuine weakness in
   an audit context and is a P1 fix.
4. No data-residency control — the gateway region is not pinned, which would matter for any
   deployment under GDPR or equivalent.
