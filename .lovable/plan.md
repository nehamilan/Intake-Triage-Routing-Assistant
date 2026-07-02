## Goal

Make `classifyRequest` fail-safe: any malformed, unparseable, or hallucinated model response becomes a **parse-failure decision** that routes to human review — never a wrong auto-route, never a runtime crash.

Today the server function `throw`s on `NoObjectGeneratedError` or any other failure. The client surfaces that as an error toast and the item drops out of the flow entirely. We want it to *return a valid Decision* whose downstream `applyRules` handling escalates it cleanly.

## Design decision (worth naming)

The parse-failure signal has to survive from the server through `applyRules` into the UI. Two clean options:

- **A. New status in the rules layer.** Server returns a normal-shaped `Decision` with a sentinel field (e.g. `parseFailed: true`); `applyRules` checks it first and returns `status: "escalated_parse_failure"`, `finalRoute: "Human Review Queue"`, and the flag. This keeps the "server classifies, client applies rules" split we've held since Tier 1.
- **B. Server returns a fully-formed escalation.** Bypasses the rules layer.

Recommending **A** — it keeps the guardrail layer as the single source of truth for status/route decisions, and it composes with existing guardrails (a parse-failed decision on a privacy-incident text should still be tagged privacy incident too, since that guardrail is purely text-driven).

## Changes

### 1. `src/lib/mock-classify.ts`
Add an optional `parseFailed?: boolean` flag to the `Decision` type. Mock classifier never sets it.

### 2. `src/lib/classify-request.functions.ts`
Wrap the `generateText` call so nothing thrown from the SDK, the schema validator, or the rulebook lookup escapes as an exception:

- Keep the current happy path.
- In `catch` (covers `NoObjectGeneratedError`, Zod validation failures from `Output.object`, network/gateway errors, JSON parse errors): return a safe fallback `Decision`:
  ```
  {
    category: "general_inquiry",   // placeholder; route is overridden by rules
    priority: "normal",
    route: RULEBOOK.routes.general_inquiry,
    reason: "Model output invalid — routed to human review.",
    confidence: 0,
    parseFailed: true,
  }
  ```
- Also guard the *post-parse* path: even though Zod enforces the enum, defensively check `RULEBOOK.routes[category]` exists; if not, return the same fallback. This covers the "hallucinated category slipped through" case if the schema is ever loosened.
- Log the underlying error server-side (`console.error`) so operators can still see gateway/model issues; do not leak the raw message to the client.
- Only re-throw for `LOVABLE_API_KEY` missing (that's an operator misconfiguration, not a model failure — the current toast behavior is correct there).

Retry policy: no auto-retry. Per gateway rules, 400/schema errors are terminal; retrying just burns credits and delays the human review the guardrail is asking for.

### 3. `src/lib/apply-rules.ts`
- Add `"escalated_parse_failure"` to the `TriageStatus` union.
- Add a new **first** check (before the confidence gate) — if `decision.parseFailed`, set `finalRoute = HUMAN_REVIEW`, `status = "escalated_parse_failure"`, and push flag `"Model output invalid — routed to human review."`
- Let the existing privacy-incident guardrail still run afterwards (text-driven, still valuable) — but it should not *downgrade* status away from parse failure. Simplest: if parse failed, skip the other guardrails and confidence gate entirely, since the model's category/priority are meaningless. Only the privacy-incident guardrail (pure text) stays, and if it fires it can co-flag but should not overwrite `status`. Concretely: gate every subsequent status assignment behind `if (!decision.parseFailed)`, but still let privacy triggers push their flag and force `priority = "urgent"`.
- Add label to `STATUS_LABELS`: `"Escalated — model output invalid"`.

### 4. `src/routes/index.tsx`
- Add `escalated_parse_failure` to `STATUS_STYLES` with a distinct color so it's visually different from the purple "escalated" cluster. Suggest **amber/red** (e.g. `bg-red-50 border-red-300 text-red-800`, dot `bg-red-600`) to signal "the AI itself failed," not just "AI was unsure."
- On the Decision Card, when status is `escalated_parse_failure`:
  - Show the badge prominently.
  - Replace the confidence bar with a small "Confidence not available — model response invalid" line (rendering a 0% bar is misleading).
  - Keep the AI's `reason` text as the flag callout (already handled by the shared flag renderer).
  - Accept/Override controls still work — a human can pick the correct category/priority/route from the rulebook dropdowns exactly like today.
- In the Queue table, the existing status badge column picks up the new style automatically.

### 5. Sample requests
No new samples needed — this path can only be exercised by real model failures, and forcing one via a sample would require plumbing a "simulate parse failure" toggle. Skip.

## Verification

- Type-check passes.
- Manually verify by temporarily throwing inside the `try` block in dev to confirm the UI shows the red parse-failure card and the item lands in the Queue with `finalRoute = "Human Review Queue"`. Revert before finishing.
- Confirm privacy-incident text still forces `urgent` priority and adds its flag even when parse failed.

## Out of scope

- Retry with a repaired prompt (deferred; terminal errors shouldn't loop).
- Persisting the raw model output for debugging (would need storage; Tier 3).
- Structured telemetry / metrics on parse-failure rate.
