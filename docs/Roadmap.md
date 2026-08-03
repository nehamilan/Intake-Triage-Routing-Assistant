---
title: Roadmap
description: Prioritized roadmap from ship-blockers to operational maturity for the triage product.
---

# Roadmap

## P0 — Ship Blockers

- [x] Deterministic guardrail sandwich (pre-check + model + post-check).
- [x] Human review workflow with accept / override and mandatory reasons.
- [x] Audit log with revisions, field diffs, and guardrail acknowledgments.
- [x] Role-based access control (agent / viewer).
- [x] Persistence in Supabase with vertical isolation.
- [x] Evaluation page with accuracy metrics and confusion matrix.
- [x] Dashboard with KPIs and responsive charts.

## P1 — Continuous Quality

- [ ] Run weekly evaluations against a growing labeled test set.
- [ ] Track override rate, parse-failure rate, and escalation recall over time.
- [ ] Add a "model performance" tab to the dashboard showing trend lines.
- [ ] A/B test prompt variants against the evaluation set.
- [ ] Auto-populate reviewer identity from the authenticated session (today the reviewer name is free text, which weakens the audit trail).
- [ ] Alerting on parse-failure rate, escalation rate, and latency — thresholds are defined in the [Operations Runbook](./Operations-Runbook.md) but reviewed manually today.
- [ ] Retention purge job and a deletion path for erasure requests, per [Data Governance](./Data-Governance.md).
- [ ] PII redaction pass before model egress, so sensitive text beyond the privacy-incident patterns never reaches the gateway.


## P2 — Capability Expansion

- [ ] Optional content extraction for attachments (PDF, images, spreadsheets) with explicit consent and audit logging.
- [ ] Multi-model support with fallback and ensemble scoring.
- [ ] Email / webhook ingestion so requests arrive automatically.
- [ ] Snooze / assign / due-date features for the human review queue.
- [ ] Add a third vertical (e.g., healthcare records or insurance claims) to prove portability.

## P3 — Operational Maturity

- [ ] SLA tracking: time-to-finalize by priority and route.
- [ ] Admin panel for managing agents, viewers, and rulebooks without SQL.
- [ ] Introduce a dedicated read-only Auditor role with scoped access to the full audit trail and compliance exports.
- [ ] Export full audit trail to PDF for compliance reviews.
- [ ] Integration with downstream case-management systems (Jira, ServiceNow, Zendesk).
- [ ] SOC 2 / HIPAA readiness documentation and controls.
