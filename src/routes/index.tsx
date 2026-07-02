import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  RULEBOOK,
  CATEGORY_LABELS,
  type Category,
  type Priority,
} from "@/lib/rulebook";
import { mockClassify, type Decision } from "@/lib/mock-classify";
import {
  applyRules,
  STATUS_LABELS,
  type RuleResult,
  type TriageStatus,
} from "@/lib/apply-rules";
import { SAMPLE_REQUESTS } from "@/lib/sample-requests";

export const Route = createFileRoute("/")({
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
  component: Index,
});

// ---------- Types ----------

interface FinalDecision {
  category: Category;
  priority: Priority;
  route: string;
  status: TriageStatus;
  flags: string[];
}

interface QueueItem {
  id: string;
  timestamp: number;
  requestText: string;
  aiDecision: Decision;
  aiRuling: RuleResult;
  finalDecision: FinalDecision;
  overridden: boolean;
}

// All routes selectable in the Override control.
const AVAILABLE_ROUTES: readonly string[] = [
  ...Array.from(new Set(Object.values(RULEBOOK.routes))),
  "Human Review Queue",
];

// ---------- Root component ----------

function Index() {
  const [requestText, setRequestText] = useState("");
  const [activeTab, setActiveTab] = useState<"triage" | "queue">("triage");
  const [decision, setDecision] = useState<Decision | null>(null);
  const [ruling, setRuling] = useState<RuleResult | null>(null);
  const [processedQueue, setProcessedQueue] = useState<QueueItem[]>([]);
  // When set, finalizing replaces the existing queue item instead of prepending.
  const [reviewingId, setReviewingId] = useState<string | null>(null);

  const handleTriage = () => {
    if (requestText.trim().length === 0) return;
    const d = mockClassify(requestText);
    setDecision(d);
    setRuling(applyRules(d, requestText));
  };

  const buildQueueItem = (
    text: string,
    final: FinalDecision,
    d: Decision,
    r: RuleResult,
    wasOverridden: boolean,
  ): QueueItem => ({
    id:
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : String(Date.now() + Math.random()),
    timestamp: Date.now(),
    requestText: text,
    aiDecision: d,
    aiRuling: r,
    finalDecision: final,
    overridden: wasOverridden,
  });

  const handleFinalize = (final: FinalDecision, wasOverridden: boolean) => {
    if (!decision || !ruling) return;
    if (reviewingId) {
      setProcessedQueue((prev) =>
        prev.map((q) =>
          q.id === reviewingId
            ? {
                ...q,
                timestamp: Date.now(),
                finalDecision: final,
                overridden: wasOverridden || q.overridden,
              }
            : q,
        ),
      );
      setReviewingId(null);
      setActiveTab("queue");
    } else {
      setProcessedQueue((prev) => [
        buildQueueItem(requestText, final, decision, ruling, wasOverridden),
        ...prev,
      ]);
    }
    // Reset the workspace for the next intake.
    setRequestText("");
    setDecision(null);
    setRuling(null);
  };

  const handleLoadSample = (text: string) => {
    setRequestText(text);
    setDecision(null);
    setRuling(null);
    setReviewingId(null);
  };

  const handleTriageAll = () => {
    const now = Date.now();
    const items: QueueItem[] = SAMPLE_REQUESTS.map((s, i) => {
      const d = mockClassify(s.text);
      const r = applyRules(d, s.text);
      const final: FinalDecision = {
        category: d.category,
        priority: r.priority,
        route: r.finalRoute,
        status: r.status,
        flags: r.flags,
      };
      return {
        id:
          typeof crypto !== "undefined" && "randomUUID" in crypto
            ? crypto.randomUUID()
            : String(now + i),
        // Stagger timestamps so table sort by time reads naturally.
        timestamp: now + i,
        requestText: s.text,
        aiDecision: d,
        aiRuling: r,
        finalDecision: final,
        overridden: false,
      };
    });
    // Newest first, and keep any existing items after the batch.
    setProcessedQueue((prev) => [...items.reverse(), ...prev]);
    setActiveTab("queue");
  };

  const handleReview = (item: QueueItem) => {
    setRequestText(item.requestText);
    setDecision(item.aiDecision);
    setRuling(item.aiRuling);
    setReviewingId(item.id);
    setActiveTab("triage");
  };

  const cancelReview = () => {
    setReviewingId(null);
    setRequestText("");
    setDecision(null);
    setRuling(null);
  };

  const escalatedCount = processedQueue.filter(
    (q) => q.finalDecision.status !== "auto_routed",
  ).length;
  const autoRoutedCount = processedQueue.length - escalatedCount;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-6 py-8 sm:px-8 sm:py-10">
        <header className="mb-8 border-b border-foreground pb-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-baseline sm:justify-between">
            <h1 className="font-serif text-2xl font-medium leading-tight text-foreground sm:text-3xl">
              Intake Triage &amp; Routing Assistant
            </h1>
            <nav
              aria-label="Sections"
              className="flex gap-6 text-xs font-semibold uppercase tracking-widest"
            >
              <TabButton
                active={activeTab === "triage"}
                onClick={() => setActiveTab("triage")}
              >
                Triage
              </TabButton>
              <TabButton
                active={activeTab === "queue"}
                onClick={() => setActiveTab("queue")}
              >
                Queue
                {processedQueue.length > 0 ? (
                  <span className="ml-1.5 rounded-sm bg-foreground px-1.5 py-0.5 font-mono text-[9px] text-background">
                    {processedQueue.length}
                  </span>
                ) : null}
              </TabButton>
            </nav>
          </div>
          <p className="mt-2 font-serif text-sm italic text-muted-foreground sm:text-base">
            Decision support — a human reviews every decision.
          </p>
        </header>

        <main className="flex-1">
          {activeTab === "triage" ? (
            <div className="grid grid-cols-1 items-start gap-10 lg:grid-cols-2 lg:gap-12">
              {/* Input */}
              <section aria-labelledby="request-label" className="space-y-6">
                {reviewingId ? (
                  <div className="flex items-start justify-between gap-3 border border-purple-300 bg-purple-50/60 px-4 py-3">
                    <div>
                      <div className="font-mono text-[10px] font-bold uppercase tracking-widest text-purple-800">
                        Reviewing queued item
                      </div>
                      <div className="mt-0.5 font-serif text-sm italic text-purple-900">
                        Accept or override to update the queue entry.
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={cancelReview}
                      className="border border-purple-300 bg-background px-3 py-1 font-mono text-[10px] font-bold uppercase tracking-widest text-purple-800 hover:bg-purple-100"
                    >
                      Cancel
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
                      rows={12}
                      placeholder="Paste an incoming request here — an email about accessing a restricted dataset, a deposit question, a licensing query, or a broken download link."
                      className="h-64 w-full resize-none border border-border bg-card p-4 text-sm leading-relaxed text-foreground shadow-none outline-none transition-colors placeholder:text-muted-foreground/70 focus:border-foreground focus:ring-0"
                    />
                    <div className="pointer-events-none absolute bottom-3 right-3 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                      CHAR: {requestText.length}
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleTriage}
                  disabled={requestText.trim().length === 0}
                  className="w-full bg-primary py-3 font-mono text-xs font-bold uppercase tracking-[0.2em] text-primary-foreground shadow-sm transition-colors hover:bg-foreground/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Triage Request
                </button>

                {/* Sample batch controls */}
                <div className="border-t border-dashed border-border pt-5">
                  <div className="mb-3 flex items-baseline justify-between gap-3">
                    <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                      Sample Corpus
                    </span>
                    <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                      {SAMPLE_REQUESTS.length} fixtures
                    </span>
                  </div>
                  <p className="mb-3 font-serif text-xs italic text-muted-foreground">
                    Hard-coded intake messages covering every category and each
                    guardrail case. Load one into the editor, or triage the
                    whole set at once and inspect the queue.
                  </p>
                  <div className="mb-4 flex flex-col gap-2 sm:flex-row">
                    <select
                      aria-label="Load a sample request"
                      value=""
                      onChange={(e) => {
                        const s = SAMPLE_REQUESTS.find(
                          (x) => x.id === e.target.value,
                        );
                        if (s) handleLoadSample(s.text);
                      }}
                      className="flex-1 border border-border bg-background px-3 py-2 font-serif text-sm text-foreground focus:border-foreground focus:outline-none"
                    >
                      <option value="" disabled>
                        Load sample request…
                      </option>
                      {SAMPLE_REQUESTS.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={handleTriageAll}
                      className="border border-foreground bg-background px-4 py-2 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-foreground transition-colors hover:bg-foreground/5"
                    >
                      Triage all
                    </button>
                  </div>
                </div>
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
                    {decision
                      ? "Proposed decision — pending human review."
                      : "No request triaged yet."}
                  </p>
                </div>

                {decision && ruling ? (
                  <DecisionCard
                    key={requestText.slice(0, 24) + processedQueue.length}
                    decision={decision}
                    ruling={ruling}
                    onFinalize={handleFinalize}
                  />
                ) : (
                  <EmptyDecisionState />
                )}
              </section>
            </div>
          ) : (
            <QueueView
              items={processedQueue}
              escalatedCount={escalatedCount}
              autoRoutedCount={autoRoutedCount}
              onStartNew={() => setActiveTab("triage")}
              onReview={handleReview}
              reviewingId={reviewingId}
            />
          )}
        </main>

        <footer className="mt-12 flex flex-col gap-2 border-t border-border pt-6 font-mono text-[10px] uppercase tracking-widest text-muted-foreground sm:flex-row sm:justify-between">
          <span>Station: Console_01</span>
          <span>
            Vertical: {RULEBOOK.vertical.replace(/_/g, " ")} · Threshold:{" "}
            {RULEBOOK.confidenceThreshold.toFixed(2)}
          </span>
          <span>
            Processed: {processedQueue.length} · Escalated: {escalatedCount} ·
            Auto-routed: {autoRoutedCount}
          </span>
        </footer>
      </div>
    </div>
  );
}

// ---------- Small UI bits ----------

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={
        active
          ? "inline-flex items-center border-b-2 border-foreground pb-1 text-foreground"
          : "inline-flex items-center border-b-2 border-transparent pb-1 text-muted-foreground transition-colors hover:text-foreground"
      }
    >
      {children}
    </button>
  );
}

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
          <span className="font-serif text-lg text-muted-foreground/60">
            0.0%
          </span>
        </div>
        <div className="h-1 w-28 bg-muted" />
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
    badge: "bg-purple-50 border-purple-300 text-purple-800",
    dot: "bg-purple-600",
  },
  escalated_guardrail: {
    badge: "bg-purple-50 border-purple-300 text-purple-800",
    dot: "bg-purple-600",
  },
  escalated_privacy_incident: {
    badge: "bg-purple-50 border-purple-300 text-purple-800",
    dot: "bg-purple-600",
  },
};

// ---------- Decision Card ----------

function DecisionCard({
  decision,
  ruling,
  onFinalize,
}: {
  decision: Decision;
  ruling: RuleResult;
  onFinalize: (final: FinalDecision, wasOverridden: boolean) => void;
}) {
  // Editable draft state for Override.
  const [editing, setEditing] = useState(false);
  const [draftCategory, setDraftCategory] = useState<Category>(decision.category);
  const [draftPriority, setDraftPriority] = useState<Priority>(ruling.priority);
  const [draftRoute, setDraftRoute] = useState<string>(ruling.finalRoute);

  const pri = PRIORITY_STYLES[ruling.priority];
  const pct = Math.round(decision.confidence * 100);
  const belowThreshold = decision.confidence < RULEBOOK.confidenceThreshold;
  const statusStyle = STATUS_STYLES[ruling.status];
  const routeOverridden = ruling.finalRoute !== decision.route;

  const acceptAsIs = () => {
    onFinalize(
      {
        category: decision.category,
        priority: ruling.priority,
        route: ruling.finalRoute,
        status: ruling.status,
        flags: ruling.flags,
      },
      false,
    );
  };

  const saveOverride = () => {
    const changed =
      draftCategory !== decision.category ||
      draftPriority !== ruling.priority ||
      draftRoute !== ruling.finalRoute;
    onFinalize(
      {
        category: draftCategory,
        priority: draftPriority,
        route: draftRoute,
        status: ruling.status,
        flags: ruling.flags,
      },
      changed,
    );
    setEditing(false);
  };

  return (
    <div className="space-y-5">
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
        <div className="border-l-4 border-purple-600 bg-purple-50/60 p-4">
          <div className="mb-2 font-mono text-[10px] font-bold uppercase tracking-widest text-purple-800">
            Guardrail Flags
          </div>
          <ul className="space-y-1.5">
            {ruling.flags.map((f) => (
              <li
                key={f}
                className="font-serif text-sm leading-snug text-purple-900"
              >
                — {f}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

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
            Below threshold ({RULEBOOK.confidenceThreshold.toFixed(2)}) — flag for review.
          </p>
        ) : null}
      </div>

      {/* Review controls */}
      <div className="mt-6 border-t border-border pt-6">
        {!editing ? (
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
              className="bg-primary py-2.5 px-6 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-primary-foreground transition-colors hover:bg-foreground/90"
            >
              Accept &amp; Send to Queue
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="font-mono text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              Override Draft
            </div>

            <OverrideField label="Category">
              <select
                value={draftCategory}
                onChange={(e) => setDraftCategory(e.target.value as Category)}
                className="w-full border border-border bg-background px-3 py-2 font-serif text-sm text-foreground focus:border-foreground focus:outline-none"
              >
                {RULEBOOK.categories.map((c) => (
                  <option key={c} value={c}>
                    {CATEGORY_LABELS[c]}
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
                {RULEBOOK.priorities.map((p) => (
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

            <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:items-center sm:justify-end">
              <button
                type="button"
                onClick={() => {
                  setEditing(false);
                  setDraftCategory(decision.category);
                  setDraftPriority(ruling.priority);
                  setDraftRoute(ruling.finalRoute);
                }}
                className="border border-border bg-background py-2.5 px-4 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground transition-colors hover:text-foreground"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveOverride}
                className="bg-primary py-2.5 px-6 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-primary-foreground transition-colors hover:bg-foreground/90"
              >
                Save Override
              </button>
            </div>
          </div>
        )}
      </div>
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
  escalatedCount,
  autoRoutedCount,
  onStartNew,
  onReview,
  reviewingId,
}: {
  items: QueueItem[];
  escalatedCount: number;
  autoRoutedCount: number;
  onStartNew: () => void;
  onReview: (item: QueueItem) => void;
  reviewingId: string | null;
}) {
  if (items.length === 0) {
    return (
      <div className="border border-border bg-card p-12 text-center">
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
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Counters */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Processed" value={items.length} />
        <Stat label="Auto-routed" value={autoRoutedCount} tone="green" />
        <Stat label="Escalated" value={escalatedCount} tone="purple" />
        <Stat
          label="Overridden"
          value={items.filter((i) => i.overridden).length}
        />
      </div>

      <div className="overflow-x-auto border border-border bg-card">
        <table className="w-full min-w-[720px] border-collapse text-left">
          <thead>
            <tr className="border-b border-border">
              <Th>Time</Th>
              <Th>Request</Th>
              <Th>Category</Th>
              <Th>Priority</Th>
              <Th>Route</Th>
              <Th>Status</Th>
              <Th>Override</Th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const pri = PRIORITY_STYLES[item.finalDecision.priority];
              const status = STATUS_STYLES[item.finalDecision.status];
              return (
                <tr
                  key={item.id}
                  className="border-b border-border/60 align-top last:border-b-0"
                >
                  <Td>
                    <span className="font-mono text-[11px] text-muted-foreground">
                      {formatTime(item.timestamp)}
                    </span>
                  </Td>
                  <Td>
                    <span className="line-clamp-2 font-serif text-sm text-foreground">
                      {shorten(item.requestText, 90)}
                    </span>
                  </Td>
                  <Td>
                    <span className="font-serif text-sm text-foreground">
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
                    <span className="font-serif text-sm text-foreground">
                      {item.finalDecision.route}
                    </span>
                  </Td>
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
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "green" | "purple";
}) {
  const toneClass =
    tone === "green"
      ? "text-green-700"
      : tone === "purple"
        ? "text-purple-700"
        : "text-foreground";
  return (
    <div className="border border-border bg-card p-4">
      <div className="font-mono text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
        {label}
      </div>
      <div className={`mt-1 font-serif text-2xl ${toneClass}`}>{value}</div>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-3 py-3 font-mono text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
      {children}
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
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}
