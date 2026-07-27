---
title: Evaluation Framework
description: How the product is measured against labeled test data, including accuracy and escalation recall.
---

# Evaluation Framework

## Test Set Format

Evaluations are run against a CSV file with the following columns:

| Column | Required | Description |
|--------|----------|-------------|
| `message` | Yes | The intake request text. |
| `true_category` | Yes | Expected category label. |
| `true_priority` | Yes | Expected priority label. |
| `true_route` | Yes | Expected route label. |

Optional columns can be added for future use (e.g., `should_escalate`, `expected_flags`), but the current implementation infers escalation need from guardrail conditions.

## Accuracy Metrics

For every row in the test set, the full pipeline runs: pre-checks, classification, post-checks, and rules. Three accuracy metrics are computed:

- **Routing accuracy** — `final_route === true_route`.
- **Priority accuracy** — `final_priority === true_priority`.
- **Category accuracy** — `final_category === true_category`.

These are displayed as prominent percentage cards at the top of the Evaluation page. They are the primary evidence that the product routes correctly.

## Confusion Matrix

A heatmap/table shows predicted category versus true category. This helps identify:

- Classes the model consistently confuses.
- Categories that may need better examples or rulebook refinement.
- Whether guardrail escalations are being counted correctly.

Each cell shows the count of test rows falling into that true/predicted pair. Rows that were escalated before reaching the model appear as a separate "escalated" bucket where appropriate.

## Escalation Recall

Escalation recall measures how well the system catches items that should not be auto-routed. In the current implementation, "should escalate" is inferred from:

- Pre-check privacy-incident patterns.
- Pre-check restricted-access patterns.
- Post-check confidence below 0.7.
- Post-check parse failures.
- Post-check embargo-date violations.

The metric is:

```
escalation_recall = correctly_escalated / should_have_been_escalated
```

A high escalation recall is more important than perfect routing accuracy for a safety-first product. The target is > 95%.

## Running an Evaluation

1. Navigate to the **Evaluation** page (agent-only).
2. Upload a CSV matching the test set format.
3. Select the vertical (research data or banking complaints) if needed.
4. Click **Run Evaluation**.
5. The system processes each row through the full pipeline and displays metrics, confusion matrix, and per-row results.

Rows are processed sequentially so the UI can stream results and keep the page responsive.

## Exporting Results

After an evaluation completes, the full result set can be downloaded as a CSV. The export includes:

- Original `message`, `true_*` labels.
- Predicted `ai_*` values.
- Final `final_*` values after rules and guardrails.
- `status` and `flags`.

This makes it easy to compare versions of the rulebook or model prompt over time.
