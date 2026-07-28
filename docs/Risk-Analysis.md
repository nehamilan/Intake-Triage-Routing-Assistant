---
title: Risk Analysis
description: Failure modes, mitigations, residual risks, and compliance considerations for regulated intake.
---

# Risk Analysis

## Failure Modes

| Failure | Likely cause | Impact |
|---------|--------------|--------|
| **Wrong auto-route** | Model confidently predicts the wrong category. | Request goes to the wrong team; delayed response. |
| **Missed escalation** | Guardrail pattern is incomplete or prompt downplays risk. | High-risk request routed automatically. |
| **Parse failure storm** | Model format drifts or provider changes output. | All requests flood human review queue. |
| **Reviewer override without justification** | UI allows weak audit capture. | Decisions become unexplainable. |
| **Role confusion** | New user defaults to wrong role. | Viewer accidentally cannot act; agent access is over-granted. |
| **Cross-vertical contamination** | Queue filters fail to isolate domains. | Banking request appears in research queue. |

## Mitigations

- **Deterministic pre-checks** catch privacy incidents before the model sees them.
- **Rulebook whitelist + route lookup** prevents invented categories and routes.
- **Confidence gate** routes uncertain predictions to humans.
- **Mandatory override reason + guardrail acknowledgment** enforce reviewer accountability.
- **Revision history with field diffs** preserves a complete audit trail.
- **RBAC** separates agents from viewers and protects server functions.
- **Vertical isolation** persists `vertical_id` on every request and filters queue/dashboard by it.

## Residual Risks

- **Single model dependency.** The product currently uses one model provider. A provider outage or policy change would halt classification. Mitigation: the architecture supports swapping the model client without changing the rulebook or UI.
- **Guardrail pattern incompleteness.** Keyword-based pre-checks can miss novel phrasing. Mitigation: regular evaluation against labeled data and conservative escalation thresholds.
- **Attachment metadata only.** The model cannot verify whether a mentioned attachment actually supports the requester's claim. Mitigation: document this limitation explicitly and plan content extraction as a separate, governed feature.
- **Free-text reviewer identity.** Reviewer names are typed, not tied to auth identity. Mitigation: the role system ensures only authenticated agents can finalize; future versions could auto-populate reviewer identity from the session.

## Compliance Considerations

The product is designed with regulated environments in mind:

- **Auditability** — every finalized decision has a revision log with timestamps and field changes.
- **Human oversight** — high-risk or uncertain items require human review.
- **Fail-safe defaults** — malformed or unsafe model outputs route to humans, not to operational queues.
- **Data minimization** — the model sees only request text and attachment metadata, not full documents or unrelated cases.

Specific compliance regimes (GDPR, HIPAA, 21 CFR Part 11, etc.) would require additional controls around retention, encryption, and identity proofing before production deployment.

## Abuse Scenarios

- **Prompt injection in request text** — an attacker tries to override the system prompt. Mitigation: the system prompt is fixed server-side; the user text is treated as data, not instructions. The output is still validated against the rulebook.
- **Flooding the queue** — high volume of low-confidence or guardrail-triggering requests. Mitigation: batch processing is sequential and rate-limited by the model provider; the queue can be filtered and sorted.
- **Reviewer bypass** — an agent overrides a guardrail without good reason. Mitigation: the acknowledgment checkbox and mandatory reason create an audit record that can be reviewed by other agents or a future dedicated auditor role.
