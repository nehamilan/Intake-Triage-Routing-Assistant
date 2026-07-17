import { RULEBOOK, type Priority, type Rulebook } from "./rulebook";
import type { Decision } from "./mock-classify";
import { type Attachment, textMentionsAttachments } from "./attachments";
import { detectEmbargo, type EmbargoDetection } from "./embargo";

export type TriageStatus =
  | "auto_routed"
  | "escalated_low_confidence"
  | "escalated_attachment_mismatch"
  | "escalated_guardrail"
  | "escalated_privacy_incident"
  | "escalated_fraud"
  | "escalated_missing_embargo_date"
  | "escalated_parse_failure";

export interface RuleResult {
  finalRoute: string;
  status: TriageStatus;
  flags: string[];
  priority: Priority;
  embargo: EmbargoDetection;
}

const HUMAN_REVIEW = "Human Review Queue";

const contains = (text: string, terms: readonly string[]) =>
  terms.some((t) => text.includes(t));

export function applyRules(
  decision: Decision,
  requestText: string,
  attachments: readonly Attachment[] = [],
  rulebook: Rulebook = RULEBOOK,
): RuleResult {
  const text = requestText.toLowerCase();
  const flags: string[] = [];
  // Embargo detection is only meaningful for verticals that opt in.
  const embargo = rulebook.guardrails.embargoRequiresDate
    ? detectEmbargo(requestText)
    : { mentioned: false as const, reason: "none", rawPhrase: undefined, date: undefined };

  let finalRoute = decision.route;
  let status: TriageStatus = "auto_routed";
  let priority: Priority = decision.priority;

  if (decision.parseFailed) {
    finalRoute = HUMAN_REVIEW;
    status = "escalated_parse_failure";
    flags.push("Model output invalid — routed to human review.");
  }

  if (!decision.parseFailed) {
    if (decision.confidence < rulebook.confidenceThreshold) {
      finalRoute = HUMAN_REVIEW;
      status = "escalated_low_confidence";
      flags.push(
        `Confidence ${(decision.confidence * 100).toFixed(0)}% is below threshold ${(
          rulebook.confidenceThreshold * 100
        ).toFixed(0)}% — human review required.`,
      );
    }

    if (textMentionsAttachments(requestText) && attachments.length === 0) {
      finalRoute = HUMAN_REVIEW;
      status = "escalated_attachment_mismatch";
      flags.push(
        "Request references attachments but none were provided — chase the missing files before routing.",
      );
    }

    // Guardrail — embargo mentioned but no exact release date (research only).
    if (
      rulebook.guardrails.embargoRequiresDate &&
      embargo.mentioned &&
      embargo.reason !== "exact"
    ) {
      finalRoute = HUMAN_REVIEW;
      status = "escalated_missing_embargo_date";
      const detail = embargo.rawPhrase ? ` ("${embargo.rawPhrase}")` : "";
      flags.push(
        `Embargo mentioned${detail} but no exact release date — curator must confirm anchor and set YYYY-MM-DD.`,
      );
    }

    // Guardrail A — restricted-data access without stated approval (research).
    const access = rulebook.guardrails.accessRequiresApproval;
    if (access) {
      const looksLikeAccess =
        decision.category === access.category ||
        contains(text, access.textTriggers);
      const mentionsApproval = contains(text, access.approvalTerms);
      if (looksLikeAccess && !mentionsApproval) {
        finalRoute = HUMAN_REVIEW;
        status = "escalated_guardrail";
        flags.push(
          "Access request without stated approval — must not be auto-granted.",
        );
      }
    }
  }

  // Guardrail — suspected privacy incident (research; highest severity).
  const privacy = rulebook.guardrails.privacyIncident;
  if (privacy && contains(text, privacy.triggers)) {
    finalRoute = HUMAN_REVIEW;
    priority = "urgent";
    flags.push("Suspected privacy incident — mandatory human handling.");
    if (status !== "escalated_parse_failure") {
      status = "escalated_privacy_incident";
    }
  }

  // Guardrail — suspected fraud (banking; highest severity).
  const fraud = rulebook.guardrails.fraud;
  if (
    fraud &&
    (contains(text, fraud.triggers) || decision.category === fraud.category)
  ) {
    finalRoute = HUMAN_REVIEW;
    priority = "urgent";
    flags.push("Suspected fraud — mandatory human handling.");
    if (
      status !== "escalated_parse_failure" &&
      status !== "escalated_privacy_incident"
    ) {
      status = "escalated_fraud";
    }
  }

  return { finalRoute, status, flags, priority, embargo };
}

export const STATUS_LABELS: Record<TriageStatus, string> = {
  auto_routed: "Auto-routed",
  escalated_low_confidence: "Escalated — low confidence",
  escalated_attachment_mismatch: "Escalated — missing attachments",
  escalated_guardrail: "Escalated — guardrail",
  escalated_privacy_incident: "Escalated — privacy incident",
  escalated_fraud: "Escalated — suspected fraud",
  escalated_missing_embargo_date: "Escalated — embargo date missing",
  escalated_parse_failure: "Escalated — model output invalid",
};
