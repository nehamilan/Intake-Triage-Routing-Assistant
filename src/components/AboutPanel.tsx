import { useState } from "react";
import { ChevronDown } from "lucide-react";

// ---------- About / how it works ----------
// Shared across Triage, Queue, Dashboard and Evaluation. Default: expanded.
export function AboutPanel() {
  const [open, setOpen] = useState(true);
  return (
    <section
      aria-label="About this system"
      className="mt-10 border border-dashed border-border bg-card/40"
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full cursor-pointer items-center gap-2 px-4 py-3 text-left font-mono text-[10px] font-bold uppercase tracking-widest text-foreground transition-colors hover:bg-foreground/5"
      >
        <ChevronDown
          aria-hidden="true"
          className={`h-3.5 w-3.5 shrink-0 transition-transform ${open ? "" : "-rotate-90"}`}
        />
        <span>About · how it works</span>
      </button>
      {open ? (
        <div className="space-y-3 border-t border-dashed border-border px-4 py-4 font-serif text-sm leading-relaxed text-foreground">
          <p>
            Every intake flows through a{" "}
            <span className="font-semibold">
              deterministic guardrails → LLM classifier → deterministic
              guardrails
            </span>{" "}
            sandwich. The riskiest signals (privacy incidents, restricted-data
            access, fraud) are caught by pure code — not by the model — so
            safety-critical routing never depends on a prompt.
          </p>
          <p>
            The LLM proposes a category, priority, route, one-sentence reason
            and a confidence score. If confidence falls below the rulebook
            threshold, or if any guardrail fires, the request is routed to the
            Human Review Queue rather than auto-actioned.
          </p>
          <p>
            A human reviewer accepts or overrides every decision. Overrides
            append a new revision to the audit log — the previous version is
            preserved, never mutated — with reviewer, timestamp, diff and
            reason.
          </p>
          <p className="border-l-4 border-foreground bg-foreground/5 px-4 py-3 font-serif text-sm leading-relaxed text-foreground">
            <span className="font-semibold">Rulebook is data, not code.</span>{" "}
            Swap the vertical in the header to reconfigure categories, routes
            and guardrails at runtime.
          </p>
        </div>
      ) : null}
    </section>
  );
}

