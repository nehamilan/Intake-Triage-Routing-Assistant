---
title: Product Tradeoffs
description: Explicit design tradeoffs made during development of the Intake Triage & Routing Assistant, with implementation evidence and rationale.
---

# Product Tradeoffs

This document records the deliberate tradeoffs made while building the Intake Triage & Routing Assistant. Each section states what was optimized, what was sacrificed, and why the team accepted that cost. The examples are grounded in the current implementation, not aspirational future state.

---

## 1. Safety over throughput

**What was optimized:** Avoiding high-cost routing errors.

**What was sacrificed:** Higher reviewer load and a lower auto-route rate.

The system escalates any decision whose model confidence is below the rulebook threshold (`confidenceThreshold: 0.7` in `src/lib/rulebook.ts`). A request that scores 0.69 is routed to the Human Review Queue even if a human might have routed it correctly. Guardrails override confidence entirely: a privacy-incident or fraud pattern forces escalation regardless of how confident the model is (`src/lib/apply-rules.ts`, lines 52–128).

**Rationale:** The target domain is regulated intake. A wrong route for a privacy breach or fraud report is far more expensive than the labor of an extra human review. The default posture is "over-escalate" rather than "over-automate."

**Implementation evidence:**
- `src/lib/apply-rules.ts` escalates on low confidence, missing attachments, missing embargo dates, restricted access without approval, privacy incidents, and fraud.
- `src/lib/classify-request.functions.ts` runs a deterministic pre-check before the LLM and a deterministic `applyRules` layer after it — the "guardrail sandwich."

---

## 2. Automation vs human control

**What was optimized:** Keeping humans as the final decision authority.

**What was sacrificed:** Full end-to-end automation and lower per-request handling time.

Every model output enters the queue as a **reviewable draft**. The agent must click "Accept" or "Override" before the decision is finalized (`src/routes/index.tsx`). Override requires a reason, and overriding a guardrail additionally requires a checkbox acknowledging that the reviewer knowingly bypassed a safety rule. The revision log stores field-level diffs, reviewer name, timestamp, and the acknowledgment (`src/lib/queue-types.ts`).

**Rationale:** In regulated intake, the model is a drafter, not an executor. Human sign-off provides accountability and catches model errors that even strong guardrails cannot. The audit trail is more important than shaving seconds off each request.

**Implementation evidence:**
- `src/routes/index.tsx` implements Accept / Override / "Reopen for revision" flows.
- `src/lib/queue-types.ts` stores `FieldChange[]`, `guardrailAcknowledged`, and `reason` on every revision.

---

## 3. Cost vs model capability

**What was optimized:** Predictable cost and simple operations.

**What was sacrificed:** Maximum accuracy, redundancy, and handling of edge cases.

The system uses a single model call per request (`google/gemini-3-flash-preview` via the Lovable AI Gateway in `src/lib/ai-gateway.server.ts`). There is no ensemble, no self-consistency voting, no retrieval-augmented generation, and no larger fallback model for ambiguous cases.

**Rationale:** A single small model keeps per-request cost low and the architecture easy to reason about. The deterministic guardrail sandwich compensates for some accuracy loss by forcing risky cases to humans. A more sophisticated model pipeline would improve accuracy but increase cost, latency, and failure modes.

**Implementation evidence:**
- `src/lib/classify-request.functions.ts` calls `generateText` once per request.
- `src/lib/ai-gateway.server.ts` configures a single provider with one base URL and model identifier.

---

## 4. Simplicity vs flexibility

**What was optimized:** Portability across domains without retraining or prompt engineering.

**What was sacrificed:** The ability to handle radically different linguistic shapes without rulebook changes.

Categories, routes, priorities, and guardrail triggers live in a **rulebook object** (`src/lib/rulebook.ts`). Adding a new vertical means adding a new `Rulebook` to `RULEBOOKS`, not changing the classifier, UI, database schema, or review workflow. The prompt is regenerated from the active rulebook on each call, so the wire format itself rejects hallucinated categories.

**Rationale:** Rulebooks turn domain knowledge into configuration. This makes the product reusable across research data, banking complaints, and future verticals. The trade-off is that a vertical with very different language (e.g., legal disclosures) may still need prompt or guardrail tuning.

**Implementation evidence:**
- `src/lib/rulebook.ts` defines `RESEARCH_RULEBOOK` and `BANKING_RULEBOOK` as data.
- `src/hooks/use-rulebook.tsx` switches the active rulebook at runtime, and the UI filters queue, dashboard, and evaluation by `verticalId`.

---

## 5. Privacy vs personalization

**What was optimized:** Limiting exposure of sensitive document contents.

**What was sacrificed:** Signal from attachment contents and the ability to verify claims about files.

The model receives only attachment **metadata** — filename, MIME type, and size — never file bytes (`src/lib/classify-request.functions.ts`, `renderAttachments`). The prompt explicitly tells the model it has not seen file contents and must not claim to have read them. This avoids document parsing complexity, reduces token cost, and limits what is sent to the model provider.

**Rationale:** For regulated intake, sending patient data, financial records, or proprietary documents to a third-party model is a privacy and compliance risk. Metadata-only attachments close that surface. The downside is that the system cannot confirm whether an attached spreadsheet actually contains patient names.

**Implementation evidence:**
- `src/lib/attachments.ts` models attachments as `{ filename, mimeType, sizeBytes }`.
- `src/lib/classify-request.functions.ts` renders `"Attachments (metadata only — file contents were NOT read)"` in the prompt.

---

## 6. Feature scope vs delivery speed

**What was optimized:** Shipping a working, safety-first triage pipeline early.

**What was sacrificed:** Advanced features like attachment OCR, multi-model routing, reviewer workload analytics, and a dedicated auditor role.

The project was built in tiers: a browser-only MVP with a deterministic rulebook and keyword classifier, then a real LLM call, then persistence, auth, dashboard, and evaluation. Features such as PDF parsing, active learning, and an auditor role are documented in `docs/Roadmap.md` but not implemented.

**Rationale:** A narrow, well-tested core is more valuable than a broad, fragile one. Each tier validated the previous layer before adding complexity. The roadmap captures future work without delaying the portfolio build.

**Implementation evidence:**
- `docs/Roadmap.md` lists planned features: Auditor role, attachment content extraction, calibration, active-learning loop, and multi-model routing.
- The current codebase supports two verticals, two roles (`agent`, `viewer`), and one model.

---

## 7. Accuracy vs speed (latency)

**What was optimized:** Reliable, auditable classification.

**What was sacrificed:** Lowest possible latency.

The request path includes: deterministic pre-check → server function round-trip → LLM structured-output generation → JSON parse and validation → deterministic post-check → persistence. Each layer adds milliseconds (or seconds, for the LLM) but catches failure modes that a faster, thinner path would miss. Invalid or hallucinated model outputs are caught and converted to `escalated_parse_failure` rather than crashing or being accepted (`src/lib/classify-request.functions.ts`, `parseFailureDecision`).

**Rationale:** For intake triage, a wrong decision that is silently accepted is worse than a slightly slower decision that is safely escalated. The structured-output schema and parse-failure fallback make the system robust to malformed model responses.

**Implementation evidence:**
- `src/lib/classify-request.functions.ts` wraps the LLM call in `try/catch` and returns `parseFailureDecision` on any error.
- The classification schema is built dynamically from the active rulebook so unknown categories are rejected at the schema level.

---

## 8. Auditability vs storage cost

**What was optimized:** A complete, tamper-evident decision history.

**What was sacrificed:** Storage efficiency and simpler data models.

Every override or revision appends a new row rather than editing the existing one. Each row stores the AI draft, final decision, field-level changes, reviewer name, reason, guardrail acknowledgment, and timestamp (`src/lib/queue-types.ts`). The UI collapses these into one queue row with an expandable audit timeline.

**Rationale:** Append-only logs are essential for compliance reviews and debugging drift. The storage cost is acceptable because the audit integrity is a core product requirement.

**Implementation evidence:**
- `src/lib/queue-types.ts` includes `supersedesId`, `supersededById`, and `changes`.
- `src/routes/index.tsx` renders a `RevisionTimeline` inside each queue row.

---

## 9. Free-text reviewer identity vs strict auth binding

**What was optimized:** Operational flexibility for supervisors and trainees.

**What was sacrificed:** A strong cryptographic link between the action and the authenticated user.

The reviewer name is captured as free text at finalize time, not auto-populated from the Supabase session. This allows a supervisor to finalize on behalf of a trainee, but it also means the audit log trusts the agent to enter an accurate name.

**Rationale:** The current environment values flexibility over strict non-repudiation. A stricter production deployment would bind reviewer identity to `context.userId` and allow delegation only through explicit role assignments.

**Implementation evidence:**
- `src/routes/index.tsx` uses a `reviewer` text field that is stored on every revision.
- `src/lib/classify-request.functions.ts` still authenticates the caller via `requireSupabaseAuth` and checks the `agent` role.

---

## 10. Structured output vs free-form parsing

**What was optimized:** Rejection of hallucinated categories at the wire format.

**What was sacrificed:** Prompt portability and the ability to let the model explain itself outside a fixed schema.

The LLM is asked to return a JSON object whose `category` and `priority` fields are Zod enums generated from the active rulebook (`src/lib/classify-request.functions.ts`, `makeClassificationSchema`). Any value outside the enum causes a schema violation, which is caught and converted to a parse-failure escalation.

**Rationale:** Enum-constrained structured output is the strongest defense against the model inventing a category or route. Free-form parsing would require additional validation and would be easier to bypass with a plausible-looking but invalid answer.

**Implementation evidence:**
- `src/lib/classify-request.functions.ts` uses `Output.object({ schema: ClassificationSchema })` from the Vercel AI SDK.
- The `category` enum is built from `rb.categories` at call time.

---

## Summary table

| Trade-off | Optimized | Sacrificed | Rationale |
|-----------|-----------|-------------|-----------|
| Safety vs throughput | Avoiding wrong routes | Higher reviewer load | Regulated intake errors are expensive |
| Automation vs human control | Human final authority | Full automation | Accountability and auditability |
| Cost vs capability | Predictable, simple ops | Maximum accuracy | Guardrails compensate; cost stays low |
| Simplicity vs flexibility | Cross-domain portability | No-code handling of all linguistic shapes | Rulebooks make domain changes configuration |
| Privacy vs personalization | Content protection | Signal from file contents | Prevents PII exposure to model providers |
| Scope vs speed | Working safety-first core | Advanced features | Validate core before adding complexity |
| Accuracy vs latency | Reliable classification | Fastest response | Wrong silent decisions are worse than slow safe ones |
| Auditability vs storage | Tamper-evident history | Storage efficiency | Compliance requires complete logs |
| Flexibility vs strict identity | Supervisor/trainee workflows | Non-repudiation | Stricter binding is a future hardening step |
| Structured vs free-form output | Hallucination resistance | Model expressiveness | Enum schemas reject invalid categories at the wire |

---

## When these tradeoffs might change

- **Higher automation rate:** If operational data shows the 0.7 threshold is too conservative and override rates are very low, the threshold could be tuned per vertical.
- **Strict identity binding:** If the product moves into a regulated environment requiring non-repudiation, reviewer identity should be bound to the authenticated session.
- **Attachment parsing:** If verifying file contents becomes necessary, a sandboxed parsing step could be added while keeping the same guardrail sandwich.
- **Multi-model routing:** If accuracy targets are not met on a single model, a cheaper model for high-confidence cases and a larger model for ambiguous cases could be introduced without changing the rulebook layer.
