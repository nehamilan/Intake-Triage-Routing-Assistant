## Plan: Add vertical-portability wording to PRODUCT_ANALYSIS.md

### Goal
Reinforce that the Intake Triage & Routing Assistant is designed to transfer across regulated intake domains, using the existing research and banking verticals as proof.

### Changes
Make three targeted insertions into `PRODUCT_ANALYSIS.md`:

1. **TL;DR** — Add a bullet stating that the guardrail-sandwich architecture is portable across regulated verticals and that two verticals are already shipped.
2. **Section 2: The problem** — Add a paragraph explaining that the high-volume-routine / dangerous-tail pattern is common to healthcare, insurance, fraud, and legal intake, and that adaptation is a rulebook change.
3. **Section 11: What this project is meant to demonstrate** — Add a sixth point proving vertical portability through the two live rulebooks sharing one pipeline.

### Proposed text

**TL;DR insert:**
> **Portability across regulated verticals.** The same guardrail-sandwich architecture runs two shipped verticals — research-data intake and retail-banking complaints — and new domains (healthcare, insurance, legal intake) can be added by writing a rulebook, not rewriting the pipeline.

**Problem section insert:**
> While the seed vertical is a research data repository, the underlying pattern — high-volume routine intake with a dangerous, low-frequency tail — is common to healthcare patient portals, insurance claims, fraud hotlines, and legal intake. The product is designed so that adapting it to a new regulated vertical is a rulebook change, not an application rewrite.

**Conclusion section insert:**
> 6. **Vertical portability is proven, not claimed.** Two complete rulebooks — research data requests and banking complaints — share one classification pipeline, guardrail layer, and human-review workflow. That is intentional evidence that the safety architecture transfers to other regulated intake contexts.

### Scope
- Read-only analysis is complete.
- No code changes; documentation only.
- No backend, auth, or UI changes.

### Verification
- Review the rendered `PRODUCT_ANALYSIS.md` to ensure the new text fits the existing tone and structure.
- Confirm the three sections still flow naturally after insertion.