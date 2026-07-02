/**
 * Server function: classifyRequest
 *
 * Replaces the mock keyword classifier with a real LLM call.
 * Runs server-side only — LOVABLE_API_KEY is never sent to the browser.
 *
 * IMPORTANT: This function ONLY classifies. It does not apply the rulebook's
 * confidence gate or the safety guardrails — those stay in `applyRules` on
 * the client. Guardrails are deterministic code, never prompts.
 */

import { createServerFn } from "@tanstack/react-start";
import { generateText, Output, NoObjectGeneratedError } from "ai";
import { z } from "zod";

import { createLovableAiGatewayProvider } from "./ai-gateway.server";
import {
  RULEBOOK,
  type Category,
  type Priority,
  type Rulebook,
} from "./rulebook";
import type { Decision } from "./mock-classify";

// Wire-format we ask the model to produce. `category` is validated as an enum
// against the current rulebook so any hallucinated value is rejected server-side.
const ClassificationSchema = z.object({
  category: z.enum(RULEBOOK.categories as unknown as [Category, ...Category[]]),
  priority: z.enum(RULEBOOK.priorities as unknown as [Priority, ...Priority[]]),
  reason: z.string().min(1).max(400),
  confidence: z.number().min(0).max(1),
});

const AttachmentMetaSchema = z.object({
  filename: z.string().min(1).max(300),
  mimeType: z.string().min(1).max(200),
  sizeBytes: z.number().min(0),
});

const InputSchema = z.object({
  requestText: z.string().min(1).max(8000),
  attachments: z.array(AttachmentMetaSchema).max(50).optional().default([]),
});

type AttachmentMeta = z.infer<typeof AttachmentMetaSchema>;

function renderAttachments(atts: readonly AttachmentMeta[]): string {
  if (atts.length === 0) return "Attachments: (none)";
  const lines = atts
    .map(
      (a, i) =>
        `  ${i + 1}. ${a.filename}  (${a.mimeType}, ${a.sizeBytes} bytes)`,
    )
    .join("\n");
  return `Attachments (metadata only — file contents were NOT read):\n${lines}`;
}

function buildSystemPrompt(rb: Rulebook): string {
  const categoryLines = rb.categories
    .map((c) => `  - ${c} -> route: "${rb.routes[c]}"`)
    .join("\n");

  return [
    "You are a triage classifier for an incoming research-data-repository request.",
    "Your job is to pick the single dominant category, priority, and a one-sentence reason.",
    "",
    `Vertical: ${rb.vertical}`,
    "",
    "Allowed categories (each maps to a fixed route — you MUST NOT invent new ones):",
    categoryLines,
    "",
    `Allowed priorities: ${rb.priorities.join(", ")}`,
    "  - urgent = explicit deadline today/ASAP, breach, exposed data, or clear time-critical language.",
    "  - normal = a real actionable request without a same-day deadline.",
    "  - low    = vague, low-effort, or purely informational chit-chat.",
    "",
    "Rules you MUST follow:",
    "  1. Pick exactly ONE category from the allowed list. Never invent a category.",
    "  2. The route is derived from the category by the rulebook — do not choose it yourself.",
    "  3. Return a confidence between 0 and 1. If the message is ambiguous, short,",
    "     or plausibly fits several categories, return a LOW confidence (<= 0.6)",
    "     rather than guessing. A wrong high-confidence answer is worse than a",
    "     humble low-confidence one — a human reviews low-confidence items.",
    "  4. `reason` must be a single short sentence explaining the match in plain English.",
    "  5. Do not include any text outside the JSON object.",
    "  6. You will also receive attachment metadata (filename + mime type + size).",
    "     Use it as evidence about what the sender included — for example an",
    "     `irb_approval.pdf` alongside an access request is meaningful context, and",
    "     an `error_screenshot.png` supports a technical_platform classification.",
    "     You have NOT seen the file bytes; do not claim to have read them.",
    "  7. If the requester asks for an embargo, note it in `reason` in plain",
    "     English. Do NOT compute or infer a release date from a duration such as",
    "     \"6 months\" — only a human curator sets that. Embargo handling is",
    "     enforced deterministically downstream from this classifier.",
  ].join("\n");
}

export const classifyRequest = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data }): Promise<Decision> => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) {
      throw new Error(
        "LOVABLE_API_KEY is not configured on the server. Cannot classify.",
      );
    }

    const gateway = createLovableAiGatewayProvider(key);
    const model = gateway("google/gemini-3-flash-preview");

    const attachments = data.attachments ?? [];
    const userPrompt = [
      "Incoming request:",
      '"""',
      data.requestText,
      '"""',
      "",
      renderAttachments(attachments),
      "",
      "Return the JSON classification now.",
    ].join("\n");

    try {
      const { output } = await generateText({
        model,
        system: buildSystemPrompt(RULEBOOK),
        prompt: userPrompt,
        output: Output.object({ schema: ClassificationSchema }),
      });

      // Route is derived server-side from the rulebook, not from the model.
      const category = output.category as Category;
      const decision: Decision = {
        category,
        priority: output.priority as Priority,
        route: RULEBOOK.routes[category],
        reason: output.reason.trim(),
        confidence: Math.max(0, Math.min(1, output.confidence)),
      };
      return decision;
    } catch (err) {
      if (err instanceof NoObjectGeneratedError) {
        throw new Error(
          "The model returned an unparseable response. Please try again.",
        );
      }
      // Bubble up a readable message; the client turns it into a toast/inline error.
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`Classification failed: ${message}`);
    }
  });
