/**
 * RULEBOOKS — frozen controlled vocabularies, one per vertical.
 *
 * This file is DATA, not code. A different vertical is a different rulebook,
 * not a different app. The UI reads the active rulebook from RulebookContext
 * (see `rulebook-context.tsx`); back-compat consumers can still import the
 * default RULEBOOK (research vertical) directly.
 */

// -- Types ------------------------------------------------------------------

export type ResearchCategory =
  | "restricted_data_access"
  | "deposit_assistance"
  | "metadata_curation"
  | "technical_platform"
  | "licensing_rights"
  | "preservation_format"
  | "general_inquiry";

export type BankingCategory =
  | "fraud"
  | "billing_dispute"
  | "account_access";

export type Category = ResearchCategory | BankingCategory;

export type Priority = "urgent" | "normal" | "low";

export type Route =
  | "Compliance"
  | "Curation"
  | "Infrastructure"
  | "General Support"
  | "Fraud"
  | "Billing"
  | "Support";

export type VerticalId = "research" | "banking";

export interface RulebookGuardrails {
  /** Restricted-data / access-request guardrail (research). */
  accessRequiresApproval?: {
    textTriggers: string[];
    approvalTerms: string[];
    category?: Category;
  };
  /** Suspected privacy incident — mandatory human handling, urgent. */
  privacyIncident?: { triggers: string[] };
  /** Suspected fraud — mandatory human handling, urgent (banking). */
  fraud?: { triggers: string[]; category?: Category };
  /** Embargo mentioned but no exact date (research). */
  embargoRequiresDate?: boolean;
}

export interface Rulebook {
  id: VerticalId;
  vertical: string;
  label: string;
  description: string;
  categories: readonly Category[];
  routes: Partial<Record<Category, Route>>;
  priorities: readonly Priority[];
  confidenceThreshold: number;
  guardrails: RulebookGuardrails;
}

// -- Rulebooks --------------------------------------------------------------

export const RESEARCH_RULEBOOK: Rulebook = {
  id: "research",
  vertical: "research_data_requests",
  label: "Research data requests",
  description:
    "Intake for a research data repository — deposit help, metadata, licensing, restricted access, technical support.",
  categories: [
    "restricted_data_access",
    "deposit_assistance",
    "metadata_curation",
    "technical_platform",
    "licensing_rights",
    "preservation_format",
    "general_inquiry",
  ],
  routes: {
    restricted_data_access: "Compliance",
    deposit_assistance: "Curation",
    metadata_curation: "Curation",
    technical_platform: "Infrastructure",
    licensing_rights: "Compliance",
    preservation_format: "Curation",
    general_inquiry: "General Support",
  },
  priorities: ["urgent", "normal", "low"],
  confidenceThreshold: 0.7,
  guardrails: {
    accessRequiresApproval: {
      textTriggers: ["access", "restricted", "sensitive"],
      approvalTerms: ["approval", "ethics", "irb", "clearance"],
      category: "restricted_data_access",
    },
    privacyIncident: {
      triggers: [
        "breach",
        "exposed",
        "accidentally uploaded",
        "patient names",
        "personal data",
      ],
    },
    embargoRequiresDate: true,
  },
};

export const BANKING_RULEBOOK: Rulebook = {
  id: "banking",
  vertical: "banking_complaints",
  label: "Banking complaints",
  description:
    "Intake for retail banking complaints — fraud reports, billing disputes, account access, general questions.",
  categories: ["fraud", "billing_dispute", "account_access", "general_inquiry"],
  routes: {
    fraud: "Fraud",
    billing_dispute: "Billing",
    account_access: "Support",
    general_inquiry: "General Support",
  },
  priorities: ["urgent", "normal", "low"],
  confidenceThreshold: 0.7,
  guardrails: {
    fraud: {
      triggers: [
        "fraud",
        "fraudulent",
        "unauthorized",
        "unauthorised",
        "stolen card",
        "someone stole",
        "identity theft",
        "phishing",
        "scam",
      ],
      category: "fraud",
    },
  },
};

export const RULEBOOKS: Record<VerticalId, Rulebook> = {
  research: RESEARCH_RULEBOOK,
  banking: BANKING_RULEBOOK,
};

/** Back-compat default — research vertical. New UI code should use useRulebook(). */
export const RULEBOOK: Rulebook = RESEARCH_RULEBOOK;

/** Human-readable labels covering every category across every rulebook. */
export const CATEGORY_LABELS: Record<Category, string> = {
  restricted_data_access: "Restricted data access",
  deposit_assistance: "Deposit assistance",
  metadata_curation: "Metadata / curation",
  technical_platform: "Technical / platform",
  licensing_rights: "Licensing / rights",
  preservation_format: "Preservation / format",
  general_inquiry: "General inquiry",
  fraud: "Fraud report",
  billing_dispute: "Billing dispute",
  account_access: "Account access",
};

export function getRulebook(id: VerticalId): Rulebook {
  return RULEBOOKS[id];
}
