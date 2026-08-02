---
title: Human-in-the-Loop
description: Where humans participate in the Intake Triage & Routing Assistant, what they can and cannot do, and how the system balances automation with human judgment.
---

# Human-in-the-Loop

The Intake Triage & Routing Assistant is a decision-support tool, not an autonomous agent. The model drafts a classification; a human reviews it, accepts or overrides it, and takes final responsibility for the decision. This document describes the responsibilities, review points, approval workflows, override mechanisms, and automation boundaries that keep humans in control.

## 1. Human responsibilities

Two roles are implemented today:

| Role | Responsibilities |
|------|------------------|
| **Agent** | Can triage new requests, review AI proposals, accept or override decisions, add reviewer notes, reopen finalized items for revision, and run evaluations. |
| **Viewer** | Can view the dashboard and queue in read-only mode. Cannot modify decisions or run triage. |

A future **Auditor** role is planned to provide a dedicated read-only view over the full revision log and guardrail acknowledgments.

Agents are expected to:

- Verify that the AI's category, priority, and route make sense for the request text.
- Open and inspect attachments before acting on them — the model sees only filenames and MIME types, not file contents.
- Provide a reason when overriding a decision.
- Explicitly acknowledge when they bypass a safety guardrail.
- Ensure their reviewer name is recorded so every finalized decision is attributable.

## 2. Review points

Humans interact with the system at three points:

### 2.1 Initial triage review

After the user clicks **Triage Request**, the model returns a draft decision. The right panel displays:

- Proposed category, priority, route, and reasoning.
- A confidence score and progress bar.
- Any guardrail flags that fired.
- Attachment metadata (the model does not read file bytes).

The agent then chooses **Accept** or **Override**. No request is finalized without a human action.

### 2.2 Queue review

The Queue tab lists every finalized request, newest first. Each row shows the final status, route, priority, reviewer, and timestamp. Agents can click a row to reopen it and inspect the full revision history.

### 2.3 Revision / audit review

Any finalized decision can be reopened. When changed, the system appends a new revision rather than editing the old one. The revision timeline shows:

- Every version (v1, v2, …).
- Who made the change, when, and why.
- A compact diff of changed fields (`category`, `priority`, `route`, `status`).
- Whether a guardrail bypass was acknowledged.

## 3. Approval workflows

### 3.1 Accept workflow

1. Agent reviews the AI draft.
2. Agent enters their name in the **Reviewer** field.
3. Agent optionally adds a note in the **Reason for change** field.
4. Agent clicks **Accept & Send to Queue**.
5. The AI's category, priority, route, and status become the final values.
6. A v1 revision is persisted with `overridden: false`.

Accepting an auto-routed proposal is intentionally lightweight: the model has already provided a justification, so no mandatory extra explanation is required.

### 3.2 Override workflow

1. Agent clicks **Override**.
2. Agent edits category, priority, and/or route using dropdowns.
3. If the change routes an escalated item out of the **Human Review Queue**, the system requires:
   - A mandatory reason.
   - A checked **"I acknowledge I am overriding a safety escalation"** box.
4. Agent clicks **Save Override**.
5. A v1 revision is persisted with `overridden: true` and `guardrailAcknowledged: true` if applicable.

### 3.3 Reopen-and-revise workflow

1. Agent opens a finalized item from the Queue.
2. Agent clicks **Reopen for revision**.
3. The decision card enters revision mode, pre-populated with the last finalized values.
4. Agent makes changes and provides a reason.
5. The system saves a new revision (v2, v3, …) and marks the previous row as superseded.

Superseded rows remain in the audit log but no longer appear as active queue entries.

## 4. Override mechanisms

Overrides are first-class actions, not error states. They are expected when:

- The model's category is plausible but wrong.
- Context outside the text (e.g., a known VIP sender, a prior ticket) changes the route.
- A guardrail was too conservative and a human judges the item safe to route.

The system enforces three override controls:

| Control | Purpose |
|---------|---------|
| **Reviewer name required** | Every finalized decision is attributable. |
| **Reason required** | Any change from the AI proposal or any guardrail bypass must be explained. |
| **Guardrail acknowledgment checkbox** | When an escalated item is routed out of Human Review Queue, the reviewer must explicitly confirm they are knowingly bypassing a safety rule. |

The override reason and acknowledgment are persisted to the revision log and displayed in the audit timeline.

## 5. Human decision authority

Humans have final authority over every routing decision. Specifically:

- The model cannot finalize a decision.
- The model cannot route around a guardrail.
- The model cannot invent a category or route outside the active rulebook.
- Only an agent can change a finalized decision, and doing so creates a new revision.
- Viewers cannot modify anything.

Even when the model returns high confidence and no guardrails fire, the request remains a draft until a human clicks **Accept**. The system is designed so that automation accelerates reading and classification, but judgment and accountability remain human.

## 6. Automation boundaries

The system automates the following:

- **Pattern matching for high-risk signals** — privacy incidents, fraud, restricted-access language, embargo mentions, and attachment references are detected deterministically before and after the model call.
- **Structured classification** — the model proposes a category, priority, reason, and confidence from a closed rulebook.
- **Route lookup** — the route is derived from `rulebook.routes[category]`, never chosen freely by the model.
- **Confidence gating** — items below the 0.7 threshold are automatically flagged for human review.
- **Revision tracking** — field-level diffs and timestamps are computed automatically.

The system does **not** automate:

- **Final decisions** — a human must accept or override every proposal.
- **Attachment review** — the model never reads file bytes; humans must inspect attachments.
- **Guardrail bypasses** — a human must explicitly acknowledge any override of a safety escalation.
- **External communication** — the assistant does not email requesters or update external systems.

## 7. Why humans remain necessary

Humans remain in the loop for four reasons:

1. **Safety-critical judgment.** Some signals — intent, tone, institutional context, prior history — cannot be captured by keyword rules or a single-turn classifier. A privacy incident or fraud report must reach a person who can assess the full situation.

2. **Accountability.** Regulated intake requires traceability. The revision log records who made each decision, when, what changed, and why. This is a compliance and audit requirement, not a technical one.

3. **Model limitation awareness.** The model sees only text and attachment metadata. It cannot open files, verify identities, check approval databases, or know whether an embargo date is realistic. Humans bridge these gaps.

4. **Continuous improvement.** Every override is a labeled data point. A rising override rate signals that the rulebook, prompt, or confidence threshold may need tuning. Without human feedback, the system cannot detect its own drift.

## 8. Balance between automation and human judgment

The design principle is **"automate the draft, humanize the decision."**

| Task | Automation | Human |
|------|------------|-------|
| Read and summarize request text | LLM classification | — |
| Detect risky patterns | Deterministic pre-check + post-check | Review flagged items |
| Choose category from rulebook | LLM (enum-constrained) | Accept / override |
| Map category to route | Rulebook lookup | Accept / override route |
| Decide on low-confidence items | Flag for review | Human reviews and decides |
| Inspect attachments | — | Human opens files |
| Finalize and route | — | Human clicks Accept or Save Override |
| Audit trail | Auto-generated | Human provides reasons |

This balance prioritizes **safety over throughput**. The default 0.7 confidence threshold and aggressive guardrails deliberately over-escalate, sending more items to human review than strictly necessary. The cost is higher reviewer load; the benefit is a much smaller tail of dangerous auto-routes.

The system does not remove humans from triage — it makes their time more valuable by pre-reading, pre-classifying, and pre-flagging the items that most need their judgment.
