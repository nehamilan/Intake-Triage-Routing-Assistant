import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { RULEBOOK } from "@/lib/rulebook";

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
    ],
  }),
  component: Index,
});

function Index() {
  const [requestText, setRequestText] = useState("");
  const [activeTab, setActiveTab] = useState<"triage" | "queue">("triage");

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-border bg-card/80 backdrop-blur">
        <div className="mx-auto max-w-6xl px-4 py-4 sm:px-6 sm:py-5">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-4 sm:flex sm:items-center sm:justify-between">
            <div className="min-w-0">
              <h1 className="truncate text-lg font-bold tracking-tight text-foreground sm:text-xl">
                Intake Triage &amp; Routing Assistant
              </h1>
              <p className="mt-0.5 text-xs font-medium uppercase tracking-wider text-muted-foreground sm:text-[13px]">
                Decision support — a human reviews every decision.
              </p>
            </div>
            <nav
              aria-label="Sections"
              className="flex shrink-0 items-center gap-1 rounded-lg border border-border bg-muted p-1 text-xs font-semibold uppercase tracking-wider"
            >
              <button
                type="button"
                onClick={() => setActiveTab("triage")}
                aria-pressed={activeTab === "triage"}
                className={
                  activeTab === "triage"
                    ? "rounded-md bg-card px-3 py-1.5 text-foreground shadow-sm"
                    : "rounded-md px-3 py-1.5 text-muted-foreground transition-colors hover:text-foreground"
                }
              >
                Triage
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("queue")}
                aria-pressed={activeTab === "queue"}
                className={
                  activeTab === "queue"
                    ? "rounded-md bg-card px-3 py-1.5 text-foreground shadow-sm"
                    : "rounded-md px-3 py-1.5 text-muted-foreground transition-colors hover:text-foreground"
                }
              >
                Queue
              </button>
            </nav>
          </div>
        </div>
      </header>

      {/* Body */}
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        {activeTab === "triage" ? (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Left panel — input */}
            <section
              aria-labelledby="request-label"
              className="rounded-xl border border-border bg-card p-5 shadow-sm sm:p-6"
            >
              <div className="mb-3 flex items-center justify-between">
                <label
                  id="request-label"
                  htmlFor="request-textarea"
                  className="text-xs font-semibold uppercase tracking-wider text-foreground/80"
                >
                  Paste an incoming request
                </label>
                <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  {RULEBOOK.vertical.replace(/_/g, " ")}
                </span>
              </div>

              <textarea
                id="request-textarea"
                value={requestText}
                onChange={(e) => setRequestText(e.target.value)}
                rows={12}
                placeholder="Paste the researcher's request here — e.g. an email about accessing a restricted dataset, a deposit question, a licensing query, or a broken download link."
                className="w-full resize-none rounded-lg border border-input bg-muted/50 p-3 text-sm text-foreground shadow-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-ring focus:bg-card focus:ring-2 focus:ring-ring/40"
              />

              <div className="mt-4 flex items-center justify-between gap-3">
                <p className="text-xs text-muted-foreground">
                  {requestText.trim().length > 0
                    ? `${requestText.trim().length} characters`
                    : "Awaiting input"}
                </p>
                <button
                  type="button"
                  disabled={requestText.trim().length === 0}
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <svg
                    aria-hidden="true"
                    className="h-4 w-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M13 10V3L4 14h7v7l9-11h-7z"
                    />
                  </svg>
                  Triage
                </button>
              </div>
            </section>

            {/* Right panel — empty state (ghosted preview of the coming Decision Card) */}
            <section
              aria-labelledby="decision-label"
              className="rounded-xl border border-border bg-card p-5 shadow-sm sm:p-6"
            >
              <div className="mb-3 flex items-center justify-between">
                <h2
                  id="decision-label"
                  className="text-xs font-semibold uppercase tracking-wider text-foreground/80"
                >
                  AI-Proposed Decision
                </h2>
                <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  Awaiting request
                </span>
              </div>

              <div className="flex min-h-[22rem] flex-col items-center justify-center rounded-lg border-2 border-dashed border-border bg-muted/30 p-6 text-center">
                <div className="mb-4 grid h-11 w-11 place-items-center rounded-full bg-muted">
                  <svg
                    aria-hidden="true"
                    className="h-5 w-5 text-muted-foreground"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
                    />
                  </svg>
                </div>
                <p className="text-sm font-medium text-foreground/70">
                  No request triaged yet.
                </p>
                <p className="mt-1 max-w-xs text-xs text-muted-foreground">
                  Paste an incoming request and click Triage. The system will
                  propose a category, priority, route, reason, and confidence
                  score for you to review.
                </p>

                {/* Ghosted preview of the coming Decision Card structure */}
                <div className="mt-6 w-full max-w-sm space-y-2.5 text-left opacity-40">
                  <GhostRow label="Category" />
                  <GhostRow label="Priority" widthClass="w-16" />
                  <GhostRow label="Route" widthClass="w-28" />
                  <GhostRow label="Reason" widthClass="w-full" tall />
                  <GhostRow label="Confidence" widthClass="w-full" bar />
                </div>
              </div>
            </section>
          </div>
        ) : (
          <div className="rounded-xl border border-border bg-card p-10 text-center shadow-sm">
            <p className="text-sm font-medium text-foreground/70">
              Queue is empty.
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Triaged and reviewed requests will appear here.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}

interface GhostRowProps {
  label: string;
  widthClass?: string;
  tall?: boolean;
  bar?: boolean;
}

function GhostRow({ label, widthClass = "w-40", tall, bar }: GhostRowProps) {
  return (
    <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] items-center gap-3">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      {bar ? (
        <div className="h-2 w-full rounded-full bg-muted">
          <div className="h-full w-2/3 rounded-full bg-foreground/20" />
        </div>
      ) : (
        <div
          className={`${tall ? "h-8" : "h-3"} ${widthClass} rounded bg-muted`}
        />
      )}
    </div>
  );
}
