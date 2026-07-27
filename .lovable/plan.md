## Problem

The vertical switcher (Research Data / Banking Complaints) currently only swaps the active *rulebook* used for new triage. It does not scope the Queue, so requests from both verticals appear together regardless of the selection. Root cause: the `requests` table has no `vertical` column, so persisted rows carry no domain tag to filter on.

## Fix

Tag every persisted request with its vertical, then scope the Queue (and Dashboard KPIs/charts) to the active vertical.

### 1. Database migration
Add a `vertical` column to `requests`:
- `vertical text not null default 'research'` (values: `'research' | 'banking'`)
- Backfill: all existing rows become `'research'` (that's the vertical they were created under before this feature existed).
- No RLS change needed — existing policies still apply.

### 2. Persistence (`src/lib/queue-db.ts`)
- `persistNewRequest(...)` writes `vertical: verticalId` on insert.
- `loadQueue()` selects the `vertical` field and maps it onto `QueueItem`.
- `QueueItem` type gains `vertical: VerticalId`.

### 3. Agent Queue (`src/routes/index.tsx`)
- Read `verticalId` from `useRulebook()` (already available).
- Filter `processedQueue` to `item.vertical === verticalId` before computing counters and rendering rows.
- Empty state copy updates to: *"No requests in the {rulebook.label} queue yet."*

### 4. Dashboard (`src/routes/dashboard.tsx`)
- Same scoping: filter the requests read by active vertical so KPIs, charts, and escalation-reason table reflect the selected domain only.
- Header line notes: *"Showing {rulebook.label}"*.

### 5. Evaluation page
No change — the evaluation runner already uses the active rulebook for classification; results are ephemeral, not persisted.

## Out of scope
- No cross-vertical "All" view. If needed later, add an "All verticals" option to the switcher.
- No migration of historical rows between verticals — everything pre-existing stays as `research`.

## Technical notes
- Column type is `text` (not enum) to keep future verticals cheap to add without a schema change.
- `QueueItem.vertical` is required after migration; TypeScript will flag any missed write site, which is how we catch omissions.
- Filtering is client-side against already-loaded rows (queue sizes are small and this matches the existing filter pattern). If volumes grow, move to a `.eq('vertical', verticalId)` server-side filter in `loadQueue`.
