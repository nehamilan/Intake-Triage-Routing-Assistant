import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { ChevronDown } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

import {
  RULEBOOK,
  CATEGORY_LABELS,
  type Category,
  type Priority,
} from "@/lib/rulebook";
import { useRulebook } from "@/hooks/use-rulebook";
import { type Decision } from "@/lib/mock-classify";
import {
  applyRules,
  STATUS_LABELS,
  type RuleResult,
  type TriageStatus,
} from "@/lib/apply-rules";
import { SAMPLE_REQUESTS } from "@/lib/sample-requests";
import { classifyRequest } from "@/lib/classify-request.functions";
import {
  type Attachment,
  fileKindLabel,
  formatBytes,
  isImageMime,
} from "@/lib/attachments";
import {
  loadQueue,
  persistNewRequest,
  persistRevision,
} from "@/lib/queue-db";
import type {
  FieldChange,
  FinalDecision,
  QueueItem,
} from "@/lib/queue-types";

import { AuthGate, ViewerDashboard } from "@/components/AuthGate";
import { AppHeader } from "@/components/AppHeader";
import { AboutPanel } from "@/components/AboutPanel";

export const Route = createFileRoute("/")({
  validateSearch: (
    search: Record<string, unknown>,
  ): { tab?: "triage" | "queue" } =>
    search.tab === "queue"
      ? { tab: "queue" }
      : search.tab === "triage"
        ? { tab: "triage" }
        : {},

  head: () => ({
    meta: [
      { title: "Intake Triage & Routing Assistant" },
      {
        name: "description",
        content:
          "Decision support for research data intake — proposes a category, priority, route, reason and confidence for every incoming request. A human reviews every decision.",
      },
      { property: "og:title", content: "Intake Triage & Routing Assistant" },
      {
        property: "og:description",
        content:
          "Decision support for research data intake — a human reviews every decision.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: RouteComponent,
});

function RouteComponent() {
  return <AuthGate agentView={() => <Index />} viewerView={() => <ViewerDashboard />} />;
}


// ---------- Constants ----------

// Routes selectable in the Override control. Combines every configured
// vertical's routes so the dropdown covers whichever rulebook is active.
import { RULEBOOKS } from "@/lib/rulebook";
const AVAILABLE_ROUTES: readonly string[] = [
  ...Array.from(
    new Set(
      Object.values(RULEBOOKS).flatMap((rb) =>
        Object.values(rb.routes).filter(Boolean) as string[],
      ),
    ),
  ),
  "Human Review Queue",
];

// Human-readable label helpers used inside the audit timeline. Kept next
// to the types so any change to the label set updates both diffs and the
// rendered UI in one place.
const PRIORITY_DISPLAY: Record<Priority, string> = {
  urgent: "Urgent",
  normal: "Normal",
  low: "Low",
};

function computeChanges(
  prev: FinalDecision,
  next: FinalDecision,
): FieldChange[] {
  const out: FieldChange[] = [];
  if (prev.category !== next.category) {
    out.push({
      field: "category",
      from: CATEGORY_LABELS[prev.category],
      to: CATEGORY_LABELS[next.category],
    });
  }
  if (prev.priority !== next.priority) {
    out.push({
      field: "priority",
      from: PRIORITY_DISPLAY[prev.priority],
      to: PRIORITY_DISPLAY[next.priority],
    });
  }
  if (prev.route !== next.route) {
    out.push({ field: "route", from: prev.route, to: next.route });
  }
  if (prev.status !== next.status) {
    out.push({
      field: "status",
      from: STATUS_LABELS[prev.status],
      to: STATUS_LABELS[next.status],
    });
  }
  return out;
}


// ---------- Root component ----------

function Index() {
  const { rulebook, verticalId } = useRulebook();
  const search = Route.useSearch();

  const [requestText, setRequestText] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [activeTab, setActiveTab] = useState<"triage" | "queue">(
    search.tab === "queue" ? "queue" : "triage",
  );

  const [decision, setDecision] = useState<Decision | null>(null);
  const [ruling, setRuling] = useState<RuleResult | null>(null);
  const [processedQueue, setProcessedQueue] = useState<QueueItem[]>([]);
  // Free-form reviewer name, session-scoped. Captured on every finalize/revise.
  const [reviewer, setReviewer] = useState("");
  // When set, the workspace is bound to an existing queue item (finalized view).
  // `isRevising` flips true when the user clicks "Reopen for revision" and
  // unlocks the override controls; saving then appends a new revision row.
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [isRevising, setIsRevising] = useState(false);

  // Async classifier state.
  const [isClassifying, setIsClassifying] = useState(false);
  const [classifyError, setClassifyError] = useState<string | null>(null);
  const [batchProgress, setBatchProgress] = useState<{
    done: number;
    total: number;
  } | null>(null);

  // Persistence state — loaded from Lovable Cloud on mount. Any DB error
  // surfaces in the queue view so the reviewer knows the row didn't save.
  const [queueLoading, setQueueLoading] = useState(true);
  const [queueError, setQueueError] = useState<string | null>(null);

  const classify = useServerFn(classifyRequest);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Track object URLs we created for real, browser-picked files so we can
  // revoke them when the workspace resets. We deliberately don't revoke
  // when moving into the queue — the reviewer might reopen the item.
  const workspaceObjectUrlsRef = useRef<string[]>([]);

  useEffect(() => {
    return () => {
      // Best-effort cleanup on unmount.
      for (const url of workspaceObjectUrlsRef.current) {
        try {
          URL.revokeObjectURL(url);
        } catch {
          // ignore
        }
      }
    };
  }, []);

  // Hydrate the queue from Lovable Cloud on mount so refreshes keep state.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const items = await loadQueue();
        if (!cancelled) {
          // Merge, don't overwrite: the user may have finalized or run
          // "Triage all" while this initial load was still in flight.
          // Those rows were persisted AND prepended to state; a naive
          // setProcessedQueue(items) would drop them from the UI until
          // the next refresh. Dedupe by revision id, keeping any locally
          // added rows that aren't in the DB snapshot yet.
          setProcessedQueue((prev) => {
            if (prev.length === 0) return items;
            const seen = new Set(items.map((i) => i.id));
            const extras = prev.filter((i) => !seen.has(i.id));
            const merged = [...extras, ...items];
            merged.sort((a, b) => b.timestamp - a.timestamp);
            return merged;
          });
        }
      } catch (err) {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : String(err);
          setQueueError(message);
        }
      } finally {
        if (!cancelled) setQueueLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const trackObjectUrl = (url: string) => {
    workspaceObjectUrlsRef.current.push(url);
  };

  // Attachment metadata is safe to send to the server; bytes are not sent.
  const attachmentMeta = (list: readonly Attachment[]) =>
    list.map((a) => ({
      filename: a.filename,
      mimeType: a.mimeType,
      sizeBytes: a.sizeBytes,
    }));

  const handleTriage = async () => {
    const text = requestText.trim();
    if (text.length === 0 || isClassifying) return;
    setClassifyError(null);
    setDecision(null);
    setRuling(null);
    setIsClassifying(true);
    try {
      const d = await classify({
        data: {
          requestText: text,
          attachments: attachmentMeta(attachments),
          vertical: verticalId,
        },
      });
      setDecision(d);
      setRuling(applyRules(d, text, attachments, rulebook));

    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setClassifyError(message);
    } finally {
      setIsClassifying(false);
    }
  };

  const newId = () =>
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : String(Date.now() + Math.random());

  const buildQueueItem = (
    text: string,
    atts: Attachment[],
    final: FinalDecision,
    d: Decision,
    r: RuleResult,
    wasOverridden: boolean,
    opts: {
      reviewer: string;
      revision: number;
      rootId?: string;
      supersedesId?: string;
      id?: string;
      changes: FieldChange[];
      reason: string;
      guardrailAcknowledged: boolean;
    },
  ): QueueItem => {
    const id = opts.id ?? newId();
    return {
      id,
      timestamp: Date.now(),
      requestText: text,
      attachments: atts,
      aiDecision: d,
      aiRuling: r,
      finalDecision: final,
      overridden: wasOverridden,
      reviewer: opts.reviewer,
      revision: opts.revision,
      rootId: opts.rootId ?? id,
      supersedesId: opts.supersedesId,
      changes: opts.changes,
      reason: opts.reason,
      guardrailAcknowledged: opts.guardrailAcknowledged,
      vertical: verticalId,
    };
  };

  const handleFinalize = async (
    final: FinalDecision,
    wasOverridden: boolean,
    reason: string,
    guardrailAcknowledged: boolean,
  ) => {
    if (!decision || !ruling) return;
    const reviewerName = reviewer.trim();
    if (reviewingId && isRevising) {
      // Append a new revision row and mark the predecessor as superseded.
      // The pointer update on the previous row is the ONLY mutation to an
      // existing queue entry — decisions themselves stay immutable.
      const prev = processedQueue.find((q) => q.id === reviewingId);
      if (!prev) return;
      const changes = computeChanges(prev.finalDecision, final);
      const newRow = buildQueueItem(
        prev.requestText,
        prev.attachments,
        final,
        decision,
        ruling,
        wasOverridden || prev.overridden,
        {
          reviewer: reviewerName,
          revision: prev.revision + 1,
          rootId: prev.rootId,
          supersedesId: prev.id,
          changes,
          reason,
          guardrailAcknowledged,
        },
      );
      try {
        await persistRevision(newRow);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setQueueError(`Couldn't save revision: ${message}`);
        return;
      }
      setQueueError(null);
      setProcessedQueue((queue) => [
        newRow,
        ...queue.map((q) =>
          q.id === prev.id ? { ...q, supersededById: newRow.id } : q,
        ),
      ]);
      toast.success(`Revision v${newRow.revision} saved.`);
      setReviewingId(null);
      setIsRevising(false);
      setActiveTab("queue");

    } else {
      // v1: diff vs the AI's proposal so that an override on first pass still
      // shows what changed relative to the model's suggestion.
      const aiBaseline: FinalDecision = {
        category: decision.category,
        priority: ruling.priority,
        route: ruling.finalRoute,
        status: ruling.status,
        flags: ruling.flags,
      };
      const changes = computeChanges(aiBaseline, final);
      const newRow = buildQueueItem(
        requestText,
        attachments,
        final,
        decision,
        ruling,
        wasOverridden,
        {
          reviewer: reviewerName,
          revision: 1,
          changes,
          reason,
          guardrailAcknowledged,
        },
      );
      try {
        await persistNewRequest(newRow);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setQueueError(`Couldn't save request: ${message}`);
        return;
      }
      setQueueError(null);
      setProcessedQueue((prev) => [newRow, ...prev]);
      toast.success(
        wasOverridden ? "Override saved to queue." : "Decision sent to queue.",
      );

    }
    // Reset the workspace for the next intake. Keep the object URLs alive so
    // the queue entry can still render its previews.
    workspaceObjectUrlsRef.current = [];
    setRequestText("");
    setAttachments([]);
    setDecision(null);
    setRuling(null);
    setClassifyError(null);
  };



  const handleLoadSample = (text: string, atts: Attachment[]) => {
    setRequestText(text);
    setAttachments(atts);
    setDecision(null);
    setRuling(null);
    setReviewingId(null);
    setClassifyError(null);
  };

  const handleAddFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const additions: Attachment[] = [];
    for (const file of Array.from(files)) {
      const mime = file.type || "application/octet-stream";
      let objectUrl: string | undefined;
      if (isImageMime(mime)) {
        objectUrl = URL.createObjectURL(file);
        trackObjectUrl(objectUrl);
      }
      additions.push({
        id: `file-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        filename: file.name,
        mimeType: mime,
        sizeBytes: file.size,
        objectUrl,
      });
    }
    setAttachments((prev) => [...prev, ...additions]);
    // Reset input so the same file can be re-picked if the user removes it.
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleRemoveAttachment = (id: string) => {
    setAttachments((prev) => {
      const target = prev.find((a) => a.id === id);
      if (target?.objectUrl) {
        try {
          URL.revokeObjectURL(target.objectUrl);
        } catch {
          // ignore
        }
        workspaceObjectUrlsRef.current =
          workspaceObjectUrlsRef.current.filter((u) => u !== target.objectUrl);
      }
      return prev.filter((a) => a.id !== id);
    });
  };

  const handleTriageAll = async () => {
    if (batchProgress) return;
    setClassifyError(null);
    const now = Date.now();
    // Only run samples matching the active vertical (defaults to "research").
    const samples = SAMPLE_REQUESTS.filter(
      (s) => (s.vertical ?? "research") === verticalId,
    );
    const total = samples.length;
    if (total === 0) {
      toast.info("No sample requests for this vertical.");
      return;
    }
    setBatchProgress({ done: 0, total });
    // Switch to the queue immediately so the reviewer watches rows land as
    // each classification resolves, rather than staring at a spinner.
    setActiveTab("queue");

    // Classify sequentially so we can show progress and stay well under any
    // per-second rate limits from the gateway. Failures for a single sample
    // don't abort the batch — they surface as a low-confidence placeholder
    // that lands in Human Review through the guardrails.
    for (let i = 0; i < samples.length; i++) {
      const s = samples[i];
      let d: Decision;
      try {
        d = await classify({
          data: {
            requestText: s.text,
            attachments: attachmentMeta(s.attachments),
            vertical: verticalId,
          },
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        d = {
          category: "general_inquiry",
          priority: "low",
          route: rulebook.routes.general_inquiry ?? "General Support",
          reason: `Classifier error — routed to human review. (${message})`,
          confidence: 0,
        };
      }
      const r = applyRules(d, s.text, s.attachments, rulebook);

      const final: FinalDecision = {
        category: d.category,
        priority: r.priority,
        route: r.finalRoute,
        status: r.status,
        flags: r.flags,
      };
      const rowId =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : String(now + i);
      const item: QueueItem = {
        id: rowId,
        timestamp: now + i,
        requestText: s.text,
        attachments: [...s.attachments],
        aiDecision: d,
        aiRuling: r,
        finalDecision: final,
        overridden: false,
        reviewer: reviewer.trim(),
        revision: 1,
        rootId: rowId,
        changes: [],
        reason: "",
        guardrailAcknowledged: false,
        vertical: verticalId,
      };
      // Append the row as soon as it resolves so the queue fills in visibly.
      try {
        await persistNewRequest(item);
        setProcessedQueue((prev) => [item, ...prev]);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setQueueError(`Couldn't save "${s.label}": ${message}`);
      }
      setBatchProgress({ done: i + 1, total });
    }

    setBatchProgress(null);
  };

  const handleReview = (item: QueueItem) => {
    // Reconstruct decision + ruling so the card reflects the FINAL committed
    // values, not the raw AI proposal (which may have been overridden).
    const finalRuling: RuleResult = {
      ...item.aiRuling,
      priority: item.finalDecision.priority,
      finalRoute: item.finalDecision.route,
      status: item.finalDecision.status,
      flags: item.finalDecision.flags,
    };
    const finalDecision: Decision = {
      ...item.aiDecision,
      category: item.finalDecision.category,
    };
    setRequestText(item.requestText);
    setAttachments(item.attachments);
    setDecision(finalDecision);
    setRuling(finalRuling);
    setReviewingId(item.id);
    setIsRevising(false);
    setActiveTab("triage");
  };

  const cancelReview = () => {
    setReviewingId(null);
    setIsRevising(false);
    setRequestText("");
    setAttachments([]);
    setDecision(null);
    setRuling(null);
  };

  const startRevision = () => {
    if (!reviewingId) return;
    setIsRevising(true);
  };


  // Counters and the queue table both reflect current versions only —
  // superseded revisions stay in the log but shouldn't inflate KPIs and
  // shouldn't show up as their own rows in the table.
  // Scope everything the reviewer sees to the active vertical — switching
  // the rulebook in the header also switches the queue view. Superseded
  // revisions stay in the log but shouldn't inflate KPIs.
  const verticalQueue = processedQueue.filter((q) => q.vertical === verticalId);
  const currentQueue = verticalQueue.filter((q) => !q.supersededById);
  const revisionCount = verticalQueue.length - currentQueue.length;
  const escalatedCount = currentQueue.filter(
    (q) => q.finalDecision.status !== "auto_routed",
  ).length;
  const autoRoutedCount = currentQueue.length - escalatedCount;
  const overriddenCount = currentQueue.filter((q) => q.overridden).length;

  const reviewingItem = reviewingId
    ? processedQueue.find((q) => q.id === reviewingId) ?? null
    : null;
  const isSupersededView =
    reviewingItem !== null && reviewingItem.supersededById !== undefined;
  // Full revision chain for the request currently open in the workspace,
  // newest first. Drives the audit timeline below the Decision Card.
  const revisionHistory: QueueItem[] = reviewingItem
    ? processedQueue
        .filter((q) => q.rootId === reviewingItem.rootId)
        .sort((a, b) => b.revision - a.revision)
    : [];


  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-6 py-8 sm:px-8 sm:py-10">
        <AppHeader
          active={activeTab}
          queueCount={currentQueue.length}
          onSelectTab={setActiveTab}
        />


        <main className="flex-1">
          {activeTab === "triage" ? (
            <div className="grid grid-cols-1 items-start gap-10 lg:grid-cols-2 lg:gap-12">
              {/* Input */}
              <section aria-labelledby="request-label" className="space-y-6">
                {reviewingItem ? (
                  <div
                    className={
                      isSupersededView
                        ? "flex items-start justify-between gap-3 border border-border bg-muted/40 px-4 py-3"
                        : isRevising
                          ? "flex items-start justify-between gap-3 border border-amber-300 bg-amber-50/70 px-4 py-3"
                          : "flex items-start justify-between gap-3 border border-purple-300 bg-purple-50/60 px-4 py-3"
                    }
                  >
                    <div>
                      <div
                        className={
                          isSupersededView
                            ? "font-mono text-[10px] font-bold uppercase tracking-widest text-muted-foreground"
                            : isRevising
                              ? "font-mono text-[10px] font-bold uppercase tracking-widest text-amber-800"
                              : "font-mono text-[10px] font-bold uppercase tracking-widest text-purple-800"
                        }
                      >
                        {isSupersededView
                          ? `Viewing v${reviewingItem.revision} · superseded`
                          : isRevising
                            ? `Original request · v${reviewingItem.revision}`
                            : `Finalized · v${reviewingItem.revision}`}
                      </div>
                      <div className="mt-0.5 font-serif text-sm italic text-foreground">
                        {isSupersededView
                          ? `Read-only. A newer revision exists — open it to revise.`
                          : `Request text and attachments are locked.`}
                      </div>

                    </div>
                    <button
                      type="button"
                      onClick={cancelReview}
                      className="border border-border bg-background px-3 py-1 font-mono text-[10px] font-bold uppercase tracking-widest text-foreground hover:bg-foreground/5"
                    >
                      Close
                    </button>
                  </div>
                ) : null}

                <div className="flex flex-col gap-2">
                  <label
                    id="request-label"
                    htmlFor="request-textarea"
                    className="font-mono text-[10px] font-bold uppercase tracking-widest text-muted-foreground"
                  >
                    Input Source
                  </label>
                  <div className="relative">
                    <textarea
                      id="request-textarea"
                      value={requestText}
                      onChange={(e) => setRequestText(e.target.value)}
                      onKeyDown={(e) => {
                        if (
                          (e.metaKey || e.ctrlKey) &&
                          e.key === "Enter" &&
                          !reviewingItem
                        ) {
                          e.preventDefault();
                          handleTriage();
                        }
                      }}

                      rows={12}
                      readOnly={reviewingItem !== null}
                      placeholder="Paste an incoming request here — an email about accessing a restricted dataset, a deposit question, a licensing query, or a broken download link."
                      className={`h-64 w-full resize-none border border-border bg-card p-4 text-sm leading-relaxed text-foreground shadow-none outline-none transition-colors placeholder:text-muted-foreground/70 focus:border-foreground focus:ring-0 ${reviewingItem ? "cursor-not-allowed opacity-80" : ""}`}
                    />
                    <div className="pointer-events-none absolute bottom-3 right-3 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                      CHAR: {requestText.length}
                    </div>
                  </div>
                </div>

                <AttachmentsEditor
                  attachments={attachments}
                  fileInputRef={fileInputRef}
                  onAdd={handleAddFiles}
                  onRemove={handleRemoveAttachment}
                  disabled={
                    isClassifying ||
                    batchProgress !== null ||
                    reviewingItem !== null
                  }
                />



                {reviewingItem ? null : (
                  <button
                    type="button"
                    onClick={handleTriage}
                    disabled={
                      requestText.trim().length === 0 ||
                      isClassifying ||
                      batchProgress !== null
                    }
                    className="btn-primary w-full py-3 font-mono text-xs font-bold uppercase tracking-[0.2em]"
                  >
                    {isClassifying ? (
                      <>
                        <Spinner /> Triaging…
                      </>
                    ) : (
                      "Triage Request"
                    )}
                  </button>
                )}

                {classifyError ? (
                  <div
                    role="alert"
                    className="flex flex-col gap-3 border-l-4 border-red-600 bg-red-50/70 p-3 font-mono text-[11px] text-red-800"
                  >
                    <div>
                      <div className="mb-0.5 font-bold uppercase tracking-widest">
                        Couldn't reach the classifier
                      </div>
                      <div className="font-serif text-sm italic leading-snug text-red-900/80">
                        Something went wrong on the way to our triage service.
                        Check your connection and try again — your request text
                        and attachments are still here.
                      </div>
                      <details className="mt-2 font-mono text-[10px] uppercase tracking-widest text-red-900/60">
                        <summary className="cursor-pointer">
                          Technical detail
                        </summary>
                        <div className="mt-1 whitespace-pre-wrap break-words font-serif text-[11px] normal-case tracking-normal">
                          {classifyError}
                        </div>
                      </details>
                    </div>
                    <button
                      type="button"
                      onClick={handleTriage}
                      disabled={
                        requestText.trim().length === 0 ||
                        isClassifying ||
                        batchProgress !== null
                      }
                      className="inline-flex items-center justify-center gap-2 self-start border border-red-700 bg-white px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-red-800 transition-colors hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {isClassifying ? (
                        <>
                          <Spinner /> Retrying…
                        </>
                      ) : (
                        "Retry triage"
                      )}
                    </button>
                  </div>
                ) : null}

                {/* Sample batch controls — filtered to the active vertical. */}
                {reviewingItem ? null : (() => {
                  const verticalSamples = SAMPLE_REQUESTS.filter(
                    (s) => (s.vertical ?? "research") === verticalId,
                  );
                  return (
                  <div className="border-t border-dashed border-border pt-5">
                    <div className="mb-3 flex items-baseline justify-between gap-3">
                      <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                        Sample Corpus
                      </span>
                      <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                        {verticalSamples.length} fixtures · {rulebook.label}
                      </span>
                    </div>
                    <p className="mb-3 font-serif text-xs italic text-muted-foreground">
                      Hard-coded intake messages covering every category and
                      each guardrail case for the active vertical. Load one
                      into the editor, or triage the whole set at once.
                    </p>
                    <div className="mb-4 flex flex-col gap-2 sm:flex-row">
                      <select
                        aria-label="Load a sample request"
                        value=""
                        disabled={
                          isClassifying ||
                          batchProgress !== null ||
                          verticalSamples.length === 0
                        }
                        onChange={(e) => {
                          const s = verticalSamples.find(
                            (x) => x.id === e.target.value,
                          );
                          if (s) handleLoadSample(s.text, [...s.attachments]);
                        }}
                        className="flex-1 border border-border bg-background px-3 py-2 font-serif text-sm text-foreground focus:border-foreground focus:outline-none disabled:opacity-50"
                      >
                        <option value="" disabled>
                          {verticalSamples.length === 0
                            ? "No samples for this vertical"
                            : "Load sample request…"}
                        </option>
                        {verticalSamples.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.label}
                          </option>
                        ))}
                      </select>

                      <button
                        type="button"
                        onClick={handleTriageAll}
                        disabled={isClassifying || batchProgress !== null}
                        className="inline-flex items-center justify-center gap-2 border border-foreground bg-background px-4 py-2 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-foreground transition-colors hover:bg-foreground/5 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {batchProgress ? (
                          <>
                            <Spinner /> Triaging {batchProgress.done} of{" "}
                            {batchProgress.total}…
                          </>
                        ) : (
                          "Triage all"
                        )}
                      </button>
                    </div>
                  </div>
                  );
                })()}

              </section>

              {/* Decision card */}
              <section
                aria-labelledby="decision-label"
                aria-live="polite"
                className="flex min-h-[26rem] flex-col border border-border bg-card p-6 sm:p-8"
              >
                <div className="mb-6 border-b border-dashed border-border pb-4">
                  <h2
                    id="decision-label"
                    className="font-mono text-[10px] font-bold uppercase tracking-widest text-muted-foreground"
                  >
                    Triage Result
                  </h2>
                  <p className="mt-1 font-serif text-sm italic text-muted-foreground">
                    {isClassifying
                      ? "Triaging your request…"
                      : decision
                        ? reviewingItem
                        ? isSupersededView
                          ? `Superseded revision · v${reviewingItem.revision}.`
                          : isRevising
                            ? `Revising v${reviewingItem.revision} — adjust category, priority, or route; saving appends v${reviewingItem.revision + 1}.`
                            : `Finalized decision · v${reviewingItem.revision}.`

                          : "Proposed decision — pending human review."
                        : "No request triaged yet."}
                  </p>
                </div>

                {isClassifying ? (
                  <DecisionSkeleton />
                ) : decision && ruling ? (
                  <DecisionCard
                    key={
                      (reviewingItem?.id ?? requestText.slice(0, 24)) +
                      ":" +
                      (reviewingItem?.revision ?? 0) +
                      ":" +
                      (isRevising ? "revising" : "view")
                    }
                    decision={decision}
                    ruling={ruling}
                    attachments={attachments}
                    onFinalize={handleFinalize}
                    mode={
                      reviewingItem
                        ? isSupersededView
                          ? "superseded"
                          : isRevising
                            ? "revising"
                            : "finalized"
                        : "draft"
                    }
                    reviewer={reviewer}
                    onReviewerChange={setReviewer}
                    finalizedReviewer={reviewingItem?.reviewer}
                    finalizedAt={reviewingItem?.timestamp}
                    onReopen={startRevision}
                    onCancelRevision={() => setIsRevising(false)}
                  />
                ) : (
                  <EmptyDecisionState />
                )}
                {reviewingItem && revisionHistory.length > 0 ? (
                  <RevisionTimeline
                    revisions={revisionHistory}
                    currentId={reviewingItem.id}
                  />
                ) : null}
              </section>
            </div>
          ) : (
            <QueueView
              items={verticalQueue}
              currentQueue={currentQueue}
              escalatedCount={escalatedCount}
              autoRoutedCount={autoRoutedCount}
              overriddenCount={overriddenCount}
              revisionCount={revisionCount}
              onStartNew={() => setActiveTab("triage")}
              onReview={handleReview}
              reviewingId={reviewingId}
              batchProgress={batchProgress}
              queueLoading={queueLoading}
              queueError={queueError}
            />
          )}
          <AboutPanel />
        </main>


        <footer className="mt-12 flex flex-col gap-2 border-t border-border pt-6 font-mono text-[10px] uppercase tracking-widest text-muted-foreground sm:flex-row sm:justify-between">
          <span>Station: Console_01</span>
          <span>
            Vertical: {rulebook.vertical.replace(/_/g, " ")} · Threshold:{" "}
            {rulebook.confidenceThreshold.toFixed(2)}

          </span>
          <span>
            Requests: {currentQueue.length} · Escalated: {escalatedCount} ·
            Auto-routed: {autoRoutedCount}
            {revisionCount > 0 ? ` · Revisions: ${revisionCount}` : ""}
          </span>
        </footer>

      </div>
    </div>
  );
}

// ---------- Small UI bits ----------

function EmptyDecisionState() {
  return (
    <div className="space-y-5">
      <DecisionRow label="Category" />
      <DecisionRow label="Priority" />
      <DecisionRow label="Route" />
      <DecisionRow
        label="Reasoning"
        value="Waiting for input data…"
        italic
        multiline
      />
      <div className="mt-8 flex items-center justify-between border-t border-dashed border-border pt-6">
        <div className="flex flex-col gap-0.5">
          <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            Confidence Score
          </span>
          <span className="font-serif text-lg text-muted-foreground/60">—</span>
        </div>
      </div>
    </div>
  );
}

interface DecisionRowProps {
  label: string;
  value?: string;
  italic?: boolean;
  multiline?: boolean;
}

function DecisionRow({ label, value = "—", italic, multiline }: DecisionRowProps) {
  return (
    <div
      className={`grid grid-cols-[110px_minmax(0,1fr)] gap-4 ${multiline ? "items-start" : "items-baseline"}`}
    >
      <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
        {label}
      </span>
      <span
        className={`border-b border-border pb-1 text-sm text-muted-foreground/60 ${italic ? "font-serif italic" : ""} ${multiline ? "min-h-[3rem] leading-relaxed" : ""}`}
      >
        {value}
      </span>
    </div>
  );
}

// ---------- Styles for priority and status ----------

const PRIORITY_STYLES: Record<
  Priority,
  { dot: string; text: string; bg: string; label: string }
> = {
  urgent: {
    dot: "bg-red-600",
    text: "text-red-700",
    bg: "bg-red-50 border-red-200",
    label: "Urgent",
  },
  normal: {
    dot: "bg-amber-500",
    text: "text-amber-700",
    bg: "bg-amber-50 border-amber-200",
    label: "Normal",
  },
  low: {
    dot: "bg-muted-foreground",
    text: "text-muted-foreground",
    bg: "bg-muted border-border",
    label: "Low",
  },
};

const STATUS_STYLES: Record<
  TriageStatus,
  { badge: string; dot: string }
> = {
  auto_routed: {
    badge: "bg-green-50 border-green-300 text-green-800",
    dot: "bg-green-600",
  },
  escalated_low_confidence: {
    badge: "bg-orange-50 border-orange-300 text-orange-800",
    dot: "bg-orange-500",
  },
  escalated_attachment_mismatch: {
    badge: "bg-orange-50 border-orange-300 text-orange-800",
    dot: "bg-orange-500",
  },
  escalated_guardrail: {
    badge: "bg-orange-50 border-orange-300 text-orange-800",
    dot: "bg-orange-500",
  },
  escalated_privacy_incident: {
    badge: "bg-orange-50 border-orange-300 text-orange-800",
    dot: "bg-orange-500",
  },
  escalated_fraud: {
    badge: "bg-red-50 border-red-300 text-red-800",
    dot: "bg-red-600",
  },
  escalated_missing_embargo_date: {
    badge: "bg-orange-50 border-orange-300 text-orange-800",
    dot: "bg-orange-500",
  },
  escalated_parse_failure: {
    badge: "bg-red-50 border-red-300 text-red-800",
    dot: "bg-red-600",
  },
};

// ---------- Decision Card ----------

function DecisionCard({
  decision,
  ruling,
  attachments,
  onFinalize,
  mode,
  reviewer,
  onReviewerChange,
  finalizedReviewer,
  finalizedAt,
  onReopen,
  onCancelRevision,
}: {
  decision: Decision;
  ruling: RuleResult;
  attachments: Attachment[];
  onFinalize: (
    final: FinalDecision,
    wasOverridden: boolean,
    reason: string,
    guardrailAcknowledged: boolean,
  ) => void;
  mode: "draft" | "finalized" | "revising" | "superseded";
  reviewer: string;
  onReviewerChange: (v: string) => void;
  finalizedReviewer?: string;
  finalizedAt?: number;
  onReopen: () => void;
  onCancelRevision: () => void;
}) {
  // Editable draft state for Override. In "revising" mode, we open the form
  // pre-populated with the finalized values so reviewers see what they're
  // changing from.
  const [editing, setEditing] = useState(mode === "revising");
  const [draftCategory, setDraftCategory] = useState<Category>(decision.category);
  const [draftPriority, setDraftPriority] = useState<Priority>(ruling.priority);
  const [draftRoute, setDraftRoute] = useState<string>(ruling.finalRoute);
  // Reason + acknowledgment are session-scoped to this card instance. The
  // parent remounts the card on mode changes via `key`, so state resets
  // naturally between draft/revising sessions.
  const [reason, setReason] = useState("");
  const [ackGuardrail, setAckGuardrail] = useState(false);
  // Reopening reverses an audited decision, so it goes through a confirm step.
  const [confirmReopen, setConfirmReopen] = useState(false);


  const pri = PRIORITY_STYLES[ruling.priority];
  const pct = Math.round(decision.confidence * 100);
  const { rulebook: activeRulebook } = useRulebook();
  const belowThreshold = decision.confidence < activeRulebook.confidenceThreshold;

  const statusStyle = STATUS_STYLES[ruling.status];
  const routeOverridden = ruling.finalRoute !== decision.route;
  const reviewerReady = reviewer.trim().length > 0;
  const reasonTrimmed = reason.trim();

  // The baseline for detecting "changes" and "guardrail bypass" is whatever
  // the card is showing right now — the AI's proposal on v1, or the last
  // finalized decision when revising.
  const baselineIsEscalated = ruling.status !== "auto_routed";

  // Accept-as-is keeps the current status, so no bypass is possible; only
  // a reason is optional.
  const acceptAsIs = () => {
    if (!reviewerReady) return;
    onFinalize(
      {
        category: decision.category,
        priority: ruling.priority,
        route: ruling.finalRoute,
        status: ruling.status,
        flags: ruling.flags,
      },
      false,
      reasonTrimmed,
      false,
    );
  };

  // In override, a bypass occurs when the ruling is currently escalated and
  // the reviewer routes the request away from the Human Review Queue. In
  // that case the final status flips to auto_routed and we require an
  // explicit acknowledgment plus a reason.
  const willBypassGuardrail =
    editing && baselineIsEscalated && draftRoute !== "Human Review Queue";
  const overrideChanged =
    draftCategory !== decision.category ||
    draftPriority !== ruling.priority ||
    draftRoute !== ruling.finalRoute;
  const overrideReasonRequired = overrideChanged || willBypassGuardrail;
  const canSaveOverride =
    reviewerReady &&
    (!overrideReasonRequired || reasonTrimmed.length > 0) &&
    (!willBypassGuardrail || ackGuardrail);

  const saveOverride = () => {
    if (!canSaveOverride) return;
    const finalStatus: TriageStatus = willBypassGuardrail
      ? "auto_routed"
      : ruling.status;
    onFinalize(
      {
        category: draftCategory,
        priority: draftPriority,
        route: draftRoute,
        status: finalStatus,
        flags: ruling.flags,
      },
      overrideChanged || willBypassGuardrail,
      reasonTrimmed,
      willBypassGuardrail,
    );
    setEditing(false);
  };

  return (
    <div className="space-y-5">
      {/* Model output block — visually muted so the AI proposal never reads
          as the human's decision. The editable draft below sits on card
          white to signal "this is where a person decides". */}
      <div className="space-y-5 border border-border bg-muted/40 p-4">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 border border-border bg-background px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            AI Proposed
          </span>
          <span className="font-serif text-xs italic text-muted-foreground">
            Model output plus deterministic guardrails — read-only.
          </span>
        </div>
      <div

        className={`flex items-start gap-3 border px-4 py-3 ${statusStyle.badge}`}
      >
        <span
          className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${statusStyle.dot}`}
        />
        <div className="flex-1">
          <div className="font-mono text-[10px] font-bold uppercase tracking-widest">
            Status
          </div>
          <div className="mt-0.5 font-serif text-base leading-tight">
            {STATUS_LABELS[ruling.status]}
          </div>
        </div>
      </div>

      {ruling.flags.length > 0 ? (
        (() => {
          const isParseFailure = ruling.status === "escalated_parse_failure";
          const wrapCls = isParseFailure
            ? "border-l-4 border-red-600 bg-red-50/60 p-4"
            : "border-l-4 border-orange-500 bg-orange-50/60 p-4";
          const labelCls = isParseFailure
            ? "mb-2 font-mono text-[10px] font-bold uppercase tracking-widest text-red-800"
            : "mb-2 font-mono text-[10px] font-bold uppercase tracking-widest text-orange-800";
          const itemCls = isParseFailure
            ? "font-serif text-sm leading-snug text-red-900"
            : "font-serif text-sm leading-snug text-orange-900";
          return (
            <div className={wrapCls}>
              <div className={labelCls}>Guardrail Flags</div>
              <ul className="space-y-1.5">
                {ruling.flags.map((f) => (
                  <li key={f} className={itemCls}>
                    — {f}
                  </li>
                ))}
              </ul>
            </div>
          );
        })()
      ) : null}

      {attachments.length > 0 ? (
        <div className="border border-border bg-muted/40 p-3">
          <div className="mb-2 flex items-center gap-2 font-mono text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            <PaperclipIcon />
            Attachments ({attachments.length})
          </div>
          <AttachmentsList attachments={attachments} />
          <p className="mt-2 font-serif text-xs italic text-muted-foreground">
            The classifier saw only filenames and types — not the file
            contents. A human should open each file before acting.
          </p>
        </div>
      ) : null}

      {ruling.embargo.mentioned ? <EmbargoRow embargo={ruling.embargo} /> : null}

      <div className="grid grid-cols-[110px_minmax(0,1fr)] items-baseline gap-4">
        <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
          Category
        </span>
        <span className="border-b border-border pb-1 font-serif text-base text-foreground">
          {CATEGORY_LABELS[decision.category]}
        </span>
      </div>

      <div className="grid grid-cols-[110px_minmax(0,1fr)] items-center gap-4">
        <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
          Priority
        </span>
        <span
          className={`inline-flex w-fit items-center gap-2 border px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-widest ${pri.bg} ${pri.text}`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${pri.dot}`} />
          {pri.label}
        </span>
      </div>

      <div className="grid grid-cols-[110px_minmax(0,1fr)] items-start gap-4">
        <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
          Route
        </span>
        <div className="flex flex-col gap-1 border-b border-border pb-1">
          <span className="font-serif text-base text-foreground">
            {ruling.finalRoute}
          </span>
          {routeOverridden ? (
            <span className="font-mono text-[10px] uppercase tracking-widest text-purple-700">
              Overrode model suggestion: {decision.route}
            </span>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-[110px_minmax(0,1fr)] items-start gap-4">
        <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
          Reasoning
        </span>
        <p className="border-b border-border pb-2 font-serif text-sm italic leading-relaxed text-foreground">
          {decision.reason}
        </p>
      </div>

      <div className="mt-8 border-t border-dashed border-border pt-6">
        {decision.parseFailed ? (
          <div>
            <div className="font-mono text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              Confidence Score
            </div>
            <p className="mt-2 font-serif text-sm italic leading-relaxed text-red-700">
              Not available — the model response was invalid, so no confidence
              can be reported. A human must classify this request.
            </p>
          </div>
        ) : (
          <>
            <div className="mb-2 flex items-baseline justify-between">
              <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                Confidence Score
              </span>
              <span
                className={`font-serif text-lg ${belowThreshold ? "text-red-700" : "text-foreground"}`}
              >
                {pct}%
              </span>
            </div>
            <div
              className="h-1.5 w-full bg-muted"
              role="progressbar"
              aria-valuenow={pct}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div
                className={`h-full ${belowThreshold ? "bg-red-600" : "bg-foreground"}`}
                style={{ width: `${pct}%` }}
              />
            </div>
            {belowThreshold ? (
              <p className="mt-2 font-mono text-[10px] uppercase tracking-widest text-red-700">
                Below threshold ({activeRulebook.confidenceThreshold.toFixed(2)}) — flag for review.
              </p>
            ) : null}
          </>
        )}
      </div>
      </div>


      {/* Review controls — mode-dependent */}
      <div className="mt-6 border-t border-border pt-6">
        {mode === "superseded" ? (
          <p className="font-serif text-sm italic text-muted-foreground">
            This revision has been superseded by a newer decision. Open the
            latest revision from the Queue to make further changes.
          </p>
        ) : mode === "finalized" ? (
          <div className="space-y-3">
            <p className="font-serif text-sm italic text-foreground">
              Finalized decision — read-only.
              {finalizedReviewer ? (
                <>
                  {" "}
                  Accepted by{" "}
                  <span className="not-italic font-semibold">
                    {finalizedReviewer}
                  </span>
                  {finalizedAt
                    ? ` at ${formatTime(finalizedAt)}`
                    : null}
                  .
                </>
              ) : null}
            </p>
            <div className="flex justify-end">
              <AlertDialog open={confirmReopen} onOpenChange={setConfirmReopen}>
                <AlertDialogTrigger asChild>
                  <button
                    type="button"
                    className="border border-foreground bg-background py-2.5 px-4 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-foreground transition-colors hover:bg-foreground/5"
                  >
                    Reopen for revision
                  </button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle className="font-serif">
                      Reopen this finalized decision?
                    </AlertDialogTitle>
                    <AlertDialogDescription className="font-serif">
                      This reverses an audited decision. The current version
                      stays in the log; saving will append a new revision
                      attributed to you.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel className="font-mono text-[10px] font-bold uppercase tracking-[0.2em]">
                      Cancel
                    </AlertDialogCancel>
                    <AlertDialogAction
                      onClick={onReopen}
                      className="btn-primary px-4 py-2.5 font-mono text-[10px] font-bold uppercase tracking-[0.2em]"
                    >
                      Reopen for revision
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
        ) : !editing ? (
          <div className="space-y-4">
            <ReviewerField value={reviewer} onChange={onReviewerChange} />
            <ReasonField
              value={reason}
              onChange={setReason}
              required={false}
            />
            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="border border-foreground bg-background py-2.5 px-4 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-foreground transition-colors hover:bg-foreground/5"
              >
                Override
              </button>
              <button
                type="button"
                onClick={acceptAsIs}
                disabled={!reviewerReady}
                title={reviewerReady ? undefined : "Enter your name to accept."}
                className="btn-primary px-6 py-2.5 font-mono text-[10px] font-bold uppercase tracking-[0.2em]"
              >
                Accept &amp; Send to Queue
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4 border border-border bg-card p-4">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center border border-foreground bg-background px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-widest text-foreground">
                Human decision
              </span>
              <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                {mode === "revising" ? "Revision Draft" : "Override Draft"}
              </span>
            </div>


            <ReviewerField value={reviewer} onChange={onReviewerChange} />

            <OverrideField label="Category">
              <select
                value={draftCategory}
                onChange={(e) => setDraftCategory(e.target.value as Category)}
                className="w-full border border-border bg-background px-3 py-2 font-serif text-sm text-foreground focus:border-foreground focus:outline-none"
              >
                {/* Include the current draft category even if it belongs to a
                    different vertical's rulebook — otherwise a persisted item
                    from another vertical would render with no matching option,
                    hiding its true value and blocking reverting to it. */}
                {Array.from(
                  new Set<Category>([
                    draftCategory,
                    ...activeRulebook.categories,
                  ]),
                ).map((c) => (
                  <option key={c} value={c}>
                    {CATEGORY_LABELS[c] ?? c}
                    {activeRulebook.categories.includes(c) ? "" : " (other vertical)"}
                  </option>
                ))}
              </select>
            </OverrideField>

            <OverrideField label="Priority">
              <select
                value={draftPriority}
                onChange={(e) => setDraftPriority(e.target.value as Priority)}
                className="w-full border border-border bg-background px-3 py-2 font-serif text-sm text-foreground focus:border-foreground focus:outline-none"
              >
                {Array.from(
                  new Set<Priority>([
                    draftPriority,
                    ...activeRulebook.priorities,
                  ]),
                ).map((p) => (
                  <option key={p} value={p}>
                    {p.charAt(0).toUpperCase() + p.slice(1)}
                  </option>
                ))}
              </select>
            </OverrideField>

            <OverrideField label="Route">
              <select
                value={draftRoute}
                onChange={(e) => setDraftRoute(e.target.value)}
                className="w-full border border-border bg-background px-3 py-2 font-serif text-sm text-foreground focus:border-foreground focus:outline-none"
              >
                {AVAILABLE_ROUTES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </OverrideField>

            {willBypassGuardrail ? (
              <label className="flex items-start gap-3 border-l-4 border-red-600 bg-red-50/70 p-3">
                <input
                  type="checkbox"
                  checked={ackGuardrail}
                  onChange={(e) => setAckGuardrail(e.target.checked)}
                  className="mt-1 h-4 w-4 shrink-0"
                />
                <span className="font-serif text-sm leading-snug text-red-900">
                  <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-red-800">
                    Safety escalation bypass
                  </span>
                  <br />
                  I acknowledge I am overriding a safety escalation
                  {ruling.flags.length > 0 ? (
                    <>
                      {" "}
                      (<span className="italic">
                        {ruling.flags.join("; ")}
                      </span>)
                    </>
                  ) : null}{" "}
                  and routing this request out of the Human Review Queue.
                </span>
              </label>
            ) : null}

            <ReasonField
              value={reason}
              onChange={setReason}
              required={overrideReasonRequired}
              helper={
                overrideReasonRequired
                  ? willBypassGuardrail
                    ? "Required — explain why bypassing the safety escalation is appropriate."
                    : "Required — explain why you are changing this decision."
                  : "Optional — add context for the audit log."
              }
            />

            <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:items-center sm:justify-end">
              <button
                type="button"
                onClick={() => {
                  if (mode === "revising") {
                    onCancelRevision();
                    return;
                  }
                  setEditing(false);
                  setDraftCategory(decision.category);
                  setDraftPriority(ruling.priority);
                  setDraftRoute(ruling.finalRoute);
                  setReason("");
                  setAckGuardrail(false);
                }}
                className="border border-border bg-background py-2.5 px-4 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground transition-colors hover:text-foreground"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveOverride}
                disabled={!canSaveOverride}
                title={
                  !reviewerReady
                    ? "Enter your name to save."
                    : overrideReasonRequired && reasonTrimmed.length === 0
                      ? "A reason is required for this change."
                      : willBypassGuardrail && !ackGuardrail
                        ? "Acknowledge the safety escalation bypass to continue."
                        : undefined
                }
                className="bg-primary py-2.5 px-6 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-primary-foreground transition-colors hover:bg-foreground/90 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {mode === "revising" ? "Save as revision" : "Save Override"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ReasonField({
  value,
  onChange,
  required,
  helper,
}: {
  value: string;
  onChange: (v: string) => void;
  required: boolean;
  helper: string;
}) {
  const empty = value.trim().length === 0;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <label
          htmlFor="reason-textarea"
          className="font-mono text-[10px] font-bold uppercase tracking-widest text-muted-foreground"
        >
          Reason for change{" "}
          {required ? (
            <span className="text-red-700">*</span>
          ) : (
            <span className="text-muted-foreground/70">(optional)</span>
          )}
        </label>
        <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          {value.length}/500
        </span>
      </div>
      <textarea
        id="reason-textarea"
        value={value}
        maxLength={500}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
        placeholder={
          required
            ? "Why are you changing this decision? (recorded in the audit log)"
            : "Add context for the audit log."
        }
        className={`w-full resize-none border bg-background px-3 py-2 font-serif text-sm text-foreground focus:outline-none ${
          required && empty
            ? "border-red-300 focus:border-red-600"
            : "border-border focus:border-foreground"
        }`}
      />
      <p
        className={`font-serif text-xs italic ${
          required && empty ? "text-red-700" : "text-muted-foreground"
        }`}
      >
        {helper}
      </p>
    </div>
  );
}


function ReviewerField({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="grid grid-cols-[110px_minmax(0,1fr)] items-center gap-4">
      <label
        htmlFor="reviewer-name"
        className="font-mono text-[10px] font-bold uppercase tracking-widest text-muted-foreground"
      >
        Reviewer
      </label>
      <input
        id="reviewer-name"
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Your name (required to finalize)"
        className="w-full border border-border bg-background px-3 py-2 font-serif text-sm text-foreground focus:border-foreground focus:outline-none"
      />
    </div>
  );
}

function OverrideField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[110px_minmax(0,1fr)] items-center gap-4">
      <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
        {label}
      </span>
      {children}
    </div>
  );
}

// ---------- Queue view ----------

function QueueView({
  items,
  currentQueue,
  escalatedCount,
  autoRoutedCount,
  overriddenCount,
  revisionCount,
  onStartNew,
  onReview,
  reviewingId,
  batchProgress,
  queueLoading,
  queueError,
}: {
  items: QueueItem[];
  currentQueue: QueueItem[];
  escalatedCount: number;
  autoRoutedCount: number;
  overriddenCount: number;
  revisionCount: number;
  onStartNew: () => void;
  onReview: (item: QueueItem) => void;
  reviewingId: string | null;
  batchProgress: { done: number; total: number } | null;
  queueLoading: boolean;
  queueError: string | null;
}) {
  // Filters — all default to "all". Filter state is local to the queue view
  // since it isn't relevant anywhere else.
  const [statusFilter, setStatusFilter] = useState<"all" | "auto_routed" | "escalated">("all");
  const [routeFilter, setRouteFilter] = useState<string>("all");
  const [priorityFilter, setPriorityFilter] = useState<"all" | Priority>("all");

  // Sorting — controlled by clickable column headers. Reset to newest-first
  // on every visit; deliberately not persisted.
  const [sortField, setSortField] = useState<"date" | "priority">("date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const handleSort = (field: "date" | "priority") => {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      // Newest-first for date; urgent-first for priority.
      setSortDir(field === "date" ? "desc" : "desc");
    }
  };

  const availableRoutes = useMemo(() => {
    const set = new Set<string>();
    for (const q of currentQueue) set.add(q.finalDecision.route);
    return Array.from(set).sort();
  }, [currentQueue]);

  if (queueLoading) {
    return (
      <div className="border border-border bg-card p-12 text-center">
        <div
          className="mx-auto flex items-center justify-center gap-2 font-mono text-[11px] font-bold uppercase tracking-widest text-foreground"
          role="status"
        >
          <Spinner /> Loading queue…
        </div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="border border-border bg-card p-12 text-center">
        {queueError ? (
          <p className="font-serif text-sm italic text-red-800">{queueError}</p>
        ) : batchProgress ? (
          <>
            <div
              className="mx-auto flex items-center justify-center gap-2 font-mono text-[11px] font-bold uppercase tracking-widest text-foreground"
              role="status"
              aria-live="polite"
            >
              <Spinner /> Triaging {batchProgress.done} of {batchProgress.total}…
            </div>
            <p className="mt-3 font-serif text-sm italic text-muted-foreground">
              Rows will appear here as each request is classified.
            </p>
          </>
        ) : (
          <>
            <p className="font-serif text-base italic text-muted-foreground">
              Queue is empty.
            </p>
            <p className="mt-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              Triaged and reviewed requests will appear here.
            </p>
            <button
              type="button"
              onClick={onStartNew}
              className="mt-6 border border-foreground bg-background py-2 px-4 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-foreground transition-colors hover:bg-foreground/5"
            >
              Go to Triage
            </button>
          </>
        )}
      </div>
    );
  }


  // Fold revisions into a single row per request. Table always shows the
  // latest version; the audit trail lives inside the workspace view.
  const allRows = currentQueue;
  const rows = allRows
    .filter((item) => {
      if (
        statusFilter === "auto_routed" &&
        item.finalDecision.status !== "auto_routed"
      ) return false;
      if (
        statusFilter === "escalated" &&
        item.finalDecision.status === "auto_routed"
      ) return false;
      if (routeFilter !== "all" && item.finalDecision.route !== routeFilter)
        return false;
      if (priorityFilter !== "all" && item.finalDecision.priority !== priorityFilter)
        return false;
      return true;
    })
    .sort((a, b) => {
      const dir = sortDir === "asc" ? 1 : -1;
      if (sortField === "date") {
        return dir * (a.timestamp - b.timestamp);
      }
      // Priority: urgent=3, normal=2, low=1.
      const weight: Record<Priority, number> = { urgent: 3, normal: 2, low: 1 };
      return dir * (weight[a.finalDecision.priority] - weight[b.finalDecision.priority]);
    });
  const anyEmbargo = rows.some((i) => i.aiRuling.embargo.mentioned);
  const revisionsPerRoot = new Map<string, number>();
  for (const item of items) {
    revisionsPerRoot.set(
      item.rootId,
      (revisionsPerRoot.get(item.rootId) ?? 0) + 1,
    );
  }
  const filtersActive =
    statusFilter !== "all" || routeFilter !== "all" || priorityFilter !== "all";

  return (
    <div className="space-y-6">
      {queueError ? (
        <div
          role="alert"
          className="border-l-4 border-red-600 bg-red-50/70 px-4 py-2 font-mono text-[11px] text-red-800"
        >
          {queueError}
        </div>
      ) : null}
      {/* Counters — always over current versions. Revisions surface below. */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat
          label="Current"
          value={allRows.length}
          hint={`Latest version of each request`}
        />
        <Stat
          label="Auto-routed"
          value={autoRoutedCount}
          tone="green"
          hint={`of ${allRows.length} request${allRows.length === 1 ? "" : "s"}`}
        />
        <Stat
          label="Escalated"
          value={escalatedCount}
          tone="orange"
          hint="Not auto-routed"
        />
        <Stat
          label="Overridden"
          value={overriddenCount}
          tone="purple"
          hint="Human-changed"
        />
      </div>
      <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
        {filtersActive
          ? `${rows.length} of ${allRows.length} request${allRows.length === 1 ? "" : "s"} (filtered)`
          : `${allRows.length} request${allRows.length === 1 ? "" : "s"}`}
        {revisionCount > 0
          ? ` · ${revisionCount} superseded revision${revisionCount === 1 ? "" : "s"} in log`
          : ""}
      </p>

      {/* Filter controls — status / route / priority, over current versions. */}
      <div className="flex flex-wrap items-end gap-3 border border-dashed border-border bg-card/50 p-3">
        <FilterSelect
          label="Status"
          value={statusFilter}
          onChange={(v) => setStatusFilter(v as "all" | "auto_routed" | "escalated")}
          options={[
            { value: "all", label: "All" },
            { value: "auto_routed", label: "Auto-routed" },
            { value: "escalated", label: "Escalated" },
          ]}
        />
        <FilterSelect
          label="Route"
          value={routeFilter}
          onChange={setRouteFilter}
          options={[
            { value: "all", label: "All" },
            ...availableRoutes.map((r) => ({ value: r, label: r })),
          ]}
        />
        <FilterSelect
          label="Priority"
          value={priorityFilter}
          onChange={(v) => setPriorityFilter(v as "all" | Priority)}
          options={[
            { value: "all", label: "All" },
            { value: "urgent", label: "Urgent" },
            { value: "normal", label: "Normal" },
            { value: "low", label: "Low" },
          ]}
        />
        {filtersActive ? (
          <button
            type="button"
            onClick={() => {
              setStatusFilter("all");
              setRouteFilter("all");
              setPriorityFilter("all");
            }}
            className="ml-auto border border-border bg-background px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-widest text-foreground hover:bg-foreground/5"
          >
            Clear filters
          </button>
        ) : null}
      </div>


      {batchProgress ? (
        <div
          role="status"
          aria-live="polite"
          className="flex items-center gap-3 border-l-4 border-foreground bg-foreground/5 px-4 py-3 font-mono text-[11px] uppercase tracking-widest text-foreground"
        >
          <Spinner />
          <span className="font-bold">
            Triaging {batchProgress.done} of {batchProgress.total}…
          </span>
          <span className="ml-auto normal-case tracking-normal text-muted-foreground">
            Rows appear as each request resolves.
          </span>
        </div>
      ) : null}

      <div className="overflow-x-auto border border-border bg-card">
        <table className="w-full min-w-[720px] border-collapse text-left">
          <thead>
            <tr className="border-b border-border">
              <Th
                sortable
                sorted={sortField === "date"}
                direction={sortDir}
                onClick={() => handleSort("date")}
                title={`Sort time ${sortField === "date" && sortDir === "desc" ? "oldest first" : "newest first"}`}
              >
                Time
              </Th>
              <Th>Request</Th>
              <Th>Category</Th>
              <Th
                sortable
                sorted={sortField === "priority"}
                direction={sortDir}
                onClick={() => handleSort("priority")}
                title={`Sort priority ${sortField === "priority" && sortDir === "desc" ? "low first" : "urgent first"}`}
              >
                Priority
              </Th>
              <Th>Route</Th>
              {anyEmbargo ? <Th>Embargo</Th> : null}
              <Th>Status</Th>
              <Th>Override</Th>
              <Th>Action</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((item) => {
              const pri = PRIORITY_STYLES[item.finalDecision.priority];
              const status = STATUS_STYLES[item.finalDecision.status];
              const isReviewing = reviewingId === item.id;
              const emb = item.aiRuling.embargo;
              const totalRevisions = revisionsPerRoot.get(item.rootId) ?? 1;
              return (
                <tr
                  key={item.id}
                  className="border-b border-border/60 align-top last:border-b-0"
                >
                  <Td>
                    <div className="flex flex-col gap-0.5">
                      <span className="font-mono text-[11px] text-muted-foreground">
                        {formatTime(item.timestamp)}
                      </span>
                      {item.reviewer ? (
                        <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                          Triaged by {item.reviewer}
                        </span>
                      ) : null}
                    </div>
                  </Td>
                  <Td>
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-2">
                        {item.revision > 1 || totalRevisions > 1 ? (
                          <span
                            className="inline-flex items-center border border-purple-300 bg-purple-50 px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-widest text-purple-800"
                            title={
                              totalRevisions > 1
                                ? `Revised ${totalRevisions - 1} time${totalRevisions - 1 === 1 ? "" : "s"} — open to view history`
                                : undefined
                            }
                          >
                            v{item.revision}
                          </span>
                        ) : null}
                        <span className="line-clamp-2 font-serif text-sm text-foreground">
                          {shorten(item.requestText, 90)}
                        </span>
                      </div>
                      {item.attachments.length > 0 ? (
                        <span
                          title={item.attachments
                            .map((a) => a.filename)
                            .join(", ")}
                          className="inline-flex w-fit items-center gap-1 border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground"
                        >
                          <PaperclipIcon />
                          {item.attachments.length} file
                          {item.attachments.length === 1 ? "" : "s"}
                        </span>
                      ) : null}
                    </div>
                  </Td>
                  <Td>
                    <span className="font-serif text-sm">
                      {CATEGORY_LABELS[item.finalDecision.category]}
                    </span>
                  </Td>
                  <Td>
                    <span
                      className={`inline-flex items-center gap-1.5 border px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-widest ${pri.bg} ${pri.text}`}
                    >
                      <span className={`h-1.5 w-1.5 rounded-full ${pri.dot}`} />
                      {pri.label}
                    </span>
                  </Td>
                  <Td>
                    <span className="font-serif text-sm">
                      {item.finalDecision.route}
                    </span>
                  </Td>
                  {anyEmbargo ? (
                    <Td>
                      {emb.mentioned ? (
                        emb.reason === "exact" && emb.date ? (
                          <span
                            title={`Parsed from: ${emb.rawPhrase}`}
                            className="inline-flex items-center gap-1.5 border border-green-300 bg-green-50 px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-widest text-green-800"
                          >
                            <CalendarIcon />
                            {emb.date}
                          </span>
                        ) : (
                          <span
                            title={`Requester wrote: ${emb.rawPhrase ?? "embargo"}`}
                            className="inline-flex items-center gap-1.5 border border-amber-300 bg-amber-50 px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-widest text-amber-800"
                          >
                            <CalendarIcon />
                            Date missing
                          </span>
                        )
                      ) : (
                        <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                          —
                        </span>
                      )}
                    </Td>
                  ) : null}
                  <Td>
                    <span
                      className={`inline-flex items-center gap-1.5 border px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-widest ${status.badge}`}
                    >
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${status.dot}`}
                      />
                      {item.finalDecision.status === "auto_routed"
                        ? "Auto"
                        : "Escalated"}
                    </span>
                  </Td>
                  <Td>
                    {item.overridden ? (
                      <span className="inline-flex items-center gap-1.5 border border-purple-300 bg-purple-50 px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-widest text-purple-800">
                        Overridden
                      </span>
                    ) : (
                      <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                        —
                      </span>
                    )}
                  </Td>
                  <Td>
                    <button
                      type="button"
                      onClick={() => onReview(item)}
                      className={
                        isReviewing
                          ? "border border-purple-400 bg-purple-100 px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-widest text-purple-800"
                          : "border border-foreground bg-background px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-widest text-foreground transition-colors hover:bg-foreground/5"
                      }
                    >
                      {isReviewing
                        ? "Open…"
                        : totalRevisions > 1
                          ? `Open · ${totalRevisions} versions`
                          : "Open"}
                    </button>
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------- Revision Timeline ----------

function RevisionTimeline({
  revisions,
  currentId,
}: {
  // Newest first. Includes v1 through the latest version.
  revisions: QueueItem[];
  currentId: string;
}) {
  return (
    <div className="mt-8 border-t border-border pt-6">
      <div className="mb-3 flex items-baseline justify-between">
        <h3 className="font-mono text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
          Revision History
        </h3>
        <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          {revisions.length} version{revisions.length === 1 ? "" : "s"}
        </span>
      </div>
      <ol className="space-y-3">
        {revisions.map((r) => {
          const isCurrent = r.id === currentId;
          const isV1 = r.revision === 1;
          const verb = r.guardrailAcknowledged
            ? "bypassed guardrail"
            : r.overridden
              ? isV1
                ? "overrode AI"
                : "overrode previous"
              : isV1
                ? "accepted"
                : "re-accepted";
          return (
            <li
              key={r.id}
              className={`border-l-2 pl-3 ${
                isCurrent
                  ? "border-foreground"
                  : "border-border opacity-80"
              }`}
            >
              <div className="flex flex-wrap items-baseline gap-2">
                <span
                  className={`inline-flex items-center border px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-widest ${
                    isCurrent
                      ? "border-foreground bg-foreground text-background"
                      : "border-border bg-background text-muted-foreground"
                  }`}
                >
                  v{r.revision}
                </span>
                <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  {formatTime(r.timestamp)}
                </span>
                <span className="font-serif text-sm text-foreground">
                  <span className="font-semibold">
                    {r.reviewer || "—"}
                  </span>{" "}
                  <span className="italic text-muted-foreground">{verb}</span>
                </span>
              </div>

              {r.guardrailAcknowledged ? (
                <div className="mt-1 font-mono text-[10px] uppercase tracking-widest text-red-700">
                  ⚠ Bypassed safety escalation
                </div>
              ) : null}

              <div className="mt-1.5 space-y-0.5 font-serif text-sm text-foreground">
                {isV1 && r.changes.length === 0 ? (
                  <div className="text-muted-foreground">
                    Initial:{" "}
                    {CATEGORY_LABELS[r.finalDecision.category]} ·{" "}
                    {PRIORITY_DISPLAY[r.finalDecision.priority]} ·{" "}
                    {r.finalDecision.route}
                  </div>
                ) : r.changes.length === 0 ? (
                  <div className="italic text-muted-foreground">
                    No decision fields changed.
                  </div>
                ) : (
                  r.changes.map((c) => (
                    <div key={c.field}>
                      <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                        {c.field}:
                      </span>{" "}
                      <span className="text-muted-foreground line-through">
                        {c.from}
                      </span>{" "}
                      <span className="text-muted-foreground">→</span>{" "}
                      <span className="font-medium">{c.to}</span>
                    </div>
                  ))
                )}
              </div>

              {r.reason.trim().length > 0 ? (
                <p className="mt-1.5 font-serif text-sm italic leading-snug text-foreground">
                  “{r.reason}”
                </p>
              ) : !isV1 || r.overridden ? (
                <p className="mt-1.5 font-serif text-xs italic text-muted-foreground">
                  (no reason recorded)
                </p>
              ) : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
}


function Stat({
  label,
  value,
  tone,
  hint,
}: {
  label: string;
  value: number;
  tone?: "green" | "purple" | "orange";
  hint?: string;
}) {
  const toneClass =
    tone === "green"
      ? "text-green-700"
      : tone === "purple"
        ? "text-purple-700"
        : tone === "orange"
          ? "text-orange-700"
          : "text-foreground";
  return (
    <div className="border border-border bg-card p-4">
      <div className="font-mono text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
        {label}
      </div>
      <div className={`mt-1 font-serif text-2xl ${toneClass}`}>{value}</div>
      {hint ? (
        <div className="mt-1 font-serif text-xs italic text-muted-foreground">
          {hint}
        </div>
      ) : null}
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: readonly { value: string; label: string }[];
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="border border-border bg-background px-2 py-1 font-serif text-sm text-foreground focus:border-foreground focus:outline-none"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function Th({
  children,
  sortable,
  sorted,
  direction,
  onClick,
  title,
}: {
  children: React.ReactNode;
  sortable?: boolean;
  sorted?: boolean;
  direction?: "asc" | "desc";
  onClick?: () => void;
  title?: string;
}) {
  return (
    <th
      onClick={sortable ? onClick : undefined}
      aria-sort={sorted ? (direction === "asc" ? "ascending" : "descending") : "none"}
      title={title}
      className={`px-3 py-3 text-left font-mono text-[10px] font-bold uppercase tracking-widest text-muted-foreground ${
        sortable ? "cursor-pointer select-none transition-colors hover:bg-muted/60" : ""
      } ${sorted ? "bg-muted/40" : ""}`}
    >
      <span className="inline-flex items-center gap-1.5">
        {children}
        {sorted ? (
          <span aria-hidden="true" className="text-foreground">
            {direction === "asc" ? "▲" : "▼"}
          </span>
        ) : sortable ? (
          <span aria-hidden="true" className="text-muted-foreground/40">
            ⇅
          </span>
        ) : null}
      </span>
    </th>
  );
}

function Td({ children }: { children: React.ReactNode }) {
  return <td className="px-3 py-3">{children}</td>;
}

function shorten(text: string, max: number): string {
  const t = text.trim().replace(/\s+/g, " ");
  return t.length > max ? t.slice(0, max - 1) + "…" : t;
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  const yyyy = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `${yyyy}-${mo}-${dd} ${hh}:${mm}:${ss}`;
}

function Spinner() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-3.5 w-3.5 animate-spin"
      fill="none"
    >
      <circle
        cx="12"
        cy="12"
        r="9"
        stroke="currentColor"
        strokeWidth="3"
        opacity="0.25"
      />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

function DecisionSkeleton() {
  return (
    <div
      className="flex flex-1 flex-col gap-6"
      role="status"
      aria-label="Triaging request"
    >
      <div className="flex items-center gap-3">
        <div className="h-6 w-40 animate-pulse bg-foreground/10" />
        <div className="h-6 w-20 animate-pulse bg-foreground/10" />
      </div>
      <div className="space-y-2">
        <div className="h-3 w-24 animate-pulse bg-foreground/10" />
        <div className="h-4 w-full animate-pulse bg-foreground/10" />
        <div className="h-4 w-5/6 animate-pulse bg-foreground/10" />
      </div>
      <div className="space-y-2">
        <div className="h-3 w-28 animate-pulse bg-foreground/10" />
        <div className="h-2 w-full animate-pulse bg-foreground/10" />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="h-16 animate-pulse bg-foreground/10" />
        <div className="h-16 animate-pulse bg-foreground/10" />
      </div>
      <div className="mt-auto flex gap-3">
        <div className="h-10 flex-1 animate-pulse bg-foreground/10" />
        <div className="h-10 w-32 animate-pulse bg-foreground/10" />
      </div>
    </div>
  );
}


// ---------- Embargo UI ----------

function CalendarIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-3 w-3"
      aria-hidden="true"
    >
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
    </svg>
  );
}

function EmbargoRow({ embargo }: { embargo: import("@/lib/embargo").EmbargoDetection }) {
  const hasDate = embargo.reason === "exact" && embargo.date;
  return (
    <div className="grid grid-cols-[110px_minmax(0,1fr)] items-start gap-4">
      <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
        Embargo
      </span>
      <div className="flex flex-col gap-1 border-b border-border pb-2">
        {hasDate ? (
          <>
            <span className="inline-flex w-fit items-center gap-2 border border-green-300 bg-green-50 px-2.5 py-1 font-mono text-[11px] font-bold uppercase tracking-widest text-green-800">
              <CalendarIcon />
              {embargo.date}
            </span>
            <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              Release date parsed from: “{embargo.rawPhrase}”
            </span>
          </>
        ) : (
          <>
            <span className="inline-flex w-fit items-center gap-2 border border-amber-300 bg-amber-50 px-2.5 py-1 font-mono text-[11px] font-bold uppercase tracking-widest text-amber-800">
              <CalendarIcon />
              Date missing
            </span>
            <span className="font-serif text-xs italic text-muted-foreground">
              Requester wrote: “{embargo.rawPhrase ?? "embargo"}” — curator must
              confirm an exact YYYY-MM-DD before release.
            </span>
          </>
        )}
      </div>
    </div>
  );
}

// ---------- Attachments UI ----------



function PaperclipIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-3 w-3"
      aria-hidden="true"
    >
      <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 17.99 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />
    </svg>
  );
}

function AttachmentsEditor({
  attachments,
  fileInputRef,
  onAdd,
  onRemove,
  disabled,
}: {
  attachments: Attachment[];
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onAdd: (files: FileList | null) => void;
  onRemove: (id: string) => void;
  disabled: boolean;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
          Attachments {attachments.length > 0 ? `(${attachments.length})` : ""}
        </span>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled}
          className="inline-flex items-center gap-1.5 border border-border bg-background px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-widest text-foreground transition-colors hover:bg-foreground/5 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <PaperclipIcon />
          Attach files
        </button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => onAdd(e.target.files)}
        />
      </div>

      {attachments.length === 0 ? (
        <p className="font-serif text-xs italic text-muted-foreground">
          No files attached. If the request mentions attachments but none are
          present here, the assistant will escalate it to human review.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {attachments.map((a) => (
            <li
              key={a.id}
              className="flex items-center gap-3 border border-border bg-card px-2.5 py-1.5"
            >
              <AttachmentThumb attachment={a} />
              <div className="min-w-0 flex-1">
                <div className="truncate font-serif text-sm text-foreground">
                  {a.filename}
                </div>
                <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  {fileKindLabel(a.mimeType)} · {formatBytes(a.sizeBytes)}
                  {a.note ? ` · ${a.note}` : ""}
                </div>
              </div>
              <button
                type="button"
                onClick={() => onRemove(a.id)}
                disabled={disabled}
                aria-label={`Remove ${a.filename}`}
                className="font-mono text-[10px] font-bold uppercase tracking-widest text-muted-foreground transition-colors hover:text-red-700 disabled:opacity-50"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function AttachmentsList({ attachments }: { attachments: Attachment[] }) {
  return (
    <ul className="space-y-1.5">
      {attachments.map((a) => {
        const inner = (
          <>
            <AttachmentThumb attachment={a} />
            <div className="min-w-0 flex-1">
              <div className="truncate font-serif text-sm text-foreground">
                {a.filename}
              </div>
              <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                {fileKindLabel(a.mimeType)} · {formatBytes(a.sizeBytes)}
                {a.note ? ` · ${a.note}` : ""}
              </div>
            </div>
          </>
        );
        const className =
          "flex items-center gap-3 border border-border bg-card px-2.5 py-1.5";
        return (
          <li key={a.id}>
            {a.objectUrl ? (
              <a
                href={a.objectUrl}
                target="_blank"
                rel="noreferrer"
                className={`${className} transition-colors hover:bg-foreground/5`}
              >
                {inner}
              </a>
            ) : (
              <div className={className}>{inner}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function AttachmentThumb({ attachment }: { attachment: Attachment }) {
  if (attachment.objectUrl && isImageMime(attachment.mimeType)) {
    return (
      <img
        src={attachment.objectUrl}
        alt=""
        className="h-9 w-9 shrink-0 border border-border object-cover"
      />
    );
  }
  return (
    <div className="flex h-9 w-9 shrink-0 items-center justify-center border border-border bg-muted font-mono text-[9px] font-bold uppercase tracking-widest text-muted-foreground">
      {fileKindLabel(attachment.mimeType).slice(0, 3)}
    </div>
  );
}

