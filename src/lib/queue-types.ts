// Shared types for the triage queue. Kept in a small module so both the
// route component and the persistence layer speak the same shape.

import type { Category, Priority } from "./rulebook";
import type { Attachment } from "./attachments";
import type { Decision } from "./mock-classify";
import type { RuleResult, TriageStatus } from "./apply-rules";

export interface FinalDecision {
  category: Category;
  priority: Priority;
  route: string;
  status: TriageStatus;
  flags: string[];
}

export type FieldChangeField = "category" | "priority" | "route" | "status";

export interface FieldChange {
  field: FieldChangeField;
  from: string;
  to: string;
}

/**
 * A single revision of a request as held in memory / rendered in the UI.
 * The persistence layer flattens the (requests, request_revisions) join into
 * one QueueItem per revision so the existing UI code doesn't need to change.
 */
export interface QueueItem {
  id: string;
  timestamp: number;
  requestText: string;
  attachments: Attachment[];
  aiDecision: Decision;
  aiRuling: RuleResult;
  finalDecision: FinalDecision;
  overridden: boolean;
  reviewer: string;
  revision: number;
  rootId: string;
  supersedesId?: string;
  supersededById?: string;
  changes: FieldChange[];
  reason: string;
  guardrailAcknowledged: boolean;
}
