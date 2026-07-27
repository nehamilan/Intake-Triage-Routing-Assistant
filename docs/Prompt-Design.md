---
title: Prompt Design
description: System prompt structure, enum injection, attachment metadata, embargo instructions, and confidence calibration.
---

# Prompt Design

## System Prompt

The system prompt is constructed server-side from the active rulebook. It tells the model:

- The task: classify the request into one category, one route, one priority.
- The allowed values, injected dynamically from the rulebook.
- The output format: a JSON object with `category`, `route`, `priority`, `confidence`, and `reason`.
- Behavioral constraints: do not invent categories, do not parse attachments, be concise.

The prompt is not exposed to the client. It lives in the server function so it cannot be inspected or manipulated by end users.

## Enum Injection

Allowed categories, routes, and priorities are injected into the prompt as explicit lists. For example:

```
Allowed categories: dataset_inquiry, restricted_data_request, embargo_question, general_inquiry
Allowed priorities: urgent, normal, low
```

This makes the model less likely to hallucinate labels and makes the downstream whitelist validation more effective. The route is also included in the prompt, but the final route is always looked up from the rulebook to guarantee correctness.

## Attachment Metadata Handling

The prompt includes attachment metadata in a structured block:

```
Attachments:
- data_dictionary.xlsx (application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, 24 KB)
```

The model is explicitly told:

> You do not have access to the contents of these files. Use only the file names and types to inform your classification.

This keeps the model honest about what it can and cannot infer from attachments.

## Date & Embargo Instructions

For the research-data vertical, the prompt includes embargo handling instructions:

> If the request mentions an embargo but does not include an exact date in YYYY-MM-DD format, classify it as `embargo_question` and set priority based on urgency.

The actual escalation to human review is handled deterministically in `applyRules` by checking for an exact date with regex. The prompt's job is to produce the right category; the guardrail's job is to enforce the date requirement.

## Confidence Calibration

The prompt asks for a `confidence` score between 0 and 1. To encourage calibration, it includes examples:

- 0.9+ — category is obvious from clear keywords.
- 0.7–0.89 — category is plausible but wording is ambiguous.
- Below 0.7 — the request is ambiguous, multi-domain, or missing critical context.

The downstream system uses 0.7 as the auto-route threshold. If the model is consistently overconfident, the threshold can be raised or the prompt examples can be refined.
