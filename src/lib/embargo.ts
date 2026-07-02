// Deterministic embargo detection.
//
// A curator needs an actionable YYYY-MM-DD to gate release. Anything less —
// month-only ("March 2027"), a relative duration ("for 6 months"), or a vague
// mention ("embargo it for a while") — must escalate to human review with the
// raw phrase preserved so the reviewer sees exactly what the requester wrote.
//
// This module never guesses a date. Relative durations are NOT anchored to
// today: "6 months from when?" is genuinely ambiguous (submission? paper?
// today?) and only the curator can decide.

export type EmbargoReason = "exact" | "month_only" | "relative" | "vague";

export interface EmbargoDetection {
  mentioned: boolean;
  date: string | null; // YYYY-MM-DD, only when reason === "exact"
  rawPhrase: string | null;
  reason: EmbargoReason | null;
}

const EMBARGO_TRIGGERS = [
  "embargo",
  "under embargo",
  "hold until",
  "release on",
  "do not publish until",
  "keep private until",
];

const MONTHS: Record<string, number> = {
  january: 1, jan: 1,
  february: 2, feb: 2,
  march: 3, mar: 3,
  april: 4, apr: 4,
  may: 5,
  june: 6, jun: 6,
  july: 7, jul: 7,
  august: 8, aug: 8,
  september: 9, sep: 9, sept: 9,
  october: 10, oct: 10,
  november: 11, nov: 11,
  december: 12, dec: 12,
};

const MONTH_ALT = Object.keys(MONTHS).join("|");

// Exact-date patterns.
const RE_ISO = /\b(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])\b/;
const RE_MONTH_DAY_YEAR = new RegExp(
  `\\b(${MONTH_ALT})\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{4})\\b`,
  "i",
);
const RE_DAY_MONTH_YEAR = new RegExp(
  `\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(${MONTH_ALT})\\s+(\\d{4})\\b`,
  "i",
);

// Month + year with no day.
const RE_MONTH_YEAR = new RegExp(`\\b(${MONTH_ALT})\\s+(\\d{4})\\b`, "i");

// Relative duration ("for 6 months", "for six months", "for about two years",
// "for a while"). "in 6 months" is also treated as relative when it appears
// alongside an embargo trigger.
const RE_RELATIVE = /\b(?:for|in)\s+(?:a\s+while|(?:about\s+)?\S+\s+(?:day|week|month|year)s?)\b/i;

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function findExact(text: string): { date: string; phrase: string } | null {
  const iso = text.match(RE_ISO);
  if (iso) {
    return { date: `${iso[1]}-${iso[2]}-${iso[3]}`, phrase: iso[0] };
  }
  const mdy = text.match(RE_MONTH_DAY_YEAR);
  if (mdy) {
    const month = MONTHS[mdy[1].toLowerCase()];
    const day = parseInt(mdy[2], 10);
    const year = parseInt(mdy[3], 10);
    if (month && day >= 1 && day <= 31) {
      return { date: `${year}-${pad(month)}-${pad(day)}`, phrase: mdy[0] };
    }
  }
  const dmy = text.match(RE_DAY_MONTH_YEAR);
  if (dmy) {
    const day = parseInt(dmy[1], 10);
    const month = MONTHS[dmy[2].toLowerCase()];
    const year = parseInt(dmy[3], 10);
    if (month && day >= 1 && day <= 31) {
      return { date: `${year}-${pad(month)}-${pad(day)}`, phrase: dmy[0] };
    }
  }
  return null;
}

export function detectEmbargo(rawText: string): EmbargoDetection {
  const text = rawText.toLowerCase();

  const triggerHit = EMBARGO_TRIGGERS.find((t) => text.includes(t));
  if (!triggerHit) {
    return { mentioned: false, date: null, rawPhrase: null, reason: null };
  }

  // Exact date wins.
  const exact = findExact(rawText);
  if (exact) {
    return {
      mentioned: true,
      date: exact.date,
      rawPhrase: exact.phrase,
      reason: "exact",
    };
  }

  // Month + year only ("March 2027") — ambiguous day.
  const monthYear = rawText.match(RE_MONTH_YEAR);
  if (monthYear) {
    return {
      mentioned: true,
      date: null,
      rawPhrase: monthYear[0],
      reason: "month_only",
    };
  }

  // Relative duration ("for 6 months", "for a while").
  const relative = rawText.match(RE_RELATIVE);
  if (relative) {
    return {
      mentioned: true,
      date: null,
      rawPhrase: relative[0],
      reason: "relative",
    };
  }

  // Trigger word only, nothing parseable.
  return {
    mentioned: true,
    date: null,
    rawPhrase: triggerHit,
    reason: "vague",
  };
}

export const EMBARGO_REASON_LABELS: Record<EmbargoReason, string> = {
  exact: "Exact release date",
  month_only: "Month given, day missing",
  relative: "Relative duration, no anchor",
  vague: "Embargo mentioned, no date",
};
