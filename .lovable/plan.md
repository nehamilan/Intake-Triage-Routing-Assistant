## Goal

Stop silent re-edits of finalized queue items. Once an item is committed to `processedQueue`, re-opening it shows a **read-only** decision card with reviewer + timestamp. Changes require an explicit **Reopen for revision** action, and saving a revision **appends a new row** while marking the previous one **superseded** — preserving a full audit log.

## Design decisions

**Revisions as an append-only log.** Every finalized decision is immutable. A revision is a new row that points back at its predecessor via `supersedesId`; the predecessor gets `supersededById` set. Nothing is ever deleted or mutated in place. This gives us a permanent, honest history and makes future persistence/telemetry trivial.

**Reviewer as free-form text, in-memory.** A single "Reviewer name" input lives on the Triage panel. Whatever's typed at Accept/Save time is captured on the row. Persists in component state for the session; no auth, no dropdown. Empty string is allowed but discouraged with a soft placeholder.

**Queue view stays flat.** Superseded rows remain visible in the table but are visually dimmed and tagged "Superseded → v2". No collapsing / threading UI in this pass — it's a log, reviewers should see everything.

## Data model changes

`src/routes/index.tsx` — extend the `ProcessedItem` shape:

```ts
interface ProcessedItem {
  id: string;
  timestamp: number;
  requestText: string;
  attachments: Attachment[];
  aiDecision: Decision;
  finalDecision: { category; priority; route };
  ruleResult: RuleResult;
  overridden: boolean;
  // NEW
  reviewer: string;              // free-form, may be ""
  revision: number;              // 1 for first commit, 2+ for revisions
  supersedesId?: string;         // id of the row this replaces
  supersededById?: string;       // set on the old row when a revision is saved
}
```

## Behavior changes

### Triage panel
- Add a "Reviewer name" text input above the Triage/Load-sample buttons. Value held in a `reviewer` state string. Placeholder: "Your name (shown on finalized decisions)".
- Passed into every Accept / Save-override call.

### Decision Card — three modes
1. **Draft** (default, item not yet in queue): current behavior — Accept + Override controls, confidence bar, flags.
2. **Finalized** (opened from Queue via Review, and this row has no `supersededById`): read-only.
   - Header banner: `Finalized · v{n} · Accepted by {reviewer || "—"} · {relative time}`.
   - Show final category / priority / route / status / flags / embargo exactly as committed.
   - Replace Accept + Override with a single **Reopen for revision** button.
3. **Revising** (user clicked Reopen): controls unlock again, banner changes to `Revising v{n} → will save as v{n+1}`. Accept button relabels to **Save as revision v{n+1}**. Cancel button returns to Finalized mode.

### Save-as-revision
- Builds a new `ProcessedItem` with `revision = prev.revision + 1`, `supersedesId = prev.id`, fresh `timestamp`, and current `reviewer`.
- Updates the previous row in place to set `supersededById = new.id` (this is the *only* mutation of an existing row — a pointer, not a decision change).
- Appends the new row to `processedQueue`.
- Toast: "Saved revision v{n+1}. Previous version marked superseded."

### Queue table
- New column **Rev** showing `v1`, `v2`, etc.
- Superseded rows: row opacity `0.55`, a small "Superseded" pill next to the Rev cell, and the Review action label changes to **View** (opens read-only, no Reopen button — you can only revise the current version).
- Reviewer column added (or folded into the timestamp cell as `12:04 · Alex`).
- Summary counters (escalated vs auto-routed) count **current versions only** — filter out rows where `supersededById` is set. Add a small muted line: `+ {n} superseded revisions in log`.

### Re-triage from Triage panel
When a request is already in the queue and the user clicks Triage again on the same text (fresh triage, not via Review), treat it as a brand-new draft — no auto-linking. Revisions only happen via the Reopen flow. This keeps the audit trail unambiguous: revisions are explicit reviewer actions, not accidental re-runs.

## Files touched

- `src/routes/index.tsx` — all of the above (state, card modes, queue table, reviewer input, revision handler).
- No changes to `apply-rules.ts`, `classify-request.functions.ts`, `rulebook.ts`, `embargo.ts`, `attachments.ts`, or sample data.

## Verification

- Type-check passes.
- Manual: Accept a sample → Queue shows v1 with reviewer. Click Review → card is read-only with banner. Click Reopen → controls unlock, Save as v2. Queue now shows v1 dimmed + "Superseded", v2 active. Counters reflect v2 only. Click Review on v1 → read-only view, no Reopen button.

## Out of scope

- Persistence (still in-memory).
- Diff view between revisions (v1 vs v2 side-by-side) — nice-to-have, defer.
- Reviewer identity from auth — not until we add users.
- Collapsing superseded rows behind a toggle — defer until the log gets noisy.
