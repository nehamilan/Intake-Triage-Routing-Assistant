import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { RULEBOOK, CATEGORY_LABELS, type Priority } from "@/lib/rulebook";
import { mockClassify, type Decision } from "@/lib/mock-classify";

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

function Index() {
  const [requestText, setRequestText] = useState("");
  const [activeTab, setActiveTab] = useState<"triage" | "queue">("triage");
  const [decision, setDecision] = useState<Decision | null>(null);

  const handleTriage = () => {
    if (requestText.trim().length === 0) return;
    setDecision(mockClassify(requestText));
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-6 py-8 sm:px-8 sm:py-10">
        {/* Header */}
        <header className="mb-8 border-b border-foreground pb-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-baseline sm:justify-between">
            <h1 className="font-serif text-2xl font-medium leading-tight text-foreground sm:text-3xl">
              Intake Triage &amp; Routing Assistant
            </h1>
            <nav
              aria-label="Sections"
              className="flex gap-6 text-xs font-semibold uppercase tracking-widest"
            >
              <button
                type="button"
                onClick={() => setActiveTab("triage")}
                aria-pressed={activeTab === "triage"}
                className={
                  activeTab === "triage"
                    ? "border-b-2 border-foreground pb-1 text-foreground"
                    : "border-b-2 border-transparent pb-1 text-muted-foreground transition-colors hover:text-foreground"
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
                    ? "border-b-2 border-foreground pb-1 text-foreground"
                    : "border-b-2 border-transparent pb-1 text-muted-foreground transition-colors hover:text-foreground"
                }
              >
                Queue
              </button>
            </nav>
          </div>
          <p className="mt-2 font-serif text-sm italic text-muted-foreground sm:text-base">
            Decision support — a human reviews every decision.
          </p>
        </header>

        {/* Body */}
        <main className="flex-1">
          {activeTab === "triage" ? (
            <div className="grid grid-cols-1 items-start gap-10 lg:grid-cols-2 lg:gap-12">
              {/* Left panel — input */}
              <section aria-labelledby="request-label" className="space-y-6">
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
                  disabled={requestText.trim().length === 0}
                  className="w-full bg-primary py-3 font-mono text-xs font-bold uppercase tracking-[0.2em] text-primary-foreground shadow-sm transition-colors hover:bg-foreground/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Triage Request
                </button>
              </section>

              {/* Right panel — empty state / decision preview */}
              <section
                aria-labelledby="decision-label"
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
                    No request triaged yet.
                  </p>
                </div>

                <div className="space-y-5">
                  <DecisionRow label="Category" />
                  <DecisionRow label="Priority" />
                  <DecisionRow label="Route" />
                  <DecisionRow label="Reasoning" value="Waiting for input data…" italic multiline />

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
              </section>
            </div>
          ) : (
            <div className="border border-border bg-card p-12 text-center">
              <p className="font-serif text-base italic text-muted-foreground">
                Queue is empty.
              </p>
              <p className="mt-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                Triaged and reviewed requests will appear here.
              </p>
            </div>
          )}
        </main>

        {/* Footer / console strip */}
        <footer className="mt-12 flex flex-col gap-2 border-t border-border pt-6 font-mono text-[10px] uppercase tracking-widest text-muted-foreground sm:flex-row sm:justify-between">
          <span>Station: Console_01</span>
          <span>
            Vertical: {RULEBOOK.vertical.replace(/_/g, " ")} · Threshold:{" "}
            {RULEBOOK.confidenceThreshold.toFixed(2)}
          </span>
          <span>Status: Ready for Intake</span>
        </footer>
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
