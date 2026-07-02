
## Confirmed approach

Based on your answers:
1. **Step-by-step Tier 1**: I will **wait for your prompts one at a time**. I won't build all of Tier 1 up front. After each of your prompts (1.1 → 1.5), I implement, you test in preview, then you paste the next prompt.
2. **Design directions first**: On the first Tier 1 prompt that produces visible UI (prompt 1.1 — scaffold + layout), I will generate **3 rendered design directions** and ask you to pick one before writing any UI code. Later prompts (1.2–1.5) extend that same chosen direction, no re-picking.
3. **`project_specs.md` now**: I will create it as the very first artifact, before any code, per your `instructions.md` Step 1. You approve it before we move on.

## What happens the moment you approve this plan

**Action 1 — write `project_specs.md`** at the repo root, covering:
- **Inputs**: free-text intake message (paste-in); later, CSV upload for evaluation.
- **Workflows**: single-item triage → decision card → accept/override → queue. Batch triage of seeded samples. (Tier 2+: real LLM. Tier 3+: persistence, auth, dashboard, evaluation.)
- **Tools**: Lovable stack — TanStack Start (React 19) on Cloudflare Workers, Tailwind v4, shadcn/ui, bun. Tier 2 adds Lovable Cloud + Lovable AI Gateway (server-side model call, key held as server env). Tier 3 adds Lovable Cloud Postgres + Auth.
- **Outputs**: structured decision `{ category, priority, route, reason, confidence }` + rules-layer `{ finalRoute, status, flags }` + reviewer's final decision.
- **Storage**: Tier 1 in-memory only. Tier 3 Postgres `requests` table.
- **Deployment**: Lovable Publish (Cloudflare Workers). Not GitHub Pages — that section of your instructions doesn't apply to this stack. I will **not** publish without your explicit "publish now" confirmation.
- **Definition of Done** per tier (Tier 1 DoD copied from the previous plan).
- **Non-negotiables** carried across all tiers: guardrails + confidence gate live in **deterministic code**, never in the model; safety-critical logic must not be movable into a prompt.

**Action 2 — stop and wait** for you to (a) review `project_specs.md`, and (b) paste **Prompt 1.1**.

## What I will do when you paste Prompt 1.1

Prompt 1.1 defines the scaffold: header, subtitle "Decision support — a human reviews every decision", left textarea + Triage button, empty right panel, and the frozen `RULEBOOK` object.

Steps in order:
1. Create `src/lib/rulebook.ts` with the exact rulebook object from prompt 1.1 (verbatim: 7 categories, route map, `confidenceThreshold: 0.7`).
2. Set real page metadata in `src/routes/__root.tsx` (title "Intake Triage & Routing Assistant", matching description + og/twitter).
3. **Generate 3 design directions** for the two-panel triage surface (locked to a neutral, professional, regulated-intake aesthetic — calm palette, restrained motion, strong badge/status semantics, generous whitespace). I'll ask you a single "which direction?" question.
4. **Stop** and wait for your pick.
5. Once picked, implement the scaffold UI in `src/routes/index.tsx` matching the chosen direction's composition, tokens, and typography exactly. Textarea + Triage button are wired but the button is inert until Prompt 1.2 adds the mock classifier.

## Universal rules I will follow across every Tier 1 prompt

- Strict TypeScript, no `any`, explicit interfaces for `Decision`, `RulesOutcome`, `QueueItem`, `Rulebook`.
- Rulebook lives as **data**, not code — never inline categories/routes into components.
- Guardrails and confidence gate live in `src/lib/apply-rules.ts` as pure functions with unit-testable signatures. Same file survives untouched into Tier 2.
- Zero API calls, zero secrets, zero persistence in Tier 1.
- After each prompt I'll verify the specific behavior it added (targeted preview check) before telling you it's done.
- No publish without explicit confirmation.

## Explicit scope for this approval

Approving this plan means: **I write `project_specs.md`, then stop and wait for your Prompt 1.1.** No UI code, no design directions, no rulebook file yet — those wait for Prompt 1.1.
