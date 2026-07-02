import { RULEBOOK, type Priority } from "./rulebook";
import type { Decision } from "./mock-classify";
import { type Attachment, textMentionsAttachments } from "./attachments";
import { detectEmbargo, type EmbargoDetection } from "./embargo";

export type TriageStatus =
  | "auto_routed"
  | "escalated_low_confidence"
  | "escalated_attachment_mismatch"
  | "escalated_guardrail"
  | "escalated_privacy_incident"
  | "escalated_missing_embargo_date";

export interface RuleResult {
  finalRoute: string;
  status: TriageStatus;
  flags: string[];
  priority: Priority;
  embargo: EmbargoDetection;
}

const HUMAN_REVIEW = "Human Review Queue";

const ACCESS_TRIGGERS = ["access", "restricted", "sensitive"];
const APPROVAL_TERMS = ["approval", "ethics", "irb", "clearance"];
const PRIVACY_TRIGGERS = [
  "breach",
  "exposed",
  "accidentally uploaded",
  "patient names",
  "personal data",
];

const contains = (text: string, terms: string[]) =>
  terms.some((t) => text.includes(t));

export function applyRules(
  decision: Decision,
  requestText: string,
  attachments: readonly Attachment[] = [],
): RuleResult {
  const text = requestText.toLowerCase();
  const flags: string[] = [];
  const embargo = detectEmbargo(requestText);

  let finalRoute = decision.route;
  let status: TriageStatus = "auto_routed";
  let priority: Priority = decision.priority;

  // Confidence gate — softest override.
  if (decision.confidence < RULEBOOK.confidenceThreshold) {
    finalRoute = HUMAN_REVIEW;
    status = "escalated_low_confidence";
    flags.push(
      `Confidence ${(decision.confidence * 100).toFixed(0)}% is below threshold ${(
        RULEBOOK.confidenceThreshold * 100
      ).toFixed(0)}% — human review required.`,
    );
  }

  // Attachment mismatch — the text references attachments but none arrived.
  // A reviewer needs to chase the missing files before any routing is safe.
  if (textMentionsAttachments(requestText) && attachments.length === 0) {
    finalRoute = HUMAN_REVIEW;
    status = "escalated_attachment_mismatch";
    flags.push(
      "Request references attachments but none were provided — chase the missing files before routing.",
    );
  }

  // Guardrail C — embargo mentioned but no exact release date.
  // Curators can't schedule release without a YYYY-MM-DD; anything vaguer must
  // be confirmed with the requester before the deposit is routed.
  if (embargo.mentioned && embargo.reason !== "exact") {
    finalRoute = HUMAN_REVIEW;
    status = "escalated_missing_embargo_date";
    const detail = embargo.rawPhrase ? ` ("${embargo.rawPhrase}")` : "";
    flags.push(
      `Embargo mentioned${detail} but no exact release date — curator must confirm anchor and set YYYY-MM-DD.`,
    );
  }

  // Guardrail A — restricted-data access without stated approval.
  const looksLikeAccess =
    decision.category === "restricted_data_access" ||
    contains(text, ACCESS_TRIGGERS);
  const mentionsApproval = contains(text, APPROVAL_TERMS);
  if (looksLikeAccess && !mentionsApproval) {
    finalRoute = HUMAN_REVIEW;
    status = "escalated_guardrail";
    flags.push(
      "Access request without stated approval — must not be auto-granted.",
    );
  }

  // Guardrail B — suspected privacy incident (highest severity, overrides all).
  if (contains(text, PRIVACY_TRIGGERS)) {
    finalRoute = HUMAN_REVIEW;
    status = "escalated_privacy_incident";
    priority = "urgent";
    flags.push("Suspected privacy incident — mandatory human handling.");
  }

  return { finalRoute, status, flags, priority, embargo };
}

export const STATUS_LABELS: Record<TriageStatus, string> = {
  auto_routed: "Auto-routed",
  escalated_low_confidence: "Escalated — low confidence",
  escalated_attachment_mismatch: "Escalated — missing attachments",
  escalated_guardrail: "Escalated — guardrail",
  escalated_privacy_incident: "Escalated — privacy incident",
  escalated_missing_embargo_date: "Escalated — embargo date missing",
};
