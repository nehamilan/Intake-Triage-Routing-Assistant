
# Embargo Detection & Exact-Date Guardrail

Deposits that mention an embargo often lack a machine-actionable release date. This change extracts an exact `YYYY-MM-DD` when the requester provides one, and escalates every other case (month-only, relative duration, vague) to human review with the raw phrase preserved. Mirrors the attachments pattern: deterministic rules are the source of truth; the LLM stays advisory.

## Behaviour

An embargo is "mentioned" if the text contains any of: `embargo`, `under embargo`, `hold until`, `release on`, `do not publish until`, `keep private until`.

Parsing outcomes:
- **Exact date found** (`2027-03-01`, `March 1 2027`, `1 March 2027`, `01/03/2027` ISO-only to avoid US/EU ambiguity) → attach `embargo.date`, no escalation from this rule.
- **Month + year only** ("March 2027") → `date = null`, `reason = "month_only"` → escalate.
- **Relative duration** ("for 6 months", "for 2 years", "for a while") → `date = null`, `reason = "relative"` → escalate. No anchoring to today.
- **Embargo word but nothing parseable** → `date = null`, `reason = "vague"` → escalate.

Ambiguous numeric dates like `03/01/2027` (could be US or EU) are treated as unparseable → escalate.

## Files

**New: `src/lib/embargo.ts`**
- `detectEmbargo(text): { mentioned: boolean; date: string | null; rawPhrase: string | null; reason: "exact" | "month_only" | "relative" | "vague" | null }`
- Keyword scan + regex passes for ISO, "Month D, YYYY", "D Month YYYY".
- Explicit rejection list for relative patterns (`/for\s+\d+\s+(day|week|month|year)s?/i`, `/for\s+a\s+while/i`).

**Edit: `src/lib/apply-rules.ts`**
- Extend return type with `embargo?: { date: string | null; rawPhrase: string; reason: string }`.
- New **Guardrail C** (runs after A and B, before the confidence gate):
  - If `detectEmbargo` returns `mentioned && reason !== "exact"` → force `finalRoute = "Human Review Queue"`, `status = "escalated_missing_embargo_date"`, add flag: *"Embargo mentioned but no exact release date — curator must confirm anchor and set YYYY-MM-DD."*
  - If `mentioned && reason === "exact"` → attach `embargo` to result, no override.
- Guardrails A and B still win over C (privacy incident and access-without-approval remain highest priority).

**Edit: `src/lib/classify-request.functions.ts`**
- Add `embargo` to the JSON schema the LLM returns (`{ mentioned, date, rawPhrase }`), and instruct: *"Only return `date` if the requester wrote an exact calendar date. Never compute a date from a duration."*
- LLM output stays advisory; `apply-rules` overwrites `embargo` with the deterministic extractor's result before persisting.

**Edit: `src/routes/index.tsx`**
- **Decision Card**: new "Embargo" row with a calendar glyph.
  - Exact date → mono `2027-03-01` + small "release date" caption.
  - Missing/vague → amber pill "Date missing" + the raw phrase in quotes.
  - Not mentioned → row hidden.
- **Queue table**: new compact embargo badge column (calendar icon + date, or amber dot if missing). Hidden when no row in the queue has an embargo.

**Edit: `src/lib/sample-requests.ts`**
- Add three deposits to exercise all paths:
  1. Exact: *"Please deposit the attached dataset and embargo until 2027-06-30."*
  2. Month-only: *"Deposit this collection, embargo until March 2027."*
  3. Relative/vague: *"Upload these files but please embargo for 6 months."*

## Out of scope

- Persisting embargo dates to a backend (still in-memory queue).
- Automatic release/reminder scheduling.
- Timezone handling — dates stored as plain `YYYY-MM-DD`.
- Auto-anchoring relative durations to today.

## Verification

After build, load samples, Triage All, and confirm:
- Sample 1 → auto-routed to Curation, Decision Card shows `2027-06-30`.
- Samples 2 and 3 → escalated to Human Review Queue with the "Date missing" flag and raw phrase visible.
- Existing privacy-incident and access-without-approval samples still escalate under Guardrails A/B (C does not override them).
