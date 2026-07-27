## Goal
Create the documentation structure for the AI Product Manager portfolio project. No content writing yet — only files, directories, and section headings.

## Scope
- Leave the existing `README.md` untouched.
- Create a `/docs` directory with 11 markdown files.
- Create an `/assets` directory with three subdirectories for screenshots, diagrams, and demo artifacts.
- Each markdown file gets a frontmatter block, an H1 title, and a set of H2 section headings that match the project's architecture and narrative.

## Deliverables

### Directories
- `/docs`
- `/assets/screenshots`
- `/assets/diagrams`
- `/assets/demo`

### Files to create

1. **`/docs/AI-Product-Brief.md`**
   - Title: AI Product Brief: Intake Triage & Routing Assistant
   - Headings: Problem, Users & Roles, AI's Job, Inputs & Outputs, Success Metrics, Non-Goals, Vertical Portability

2. **`/docs/Model-Decision-Design.md`**
   - Title: Model Decision Design
   - Headings: Task Shape, Model Inputs, Model Outputs, Category-to-Route Mapping, Confidence as a Signal, What the Model Does Not See

3. **`/docs/Output-Guardrails.md`**
   - Title: Output Guardrails
   - Headings: Guardrail Sandwich, Pre-Check Layer, Post-Check Layer, Escalation Statuses, Fail-Safe Parsing, Confidence Gate

4. **`/docs/Evaluation-Framework.md`**
   - Title: Evaluation Framework
   - Headings: Test Set Format, Accuracy Metrics, Confusion Matrix, Escalation Recall, Running an Evaluation, Exporting Results

5. **`/docs/Uncertainty-and-Fallbacks.md`**
   - Title: Uncertainty & Fallbacks
   - Headings: Confidence Threshold, Parse Failures, Network Failures, Model Hallucinations, Short-Circuit Escalations

6. **`/docs/Human-in-the-Loop.md`**
   - Title: Human-in-the-Loop
   - Headings: Reviewer Workflow, Accept vs Override, Revisions & Audit Log, Guardrail Acknowledgment, Role-Based Access

7. **`/docs/Risk-Analysis.md`**
   - Title: Risk Analysis
   - Headings: Failure Modes, Mitigations, Residual Risks, Compliance Considerations, Abuse Scenarios

8. **`/docs/Product-Tradeoffs.md`**
   - Title: Product Tradeoffs
   - Headings: Safety Over Throughput, Rulebook as Data, Metadata-Only Attachments, Single Model, Free-Text Reviewer Identity

9. **`/docs/Technical-Architecture.md`**
   - Title: Technical Architecture
   - Headings: Stack Overview, Route & Component Structure, Server Functions, Database Schema, Authentication & Authorization, Styling & Theming

10. **`/docs/Prompt-Design.md`**
    - Title: Prompt Design
    - Headings: System Prompt, Enum Injection, Attachment Metadata Handling, Date & Embargo Instructions, Confidence Calibration

11. **`/docs/Roadmap.md`**
    - Title: Roadmap
    - Headings: P0 — Ship Blockers, P1 — Continuous Quality, P2 — Capability Expansion, P3 — Operational Maturity

## Implementation notes
- Use standard Markdown with YAML frontmatter (`title`, `description`).
- Each file contains only the H1 and H2 headings; no body paragraphs, no code blocks, no diagrams at this stage.
- Asset directories remain empty until content population.
- No changes to `README.md` or any application code.