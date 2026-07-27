// Persistence layer for the triage queue.
//
// The DB has two tables:
//   - `requests`           : one row per intake request, holding the AI's
//                            original decision + the LATEST reviewer-final
//                            fields. This is what the queue table reads.
//   - `request_revisions`  : append-only audit log; one row per revision
//                            (including v1). Drives the revision timeline.
//
// We flatten (request, revisions[]) into `QueueItem[]` — one item per
// revision — so the existing UI keeps working unchanged. The `overridden`
// flag on each in-memory row is derived from whether that revision changed
// any decision fields (or knowingly bypassed a safety escalation), which
// matches the semantics the reviewer originally recorded.
//
// The `anon` publishable key drives these calls; RLS policies allow public
// read/write since this demo has no user accounts. If auth is added later,
// scope the policies to the reviewer and swap in `requireSupabaseAuth`.

import { supabase } from "@/integrations/supabase/client";
import { applyRules } from "./apply-rules";
import type { Category, Priority, VerticalId } from "./rulebook";
import type { TriageStatus } from "./apply-rules";
import type { Decision } from "./mock-classify";
import type { Attachment } from "./attachments";
import type { QueueItem, FieldChange, FinalDecision } from "./queue-types";

// The generated Supabase types don't yet include our new tables, so we cast
// to `any` at the call sites below. All values are still validated by the
// mapping helpers before landing in React state.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

interface RequestRow {
  id: string;
  created_at: string;
  request_text: string;
  attachments: unknown;
  ai_category: string;
  ai_priority: string;
  ai_route: string;
  ai_confidence: number | string;
  ai_reason: string;
  ai_parse_failed: boolean;
  final_category: string;
  final_priority: string;
  final_route: string;
  status: string;
  flags: unknown;
  was_overridden: boolean;
  reviewer_note: string | null;
  current_revision: number;
  vertical?: string | null;
}

interface RevisionRow {
  id: string;
  request_id: string;
  revision: number;
  created_at: string;
  reviewer: string;
  category: string;
  priority: string;
  route: string;
  status: string;
  changes: unknown;
  reason: string | null;
  guardrail_acknowledged: boolean;
}

function serializeAttachments(atts: readonly Attachment[]) {
  // We deliberately strip `objectUrl` — those live only in the current
  // browser tab and are meaningless once persisted.
  return atts.map((a) => ({
    id: a.id,
    filename: a.filename,
    mimeType: a.mimeType,
    sizeBytes: a.sizeBytes,
  }));
}

function parseAttachments(raw: unknown): Attachment[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((a): a is Record<string, unknown> => typeof a === "object" && a !== null)
    .map((a) => ({
      id: String(a.id ?? crypto.randomUUID()),
      filename: String(a.filename ?? "attachment"),
      mimeType: String(a.mimeType ?? "application/octet-stream"),
      sizeBytes: Number(a.sizeBytes ?? 0),
    }));
}

function parseFlags(raw: unknown): string[] {
  return Array.isArray(raw) ? raw.map((f) => String(f)) : [];
}

function parseChanges(raw: unknown): FieldChange[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((c): c is Record<string, unknown> => typeof c === "object" && c !== null)
    .map((c) => ({
      field: c.field as FieldChange["field"],
      from: String(c.from ?? ""),
      to: String(c.to ?? ""),
    }));
}

/**
 * Load the full queue from the database. Every revision becomes a QueueItem
 * so the existing timeline / table code doesn't have to change.
 */
export async function loadQueue(): Promise<QueueItem[]> {
  const [reqRes, revRes] = await Promise.all([
    db
      .from("requests")
      .select("*")
      .order("created_at", { ascending: false }),
    db
      .from("request_revisions")
      .select("*")
      .order("revision", { ascending: true }),
  ]);

  if (reqRes.error) throw reqRes.error;
  if (revRes.error) throw revRes.error;

  const reqs: RequestRow[] = reqRes.data ?? [];
  const revs: RevisionRow[] = revRes.data ?? [];

  const revsByRequest = new Map<string, RevisionRow[]>();
  for (const r of revs) {
    const list = revsByRequest.get(r.request_id) ?? [];
    list.push(r);
    revsByRequest.set(r.request_id, list);
  }

  const items: QueueItem[] = [];
  for (const req of reqs) {
    const attachments = parseAttachments(req.attachments);
    const flags = parseFlags(req.flags);
    const vertical: VerticalId = req.vertical === "banking" ? "banking" : "research";
    const aiDecision: Decision = {
      category: req.ai_category as Category,
      priority: req.ai_priority as Priority,
      route: req.ai_route,
      reason: req.ai_reason,
      confidence: Number(req.ai_confidence),
      ...(req.ai_parse_failed ? { parseFailed: true } : {}),
    };
    // Re-run the rulebook to recover embargo detection and the initial
    // ruling shape. Deterministic — same inputs, same output.
    const aiRuling = applyRules(aiDecision, req.request_text, attachments);

    const requestRevs = (revsByRequest.get(req.id) ?? []).slice().sort(
      (a, b) => a.revision - b.revision,
    );
    for (let i = 0; i < requestRevs.length; i++) {
      const rev = requestRevs[i];
      const prev = requestRevs[i - 1];
      const next = requestRevs[i + 1];
      const changes = parseChanges(rev.changes);
      items.push({
        id: rev.id,
        timestamp: new Date(rev.created_at).getTime(),
        requestText: req.request_text,
        attachments,
        aiDecision,
        aiRuling,
        finalDecision: {
          category: rev.category as Category,
          priority: rev.priority as Priority,
          route: rev.route,
          status: rev.status as TriageStatus,
          // Flags are guardrail outputs, not something reviewers edit —
          // they belong to the request, not the revision.
          flags,
        },
        // A revision is "an override" if it changed any decision field or
        // knowingly bypassed a safety escalation.
        overridden: changes.length > 0 || rev.guardrail_acknowledged,
        reviewer: rev.reviewer,
        revision: rev.revision,
        rootId: req.id,
        supersedesId: prev?.id,
        supersededById: next?.id,
        changes,
        reason: rev.reason ?? "",
        guardrailAcknowledged: rev.guardrail_acknowledged,
        vertical,
      });
    }
  }

  // Newest revision first — same order the in-memory queue used.
  items.sort((a, b) => b.timestamp - a.timestamp);
  return items;
}

/**
 * Persist a brand-new request (v1). Writes the parent row and the first
 * revision in one logical unit. The caller supplies pre-generated ids so
 * the in-memory state and the DB agree.
 */
export async function persistNewRequest(item: QueueItem): Promise<void> {
  const requestInsert = await db.from("requests").insert({
    id: item.rootId,
    created_at: new Date(item.timestamp).toISOString(),
    request_text: item.requestText,
    attachments: serializeAttachments(item.attachments),
    ai_category: item.aiDecision.category,
    ai_priority: item.aiDecision.priority,
    ai_route: item.aiDecision.route,
    ai_confidence: item.aiDecision.confidence,
    ai_reason: item.aiDecision.reason,
    ai_parse_failed: item.aiDecision.parseFailed ?? false,
    final_category: item.finalDecision.category,
    final_priority: item.finalDecision.priority,
    final_route: item.finalDecision.route,
    status: item.finalDecision.status,
    flags: item.finalDecision.flags,
    was_overridden: item.overridden,
    reviewer_note: item.reason || null,
    current_revision: item.revision,
    vertical: item.vertical,
  });
  if (requestInsert.error) throw requestInsert.error;

  const revInsert = await db.from("request_revisions").insert({
    id: item.id,
    request_id: item.rootId,
    revision: item.revision,
    created_at: new Date(item.timestamp).toISOString(),
    reviewer: item.reviewer,
    category: item.finalDecision.category,
    priority: item.finalDecision.priority,
    route: item.finalDecision.route,
    status: item.finalDecision.status,
    changes: item.changes,
    reason: item.reason || null,
    guardrail_acknowledged: item.guardrailAcknowledged,
  });
  if (revInsert.error) {
    // Best-effort rollback of the parent row so we don't leave an
    // orphaned request without any revision log.
    await db.from("requests").delete().eq("id", item.rootId);
    throw revInsert.error;
  }
}

/**
 * Persist a new revision (v2+). Appends the revision row and refreshes the
 * parent request's cached final_* / reviewer_note / current_revision fields.
 */
export async function persistRevision(item: QueueItem): Promise<void> {
  const revInsert = await db.from("request_revisions").insert({
    id: item.id,
    request_id: item.rootId,
    revision: item.revision,
    created_at: new Date(item.timestamp).toISOString(),
    reviewer: item.reviewer,
    category: item.finalDecision.category,
    priority: item.finalDecision.priority,
    route: item.finalDecision.route,
    status: item.finalDecision.status,
    changes: item.changes,
    reason: item.reason || null,
    guardrail_acknowledged: item.guardrailAcknowledged,
  });
  if (revInsert.error) throw revInsert.error;

  const reqUpdate = await db
    .from("requests")
    .update({
      final_category: item.finalDecision.category,
      final_priority: item.finalDecision.priority,
      final_route: item.finalDecision.route,
      status: item.finalDecision.status,
      was_overridden: item.overridden,
      reviewer_note: item.reason || null,
      current_revision: item.revision,
    })
    .eq("id", item.rootId);
  if (reqUpdate.error) throw reqUpdate.error;
}

export function classifyStatusBucket(
  status: string,
): "auto_routed" | "escalated" {
  return status === "auto_routed" ? "auto_routed" : "escalated";
}

// Cast helper used by the reference to `FinalDecision` — keeps this module
// from re-declaring it. Silence unused-import complaints in downstream configs.
export type { FinalDecision };
