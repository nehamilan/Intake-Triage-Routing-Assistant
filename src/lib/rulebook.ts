/**
 * RULEBOOK — the frozen controlled vocabulary for the current vertical.
 *
 * This file is DATA, not code. A different vertical is a different rulebook,
 * not a different app. Do not inline categories or routes into components —
 * always read them from here.
 */

export type Category =
  | "restricted_data_access"
  | "deposit_assistance"
  | "metadata_curation"
  | "technical_platform"
  | "licensing_rights"
  | "preservation_format"
  | "general_inquiry";

export type Priority = "urgent" | "normal" | "low";

export type Route =
  | "Compliance"
  | "Curation"
  | "Infrastructure"
  | "General Support";

export interface Rulebook {
  vertical: string;
  categories: readonly Category[];
  routes: Readonly<Record<Category, Route>>;
  priorities: readonly Priority[];
  confidenceThreshold: number;
}

export const RULEBOOK: Rulebook = {
  vertical: "research_data_requests",
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
};

/** Human-readable labels for display. Rulebook keys stay machine-friendly. */
export const CATEGORY_LABELS: Record<Category, string> = {
  restricted_data_access: "Restricted data access",
  deposit_assistance: "Deposit assistance",
  metadata_curation: "Metadata / curation",
  technical_platform: "Technical / platform",
  licensing_rights: "Licensing / rights",
  preservation_format: "Preservation / format",
  general_inquiry: "General inquiry",
};
