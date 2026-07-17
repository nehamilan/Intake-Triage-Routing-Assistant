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

/**
 * A fail-safe decision returned whenever the model output is unparseable,
 * schema-invalid, or names a category the rulebook doesn't know. The
 * category/priority/route are placeholders — `applyRules` sees
 * `parseFailed: true` and routes the item to Human Review regardless.
 */
function parseFailureDecision(): Decision {
  return {
    category: "general_inquiry",
    priority: "normal",
    route: RULEBOOK.routes.general_inquiry,
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
//
// Two patterns are handled here:
//   1. Privacy incident — short-circuits the model entirely. We do not want
//      to spend a model call, add latency, or introduce any chance of a
//      benign-looking classification on a suspected breach.
//   2. Restricted-access-without-approval — we still call the model (a
//      curator wants its category/reason), but the guardrail escalation is
//      enforced downstream in `applyRules` regardless of what the model
//      says. This function only records the pre-check hit for logs.
// ---------------------------------------------------------------------------

const PRIVACY_TRIGGERS = [
  "breach",
  "exposed",
  "accidentally uploaded",
  "patient names",
  "personal data",
];
const ACCESS_TRIGGERS = ["access", "restricted", "sensitive"];
const APPROVAL_TERMS = ["approval", "ethics", "irb", "clearance"];

const containsAny = (text: string, terms: readonly string[]) =>
  terms.some((t) => text.includes(t));

/**
 * Short-circuit Decision for a suspected privacy incident. Category is set
 * to `restricted_data_access` (the safest cell in the rulebook) purely so
 * the UI has something coherent to show; `applyRules` will overwrite the
 * route to Human Review Queue and stamp the privacy-incident status.
 */
function privacyIncidentDecision(): Decision {
  return {
    category: "restricted_data_access",
    priority: "urgent",
    route: RULEBOOK.routes.restricted_data_access,
    reason:
      "Pre-check: request text matches privacy-incident patterns. Model skipped; escalated to human review.",
    confidence: 1,
  };
}

export const classifyRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data, context }): Promise<Decision> => {
    // Authorization: only signed-in "agent" users may classify. Viewers and
    // unauthenticated callers are rejected before any model call happens.
    const { data: isAgent, error: roleErr } = await context.supabase.rpc(
      "has_role",
      { _user_id: context.userId, _role: "agent" },
    );
    if (roleErr || !isAgent) {
      throw new Error("Forbidden: agent role required to classify requests.");
    }

    const text = data.requestText.toLowerCase();

    // Pre-check #1: privacy incident. Short-circuit — no model call.
    if (containsAny(text, PRIVACY_TRIGGERS)) {
      console.info(
        "[classifyRequest] Pre-check hit: privacy incident. Skipping model.",
      );
      return privacyIncidentDecision();
    }

    // Pre-check #2: restricted-access-without-approval. Record for logs; the
    // hard guardrail is enforced deterministically in `applyRules` and does
    // not rely on the model's category or confidence.
    if (
      containsAny(text, ACCESS_TRIGGERS) &&
      !containsAny(text, APPROVAL_TERMS)
    ) {
      console.info(
        "[classifyRequest] Pre-check hit: restricted access without stated approval. Calling model; guardrail will force escalation.",
      );
    }

    const key = process.env.LOVABLE_API_KEY;
    if (!key) {
      // Operator misconfiguration, not a model failure — surface as an error.
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

      // Defensive: even though Zod enforced the enum, verify the rulebook
      // knows this category before trusting its derived route. If the schema
      // is ever loosened, a hallucinated category still fails safe here.
      const category = output.category as Category;
      const route = RULEBOOK.routes[category];
      if (!route) {
        console.error(
          "[classifyRequest] Model returned unknown category:",
          output.category,
        );
        return parseFailureDecision();
      }

      return {
        category,
        priority: output.priority as Priority,
        route,
        reason: output.reason.trim(),
        confidence: Math.max(0, Math.min(1, output.confidence)),
      };
    } catch (err) {
      // NoObjectGeneratedError, schema validation failures, JSON parse errors,
      // and transient gateway errors all funnel here. We never throw — the
      // whole point of this hardening pass is that a broken model response
      // becomes a fail-safe escalation, not a crashed request.
      console.error("[classifyRequest] Model output invalid:", err);
      return parseFailureDecision();
    }
  });
