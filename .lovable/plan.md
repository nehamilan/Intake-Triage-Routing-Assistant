## Goals

Fix two issues with the queue/audit experience:

1. **Counters are misleading.** Drop "Superseded" from the header. Show **Current / Auto-routed / Escalated / Overridden**, all computed over the *latest* version of each request.
2. **Queue shows one row per version.** Collapse to **one row per request**, with the full revision history living inside that row as a timeline. Every revision records what changed, who did it, when, and why.

## Design decisions

### One row per request (Issue 2)

- The queue table is keyed by the **root request id** (the id of v1). Latest version's decision drives the visible row.
- Version chip on the row (`v3`) signals revision history exists. Opening the row shows the current Decision Card on top, and a **timeline** of every version underneath.
- Superseded rows still exist in state (immutability preserved) — they're just not their own rows in the table.

### Timeline format

Each version renders as a compact block:

```
v3 · 16:31 · ST · overridden
     Category: Metadata / curation → Deposit assistance
     Priority: Normal → High
     "Author confirmed this is a new deposit, not a metadata fix."

v2 · 16:29 · NM · overridden
     Category: Deposit assistance → Metadata / curation
     (no reason recorded)

v1 · 16:28 · NM · accepted
     Initial: Deposit assistance · Normal · Human Review Queue
```

- v1 shows initial values (no diff).
- Later versions show only fields that changed, arrow-formatted.
- Action verb (`accepted` / `overridden` / `re-accepted`) is derived from `overridden` + `changes.length`.
- Guardrail bypasses are called out with a distinct marker (see below).

### Change tracking

At save time, compute a `changes` array by comparing the previous version's snapshot with the new one. Frozen onto the new row; never recomputed on render.

```ts
type FieldChange = {
  field: "category" | "priority" | "route" | "status";
  from: string;
  to: string;
};
```

- Only decision-relevant fields are tracked (category, priority, route, status).
- Reviewer name and timestamp are metadata, not "changes."
- Flags/embargo state are derived from the request text — out of scope for `changes`.
- `changes: []` is valid and meaningful — a plain re-endorsement by a new reviewer is a real audit event.

### Reason field

New `reason: string` on each revision row. UX rules:

- **Required** when `changes.length > 0` (the reviewer changed something the AI or a previous reviewer decided).
- **Optional** on plain acceptance of the AI's proposal (v1 with no override) or a re-accept with no field changes.
- Rendered as a placeholder in Draft/Revising mode: *"Required — why are you overriding?"* vs *"Optional — add context for the audit log"*.
- Save button disabled with hint text when required and empty. No hard minimum word count. Soft guidance ~500 chars.

### Guardrail-bypass acknowledgment

When the current ruling has an escalation status (`escalated_low_confidence`, `escalated_guardrail`, `escalated_privacy_incident`, `escalated_parse_failure`, `escalated_embargo_missing_date`, `escalated_attachment_missing`) AND the reviewer overrides it to auto-route:

- Show a distinct **"I acknowledge I am overriding a safety escalation"** checkbox above the reason field, with the specific flag(s) listed inline.
- Both checkbox AND reason are required to save.
- Store `guardrailAcknowledged: true` on the revision row.
- Timeline marks this version with a warning icon and a line: *"⚠ Bypassed guardrail: <flag summary>"* above the diff.

## Data model changes

`src/routes/index.tsx` — extend `QueueItem`:

```ts
interface QueueItem {
  // ... existing fields ...
  reviewer: string;
  revision: number;
  supersedesId?: string;
  supersededById?: string;
  // NEW
  rootId: string;                // id of v1; same across all revisions of one request
  changes: FieldChange[];        // empty on v1; diff vs previous version otherwise
  reason: string;                // empty allowed only when changes.length === 0 and no guardrail bypass
  guardrailAcknowledged: boolean;// true only when reviewer bypassed an escalation
}
```

`rootId` lets us group revisions in the table without walking the `supersedesId` chain on every render.

## Behavior changes

### Header counters

- Replace 5 tiles with 4: **Current / Auto-routed / Escalated / Overridden**.
- All computed over `queue.filter(item => !item.supersededById)` — the latest version of each request.
- Small muted line below: `N requests · M revisions in log` so the audit volume is still visible.

### Queue table

- One row per `rootId`. Row content driven by the latest version.
- **Rev** column shows `v{n}` for the current version. Clicking the row (or a "View" / "Open…" button) opens it in the workspace.
- No more dimmed/struck superseded rows in the table.
- Reviewer column shows the latest version's reviewer.

### Workspace (right panel) when viewing a queued item

- Top: current Decision Card (read-only until Reopen).
- Below the card: **Revision timeline** — one block per version, newest first, formatted as above.
- Reopen for revision behavior unchanged (unlocks controls, save appends a new version).

### Save flow (append revision)

On save:
1. Compute `changes` by diffing current form values against the previous version's snapshot.
2. Validate: if `changes.length > 0`, require non-empty `reason`. If overriding an escalation, require both `guardrailAcknowledged` and non-empty `reason`.
3. Append new `QueueItem` with `revision = prev.revision + 1`, `rootId = prev.rootId`, `supersedesId = prev.id`, current `reviewer`, computed `changes`, `reason`, `guardrailAcknowledged`.
4. Set `prev.supersededById = new.id`.
5. Toast: *"Saved revision v{n+1}."*

### First-time finalize (v1)

- `rootId = self.id`, `revision = 1`, `changes = []`, `reason = ""` (optional), `guardrailAcknowledged = false` unless the reviewer overrode a guardrail on the initial pass — in which case the same acknowledgment + reason rules apply.

## Files touched

- `src/routes/index.tsx` — all UI, state, timeline component, counter changes.
- No changes to `apply-rules.ts`, `classify-request.functions.ts`, `rulebook.ts`, `embargo.ts`, `attachments.ts`, sample data.

## Out of scope

- Persistence (still in-memory).
- Side-by-side diff view of two arbitrary versions.
- Editing request text after finalize (still locked).
- Reason on `flags` changes (flags are derived, not reviewer-set).

## Verification

- Accept v1 with no override → no reason required, saves cleanly. Queue shows one row, `v1`.
- Reopen → override category → try to save without reason → save blocked with hint. Add reason → saves as v2. Queue still one row, chip now `v2`, timeline shows v1 and v2 with the diff and reason.
- Reopen v2 → override an escalated (guardrail) status → checkbox appears, both checkbox and reason required. Save → v3 appears in timeline with the ⚠ bypass marker.
- Reopen v3 → click Save with no field changes → saves as v4 with `changes: []`, timeline reads "re-accepted, no changes."
- Header shows Current=1, Overridden reflects latest version only. Muted line reads `1 request · 3 revisions in log`.
