# Plan: AI PM portfolio documentation

Produce a single narrative document, `PRODUCT_ANALYSIS.md` at the repo root, aimed at **AI PM hiring managers**. It reads as a case study, not a README, and covers **as-built + full roadmap**.

## Deliverable

One file: `PRODUCT_ANALYSIS.md` (Markdown, ~1,500–2,000 words, scannable with H2/H3 and short tables). No code changes.

## Structure

1. **TL;DR** — 4-line elevator pitch: the problem, the AI's job, the safety design, the evidence layer.
2. **The problem** — Regulated intake operations; why unsupervised LLM routing is unsafe; what "reviewed first draft" changes.
3. **Users & jobs-to-be-done** — Agent, Viewer, and the implicit auditor/PM. What each one comes to the app to accomplish.
4. **What the AI does (and doesn't do)** — Narrow classification + short justification, enum-constrained, single call. The route is derived deterministically from category; the AI never picks it. No agentic loops, no tools, no streaming.
5. **Inputs & outputs contract** — Table of model inputs (request text, attachment *metadata only*, rulebook enums, vertical) and the three output objects (AI decision, Rules outcome, Reviewer decision — append-only revisions).
6. **The safety architecture** — The "deterministic guardrails → model → deterministic guardrails" sandwich. Pre-checks (privacy incident, fraud) short-circuit the model; post-checks (confidence gate, Guardrails A/B, embargo, attachment mismatch, parse failure) override the model. Eight escalation statuses all route to Human Review.
7. **Human-in-the-loop design** — Append-only `request_revisions`; overrides require reason; guardrail bypass requires a separate acknowledgment checkbox; viewers structurally cannot write (RLS, not just UI); revision timeline is the training-signal substrate.
8. **What can go wrong (failure catalog)** — Hallucinated categories, confidently-wrong classifications, overconfidence, model-claims-to-have-read-a-file, invented embargo dates, silent network failures. For each: the mitigation actually in code.
9. **Trade-offs made** — Safety over throughput; rulebook-as-data vs runtime config; duplicate enforcement points; fixed confidence threshold; metadata-only attachments; single model/provider; free-text reviewer identity; append-only revision growth; offline evaluation only; two-vertical portability with hardcoded guardrail shapes.
10. **Evidence layer** — The Dashboard KPIs and the Evaluation page (routing/priority/category accuracy, confusion matrix, escalation recall) are named as the artifacts that prove the product works.
11. **Roadmap — known limits and next versions** — Prioritized, each with problem → proposal → success metric:
    - **P0 Calibrated confidence** — replace fixed 0.7 with a threshold learned from labeled outcomes; add per-category thresholds.
    - **P0 Identity-bound reviewer** — replace free-text reviewer with `auth.uid()` + display name; make the audit log tamper-evident.
    - **P1 Continuous evaluation & drift monitoring** — nightly eval on a golden set; alert when category accuracy or escalation recall drops.
    - **P1 Override-driven learning loop** — mine `request_revisions` diffs to propose rulebook edits and few-shot examples; nothing auto-applied.
    - **P1 Multilingual & paraphrase-robust guardrails** — pre-checks currently English-substring; move to embeddings or a small classifier.
    - **P2 Attachment content extraction** — optional Tier 4 to read PDFs/images for the attachment-mismatch and IRB-verification guardrails; explicit privacy trade-off.
    - **P2 Model diversity & fallback** — second provider for availability and cross-model agreement as an extra safety signal.
    - **P2 Rulebook guardrail plugins** — today `Rulebook` type hardcodes guardrail shapes; make guardrails a registered plugin so a new vertical is truly zero-code.
    - **P3 Retention & summarization** — revision-log lifecycle policy; per-request summarization for long-lived items.
12. **What this project demonstrates (for the hiring reader)** — Product framing (the scarce resource is correct handling of high-risk cases, not agent time); safety-critical design (guardrails outside the model); evidence-first (dashboard + evaluation are first-class); measurable trade-offs; and a credible next-version roadmap.

## Grounded in the code (no invention)

Every claim in sections 4–9 traces to a specific file already read:
- `src/lib/classify-request.functions.ts` — pre-checks, schema validation, parse-failure fallback, single Gemini call.
- `src/lib/apply-rules.ts` — 8 escalation statuses, post-check ordering, embargo/attachment/guardrail logic.
- `src/lib/rulebook.ts` — enum-as-data, two verticals, hardcoded guardrail shapes.
- `src/hooks/use-rulebook.tsx` — runtime vertical switch.
- Supabase schema (`profiles`, `user_roles`, `requests`, `request_revisions`) — RLS, append-only revisions, denied DELETE/UPDATE.
- `project_specs.md` — vision, tiers, non-negotiables.

## Out of scope

- No code changes. No screenshots. No architecture diagram image (ASCII sketch of the pipeline is acceptable inline).
- Not a README, not user-facing help, not a runbook.

Once approved, I'll create `PRODUCT_ANALYSIS.md` in a single write.
