Add client-side sorting to the Queue table, controlled entirely by clickable `<th>` headers. No separate sort dropdown and no persistence — default to newest-first on every visit.

## What we’ll change

### 1. Sort state in `QueueView`
- Add local state in `src/routes/index.tsx` inside `QueueView`:
  - `sortField`: `"date" | "priority"`
  - `sortDir`: `"asc" | "desc"`
- Default on mount: `sortField = "date"`, `sortDir = "desc"`.

### 2. Make `Th` interactive
- Update the `Th` helper to accept an optional `onClick`, `sorted`, and `direction`.
- Render a small sort indicator (▲ / ▼) next to the label/assets label when active.
- Use `cursor-pointer` and `hover:bg-muted` only on sortable columns.
- Keep non-sortable headers (Embargo, Status, Override, Action) plain.

### 3. Sortable columns
Only **Time** and **Priority** get click-to-sort behavior:
- **Time**: sorts by `item.timestamp`.
  - `desc` = newest first (default)
  - `asc` = oldest first
- **Priority**: sorts by a fixed numeric weight.
  - `desc` = urgent → normal → low
  - `asc` = low → normal → urgent

### 4. Apply sort after filters
- Keep the existing status / route / priority filters unchanged.
- After filtering, sort `rows` by the active `sortField` and `sortDir`.
- Counters and the filter result count remain based on the filtered set.

### 5. Visual polish
- Active sort header gets a subtle highlight (`bg-muted/60` or similar).
- Add `title` attributes so reviewers know the next click direction.
- Ensure the indicator is accessible via `aria-sort` on the `<th>`.

## Files touched
- `src/routes/index.tsx` only.

## Out of scope
- No persistence (localStorage) — resets to newest-first each visit as requested.
- No sorting by Category, Route, Status, or Override.
- No changes to filters or counters.