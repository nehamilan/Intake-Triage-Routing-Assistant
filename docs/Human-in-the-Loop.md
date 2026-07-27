---
title: Human-in-the-Loop
description: Reviewer workflow, audit logging, and role-based access controls for finalizing triage decisions.
---

# Human-in-the-Loop

## Reviewer Workflow

Every request flows through one of two paths:

1. **Auto-routed** — confidence is high and no guardrails fired. The AI proposal is accepted automatically and shown in the queue as finalized.
2. **Escalated** — confidence is low or a guardrail fired. The request lands in the human review queue. An agent inspects the Decision Card, chooses to accept or override, and finalizes the decision.

The queue is sorted newest-first by default. Agents can click the Time or Priority column headers to toggle sort order. Each visit resets to newest-first.

## Accept vs Override

- **Accept** — the agent agrees with the AI proposal. The AI values become the final values. The agent provides their name; an optional note can be added.
- **Override** — the agent changes category, route, priority, or status. This requires:
  - A mandatory **reason for change**.
  - A mandatory **guardrail acknowledgment checkbox** if the override bypasses a safety rule.

Overrides are not failures; they are expected feedback. A high override rate, however, is a signal that the rulebook or prompt may need tuning.

## Revisions & Audit Log

When an already-finalized item is reopened and changed, the system appends a new revision rather than mutating the original row. The old row is marked `superseded` and the new row becomes the current version.

Each revision records:

- `reviewer_name`
- `reviewed_at` timestamp
- `final_category`, `final_priority`, `final_route`
- `status`
- `reviewer_note`
- `field_changes` — a compact diff of what changed from the previous version (e.g., `priority: normal → urgent`)
- `guardrail_acknowledged` — true if the change knowingly bypassed a guardrail

The queue table shows only the latest version of each request. Clicking a row expands the full revision timeline, making audits straightforward.

## Guardrail Acknowledgment

If an override removes an escalation or routes around a guardrail, the reviewer must explicitly check an "I acknowledge this bypasses a safety rule" box. This creates a clear audit trail that the reviewer knowingly overrode a safety rule, not that the system silently allowed it.

The acknowledgment is stored on the revision and displayed in the history timeline.

## Role-Based Access

Authentication is handled by Supabase Auth. Two roles are enforced:

- `agent` — can triage, review, override, and run evaluations.
- `viewer` — can view the dashboard and queue, but cannot modify decisions.

The server-side `classifyRequest` function is protected by authentication middleware. The UI conditionally renders action buttons based on the user's role. New accounts default to `viewer` unless explicitly promoted to `agent`.
