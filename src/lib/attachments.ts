// Attachment model shared across the app.
//
// Attachments are file references that arrive alongside a request text.
// Two sources exist today:
//
//   1. Real files the user picks in the browser via <input type="file">.
//      Bytes stay entirely in the browser (no upload, no persistence).
//      For images we generate an object URL so reviewers can eyeball them
//      inline; for everything else we surface metadata only.
//
//   2. Mock attachments hardcoded on the sample corpus so the demo shows
//      realistic filenames (IRB letters, error screenshots, manifests, …).
//      These have no bytes — we render metadata + an optional `note`.
//
// The classifier gets attachment *metadata* (filename + mime type) in the
// prompt as context — never the bytes. The mismatch guardrail lives in
// applyRules, not the prompt.

export interface Attachment {
  id: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  /** Present only for real, browser-picked image files. */
  objectUrl?: string;
  /** Optional human-readable stand-in preview for mock fixtures. */
  note?: string;
}

/** Build a mock attachment for the sample corpus. */
export function mockFile(
  filename: string,
  mimeType: string,
  sizeBytes: number,
  note?: string,
): Attachment {
  return {
    id: `mock-${filename}`,
    filename,
    mimeType,
    sizeBytes,
    note,
  };
}

export function isImageMime(mime: string): boolean {
  return mime.startsWith("image/");
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/**
 * Short label shown next to a filename. Keeps the palette small and
 * predictable — the point is to make the *kind* of evidence scannable,
 * not to render every possible mime type.
 */
export function fileKindLabel(mime: string): string {
  if (mime.startsWith("image/")) return "IMG";
  if (mime === "application/pdf") return "PDF";
  if (mime.includes("csv")) return "CSV";
  if (
    mime.includes("spreadsheet") ||
    mime.includes("excel") ||
    mime === "application/vnd.ms-excel"
  )
    return "XLS";
  if (mime.includes("json")) return "JSON";
  if (mime.startsWith("text/")) return "TXT";
  if (mime === "message/rfc822") return "EML";
  if (mime.includes("zip")) return "ZIP";
  return "FILE";
}

// Keywords that mean "there should be a file attached to this message".
// We deliberately exclude words like "uploaded" or "shared" that describe
// past events on the repository itself rather than files attached to *this*
// message — those don't imply a missing attachment.
const ATTACHMENT_MENTION_TERMS = [
  "attached",
  "attachment",
  "attachments",
  "enclosed",
  "please find",
  "see attached",
  "i've attached",
  "i have attached",
];

/** True when the request text implies the sender attached files. */
export function textMentionsAttachments(text: string): boolean {
  const t = text.toLowerCase();
  return ATTACHMENT_MENTION_TERMS.some((term) => t.includes(term));
}
