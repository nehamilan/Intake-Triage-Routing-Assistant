import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { useRulebook } from "@/hooks/use-rulebook";
import { AppHeader } from "@/components/AppHeader";
import { loadQueue } from "@/lib/queue-db";
import type { QueueItem } from "@/lib/queue-types";
import { STATUS_LABELS } from "@/lib/apply-rules";
import { CATEGORY_LABELS } from "@/lib/rulebook";


/**
 * AuthGate: redirects unauthenticated visitors to /auth and blocks render
 * until the session + role have hydrated. Header chrome now lives in the
 * shared <AppHeader />, which each surface renders itself.
 */
export function AuthGate({
  agentView,
  viewerView,
}: {
  agentView: () => ReactNode;
  viewerView: () => ReactNode;
}) {
  const { user, role, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
  }, [loading, user, navigate]);

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
          Loading…
        </div>
      </div>
    );
  }

  if (role === "agent") return <>{agentView()}</>;
  return <>{viewerView()}</>;
}

/**
 * Read-only dashboard for "viewer" role users. Shows queue summary + a
 * flat list of finalized decisions. No inputs, no mutation controls.
 * Queue writes are also blocked server-side by RLS.
 */
export function ViewerDashboard() {
  const { rulebook, verticalId } = useRulebook();
  const [items, setItems] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadQueue()
      .then((qs) => {
        if (!cancelled) setItems(qs);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Scope the read-only view to the active vertical, matching the agent queue —
  // otherwise research and banking rows are indistinguishable in this list.
  const current = useMemo(
    () => items.filter((i) => !i.supersededById && i.vertical === verticalId),
    [items, verticalId],
  );
  const escalated = current.filter((i) => i.finalDecision.status !== "auto_routed").length;
  const autoRouted = current.length - escalated;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-6 py-8 sm:px-8 sm:py-10">
        <AppHeader
          active="triage"
          title="Intake Triage — Dashboard"
          subtitle={`Read-only view of ${rulebook.label}. Ask an agent for edit access.`}
        />


        <main className="flex-1 space-y-8">
          <section className="grid grid-cols-3 gap-4">
            <Stat label="Total" value={current.length} />
            <Stat label="Auto-routed" value={autoRouted} />
            <Stat label="Escalated" value={escalated} />
          </section>

          <section>
            <h2 className="mb-3 font-mono text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              Recent decisions
            </h2>
            {loading ? (
              <p className="font-mono text-xs text-muted-foreground">Loading…</p>
            ) : error ? (
              <p className="border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-800">
                Couldn't load queue: {error}
              </p>
            ) : current.length === 0 ? (
              <p className="font-serif text-sm italic text-muted-foreground">
                No decisions yet for {rulebook.label}. Switch the vertical in the
                header to see other intake streams.
              </p>
            ) : (
              <ul className="divide-y divide-border border border-border">
                {current.slice(0, 50).map((item) => (
                  <li key={item.id} className="px-4 py-3">
                    <div className="flex items-baseline justify-between gap-4">
                      <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                        {STATUS_LABELS[item.finalDecision.status]} ·{" "}
                        {CATEGORY_LABELS[item.finalDecision.category]} ·{" "}
                        {item.finalDecision.priority}
                      </div>
                      <div className="font-mono text-[10px] text-muted-foreground">
                        v{item.revision}
                      </div>
                    </div>
                    <p className="mt-1 line-clamp-2 font-serif text-sm text-foreground">
                      {item.requestText}
                    </p>
                    <div className="mt-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                      → {item.finalDecision.route}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </main>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="border border-border p-4">
      <div className="font-mono text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 font-serif text-3xl">{value}</div>
    </div>
  );
}
