import { RULEBOOK, type Category, type Priority } from "./rulebook";

export interface Decision {
  category: Category;
  priority: Priority;
  route: string;
  reason: string;
  confidence: number;
}

interface KeywordGroup {
  category: Category;
  keywords: string[];
  label: string;
}

const GROUPS: KeywordGroup[] = [
  {
    category: "licensing_rights",
    label: "licensing / rights",
    keywords: ["license", "licence", "cc-by", "copyright"],
  },
  {
    category: "technical_platform",
    label: "technical platform",
    keywords: ["password", "login", "error", "download", "transfer", "500"],
  },
  {
    category: "deposit_assistance",
    label: "deposit assistance",
    keywords: ["deposit", "upload", "submit", "user account", "collection"],
  },
  {
    category: "metadata_curation",
    label: "metadata curation",
    keywords: ["keywords", "metadata", "doi", "description"],
  },
  {
    category: "preservation_format",
    label: "preservation / format",
    keywords: ["format", "preserve", "backup", "10 years"],
  },
  {
    category: "restricted_data_access",
    label: "restricted data access",
    keywords: ["access", "restricted", "sensitive", "confidential"],
  },
];

const URGENT_KEYWORDS = [
  "urgent",
  "deadline",
  "today",
  "asap",
  "breach",
  "exposed",
];

function findMatches(text: string, keywords: string[]): string[] {
  return keywords.filter((k) => text.includes(k));
}

export function mockClassify(requestText: string): Decision {
  const text = requestText.toLowerCase();
  const trimmedLen = requestText.trim().length;

  // Find all matching groups, in RULEBOOK precedence order above.
  const matched = GROUPS.map((g) => ({
    group: g,
    hits: findMatches(text, g.keywords),
  })).filter((m) => m.hits.length > 0);

  let category: Category;
  let reason: string;

  if (matched.length === 0) {
    category = "general_inquiry";
    reason =
      "No domain keywords matched. Defaulting to a general inquiry for human review.";
  } else {
    // Winner: group with the most keyword hits; ties fall to declaration order.
    const winner = matched.reduce((best, curr) =>
      curr.hits.length > best.hits.length ? curr : best,
    );
    category = winner.group.category;
    const others = matched
      .filter((m) => m.group.category !== category)
      .map((m) => m.group.label);
    reason =
      `Matched ${winner.hits.length} ${winner.group.label} keyword${
        winner.hits.length === 1 ? "" : "s"
      } (${winner.hits.join(", ")})` +
      (others.length > 0
        ? `; also brushed against ${others.join(", ")}.`
        : ".");
  }

  const route = RULEBOOK.routes[category];

  // Priority
  const urgentHits = findMatches(text, URGENT_KEYWORDS);
  let priority: Priority;
  if (urgentHits.length > 0) {
    priority = "urgent";
  } else if (matched.length === 0 && trimmedLen < 140) {
    priority = "low";
  } else {
    priority = "normal";
  }

  // Confidence: start at 0.9, penalize short text and ambiguity from multiple groups.
  let confidence = 0.9;
  if (trimmedLen < 80) confidence -= 0.25;
  else if (trimmedLen < 200) confidence -= 0.1;
  if (matched.length === 0) confidence -= 0.35;
  if (matched.length >= 2) confidence -= 0.12 * (matched.length - 1);
  confidence = Math.max(0.4, Math.min(0.95, Number(confidence.toFixed(2))));

  return { category, priority, route, reason, confidence };
}
