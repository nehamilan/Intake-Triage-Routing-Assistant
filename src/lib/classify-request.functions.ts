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
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { generateText, Output } from "ai";
import { z } from "zod";

import { createLovableAiGatewayProvider } from "./ai-gateway.server";
import {
  RULEBOOKS,
  type Category,
  type Priority,
  type Rulebook,
  type VerticalId,
} from "./rulebook";
import type { Decision } from "./mock-classify";

const AttachmentMetaSchema = z.object({
  filename: z.string().min(1).max(300),
  mimeType: z.string().min(1).max(200),
  sizeBytes: z.number().min(0),
});

const InputSchema = z.object({
  requestText: z.string().min(1).max(8000),
  attachments: z.array(AttachmentMetaSchema).max(50).optional().default([]),
  vertical: z.enum(["research", "banking"]).optional().default("research"),
});

type AttachmentMeta = z.infer<typeof AttachmentMetaSchema>;

// Wire-format we ask the model to produce. `category` is validated as an enum
// against the ACTIVE rulebook so any hallucinated value is rejected server-side.
function makeClassificationSchema(rb: Rulebook) {
  return z.object({
    category: z.enum(rb.categories as unknown as [Category, ...Category[]]),
    priority: z.enum(rb.priorities as unknown as [Priority, ...Priority[]]),
    reason: z.string().min(1).max(400),
    confidence: z.number().min(0).max(1),
  });
}

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

/**
 * A fail-safe decision returned whenever the model output is unparseable,
 * schema-invalid, or names a category the rulebook doesn't know. The
 * category/priority/route are placeholders — `applyRules` sees
 * `parseFailed: true` and routes the item to Human Review regardless.
 */
function parseFailureDecision(rb: Rulebook): Decision {
  const fallbackCategory = (rb.categories.includes("general_inquiry")
    ? "general_inquiry"
    : rb.categories[0]) as Category;
  return {
    category: fallbackCategory,
    priority: "normal",
    route: rb.routes[fallbackCategory] ?? "General Support",
    reason: "Model output invalid — routed to human review.",
    confidence: 0,
    parseFailed: true,
  };
}

// ---------------------------------------------------------------------------
// Deterministic PRE-CHECK layer.
//
// Safety-critical routing must never depend on the model alone. This is the
// leading slice of the "deterministic guardrails -> model -> deterministic
// guardrails" sandwich: the trailing slice lives in `applyRules` on the
// client. Even if the LLM call succeeds with a confident-but-wrong answer,
// or fails entirely, these text-driven patterns guarantee the riskiest
// signals still land on a human reviewer.
// ---------------------------------------------------------------------------

const containsAny = (text: string, terms: readonly string[]) =>
  terms.some((t) => text.includes(t));

/**
 * Short-circuit Decision for a suspected privacy/fraud incident. Category is
 * a rulebook-appropriate high-severity fallback; `applyRules` will overwrite
 * the route to Human Review Queue and stamp the correct escalated status.
 */
function incidentDecision(rb: Rulebook, category: Category, reason: string): Decision {
  return {
    category,
    priority: "urgent",
    route: rb.routes[category] ?? "Human Review Queue",
    reason,
    confidence: 1,
  };
}

export const classifyRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data, context }): Promise<Decision> => {
    const { data: isAgent, error: roleErr } = await context.supabase.rpc(
      "has_role",
      { _user_id: context.userId, _role: "agent" },
    );
    if (roleErr || !isAgent) {
      throw new Error("Forbidden: agent role required to classify requests.");
    }

    const vertical = (data.vertical ?? "research") as VerticalId;
    const rb = RULEBOOKS[vertical];
    const text = data.requestText.toLowerCase();

    // Pre-check #1: privacy incident (research). Short-circuit — no model call.
    const privacyTriggers = rb.guardrails.privacyIncident?.triggers ?? [];
    if (privacyTriggers.length > 0 && containsAny(text, privacyTriggers)) {
      console.info("[classifyRequest] Pre-check hit: privacy incident. Skipping model.");
      const cat = (rb.categories.includes("restricted_data_access")
        ? "restricted_data_access"
        : rb.categories[0]) as Category;
      return incidentDecision(
        rb,
        cat,
        "Pre-check: request text matches privacy-incident patterns. Model skipped; escalated to human review.",
      );
    }

    // Pre-check #1b: fraud incident (banking). Short-circuit — no model call.
    const fraudTriggers = rb.guardrails.fraud?.triggers ?? [];
    if (fraudTriggers.length > 0 && containsAny(text, fraudTriggers)) {
      console.info("[classifyRequest] Pre-check hit: suspected fraud. Skipping model.");
      const cat = (rb.guardrails.fraud?.category ?? rb.categories[0]) as Category;
      return incidentDecision(
        rb,
        cat,
        "Pre-check: request text matches fraud patterns. Model skipped; escalated to human review.",
      );
    }

    // Pre-check #2: restricted-access-without-approval (research). Logged;
    // deterministic escalation is enforced downstream in `applyRules`.
    const accessCfg = rb.guardrails.accessRequiresApproval;
    if (
      accessCfg &&
      containsAny(text, accessCfg.textTriggers) &&
      !containsAny(text, accessCfg.approvalTerms)
    ) {
      console.info(
        "[classifyRequest] Pre-check hit: restricted access without stated approval.",
      );
    }

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

    const ClassificationSchema = makeClassificationSchema(rb);

    try {
      const { output } = await generateText({
        model,
        system: buildSystemPrompt(rb),
        prompt: userPrompt,
        output: Output.object({ schema: ClassificationSchema }),
      });

      const parsed = output as z.infer<typeof ClassificationSchema>;
      const category = parsed.category as Category;
      const route = rb.routes[category];
      if (!route) {
        console.error(
          "[classifyRequest] Model returned unknown category:",
          parsed.category,
        );
        return parseFailureDecision(rb);
      }

      return {
        category,
        priority: parsed.priority as Priority,
        route,
        reason: parsed.reason.trim(),
        confidence: Math.max(0, Math.min(1, parsed.confidence)),
      };
    } catch (err) {
      console.error("[classifyRequest] Model output invalid:", err);
      return parseFailureDecision(rb);
    }
  });

