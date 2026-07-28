Update the AI Product Brief and Roadmap to accurately reflect that an Auditor role is future work, not an implemented implicit role.

## Changes

1. **docs/AI-Product-Brief.md — Users & Roles table**
   - Rename the third row from `Admin / Auditor (implicit)` to `Auditor (future)`.
   - Update the description to: "A future role for reviewing audit logs, guardrail acknowledgments, and override reasons. Today any authenticated user can read the revision history; a dedicated Auditor role is not yet implemented."
   - Update the Access column to: "Future: read-only audit view. Not implemented in the current role table."

2. **docs/Roadmap.md — P3 Operational Maturity**
   - Add a new bullet under P3: "Introduce a dedicated read-only Auditor role with scoped access to the full audit trail and compliance exports."

## Out of scope
- No code changes.
- No new role implementation.
- No other docs edits.