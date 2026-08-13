import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useRulebook } from "@/hooks/use-rulebook";
import { AppHeader } from "@/components/AppHeader";
import { AboutPanel } from "@/components/AboutPanel";
import { CATEGORY_LABELS, type Category } from "@/lib/rulebook";


export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "Triage Dashboard — Evidence Layer" },
      {
        name: "description",
        content:
          "Metrics for intake triage: volume, routing distribution, escalations over time, and confidence.",
      },
    ],
  }),
  component: DashboardPage,
});

interface RequestRow {
  id: string;
  created_at: string;
  ai_category: string;
  ai_confidence: number | string;
  final_category: string;
  final_route: string;
  status: string;
  was_overridden: boolean;
  vertical: string | null;
}

const ROUTES = [
  "Curation",
  "Infrastructure",
  "Compliance",
  "General Support",
  "Human Review Queue",
] as const;

const ROUTE_COLORS: Record<string, string> = {
  Curation: "#4f46e5",
  Infrastructure: "#0ea5e9",
  Compliance: "#dc2626",
  "General Support": "#64748b",
  "Human Review Queue": "#f59e0b",
};

const ESCALATION_REASONS: Array<{ key: string; label: string; statuses: string[] }> = [
  {
    key: "low_confidence",
    label: "low_confidence",
    statuses: ["escalated_low_confidence"],
  },
  {
    key: "guardrail",
    label: "guardrail",
    statuses: [
      "escalated_guardrail",
      "escalated_attachment_mismatch",
      "escalated_missing_embargo_date",
    ],
  },
  {
    key: "privacy_incident",
    label: "privacy_incident",
    statuses: ["escalated_privacy_incident"],
  },
  {
    key: "parse_failure",
    label: "parse_failure",
    statuses: ["escalated_parse_failure"],
  },
];

function DashboardPage() {
  const { user, loading: authLoading } = useAuth();
  const { rulebook, verticalId } = useRulebook();
  const navigate = useNavigate();
  const [allRows, setAllRows] = useState<RequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Scope every metric to the active vertical — switching the rulebook in
  // the header also switches the dashboard's evidence layer.
  const rows = useMemo(
    () => allRows.filter((r) => (r.vertical ?? "research") === verticalId),
    [allRows, verticalId],
  );

  useEffect(() => {
    if (!authLoading && !user) navigate({ to: "/auth" });
  }, [authLoading, user, navigate]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("requests")
        .select(
          "id, created_at, ai_category, ai_confidence, final_category, final_route, status, was_overridden, vertical",
        )
        .order("created_at", { ascending: true });
      if (cancelled) return;
      if (error) setError(error.message);
      else setAllRows((data ?? []) as RequestRow[]);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const kpis = useMemo(() => {
    const total = rows.length;
    const escalated = rows.filter((r) => r.status !== "auto_routed").length;
    const overridden = rows.filter((r) => r.was_overridden).length;
    const avgConfidence =
      total === 0
        ? 0
        : rows.reduce((s, r) => s + Number(r.ai_confidence || 0), 0) / total;
    return {
      total,
      escalatedPct: total ? (escalated / total) * 100 : 0,
      overriddenPct: total ? (overridden / total) * 100 : 0,
      avgConfidence,
    };
  }, [rows]);

  const categoryData = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of rows) {
      counts.set(r.final_category, (counts.get(r.final_category) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([cat, count]) => ({
        category: CATEGORY_LABELS[cat as Category] ?? cat,
        count,
      }))
      .sort((a, b) => b.count - a.count);
  }, [rows]);

  const routeData = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of rows) {
      counts.set(r.final_route, (counts.get(r.final_route) ?? 0) + 1);
    }
    return ROUTES.filter((r) => counts.has(r)).map((r) => ({
      name: r,
      value: counts.get(r) ?? 0,
    }));
  }, [rows]);

  const dailyData = useMemo(() => {
    const byDay = new Map<string, { day: string; auto_routed: number; escalated: number }>();
    for (const r of rows) {
      const day = new Date(r.created_at).toISOString().slice(0, 10);
      const entry = byDay.get(day) ?? { day, auto_routed: 0, escalated: 0 };
      if (r.status === "auto_routed") entry.auto_routed += 1;
      else entry.escalated += 1;
      byDay.set(day, entry);
    }
    return Array.from(byDay.values()).sort((a, b) => a.day.localeCompare(b.day));
  }, [rows]);

  const escalationReasons = useMemo(() => {
    return ESCALATION_REASONS.map((reason) => ({
      ...reason,
      count: rows.filter((r) => reason.statuses.includes(r.status)).length,
    }));
  }, [rows]);

  if (authLoading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
          Loading…
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-4 py-6 sm:px-8 sm:py-10">
        <AppHeader
          active="dashboard"
          title="Triage Dashboard"
          subtitle={`Evidence layer — every metric is derived from persisted decisions. Showing: ${rulebook.label}.`}
        />

        {error ? (
          <div className="mb-6 border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
            Couldn't load metrics: {error}
          </div>
        ) : null}

        {/* KPI cards */}
        <section
          aria-label="Key performance indicators"
          className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4"
        >
          <KpiCard
            label="Total requests"
            value={loading ? "—" : kpis.total.toLocaleString()}
            hint="All-time"
          />
          <KpiCard
            label="% Escalated"
            value={loading ? "—" : `${kpis.escalatedPct.toFixed(1)}%`}
            hint="Not auto-routed"
          />
          <KpiCard
            label="% Overridden"
            value={loading ? "—" : `${kpis.overriddenPct.toFixed(1)}%`}
            hint="Human-changed"
          />
          <KpiCard
            label="Avg. confidence"
            value={loading ? "—" : kpis.avgConfidence.toFixed(2)}
            hint="Model self-report"
          />
        </section>

        <main className="flex-1 space-y-8">
          <ChartCard
            title="Request volume by category"
            description="Final category assigned to each request."
          >
            {categoryData.length === 0 ? (
              <EmptyState loading={loading} />
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart
                  data={categoryData}
                  margin={{ top: 8, right: 8, left: 0, bottom: 8 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis
                    dataKey="category"
                    tick={{ fontSize: 10 }}
                    interval={0}
                    angle={-20}
                    textAnchor="end"
                    height={70}
                  />
                  <YAxis allowDecimals={false} tick={{ fontSize: 10 }} width={30} />
                  <Tooltip />
                  <Bar dataKey="count" fill="#4f46e5" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </ChartCard>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <ChartCard
              title="Routing distribution"
              description="Where finalized requests were sent."
            >
              {routeData.length === 0 ? (
                <EmptyState loading={loading} />
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie
                      data={routeData}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={50}
                      outerRadius={90}
                      paddingAngle={2}
                    >
                      {routeData.map((entry) => (
                        <Cell
                          key={entry.name}
                          fill={ROUTE_COLORS[entry.name] ?? "#94a3b8"}
                        />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend
                      verticalAlign="bottom"
                      wrapperStyle={{ fontSize: 10 }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </ChartCard>

            <ChartCard
              title="Escalation reasons"
              description="Breakdown by escalation status."
            >
              <table className="w-full font-mono text-xs">
                <thead>
                  <tr className="border-b border-border text-left uppercase tracking-widest text-muted-foreground">
                    <th className="py-2 text-[10px] font-bold">Reason</th>
                    <th className="py-2 text-right text-[10px] font-bold">Count</th>
                  </tr>
                </thead>
                <tbody>
                  {escalationReasons.map((r) => (
                    <tr key={r.key} className="border-b border-border/60">
                      <td className="py-2">{r.label}</td>
                      <td className="py-2 text-right font-bold">{r.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ChartCard>
          </div>

          <ChartCard
            title="Auto-routed vs escalated over time"
            description="Daily volume, stacked by outcome."
          >
            {dailyData.length === 0 ? (
              <EmptyState loading={loading} />
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart
                  data={dailyData}
                  margin={{ top: 8, right: 8, left: 0, bottom: 8 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="day" tick={{ fontSize: 10 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 10 }} width={30} />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar
                    dataKey="auto_routed"
                    stackId="a"
                    fill="#10b981"
                    name="Auto-routed"
                  />
                  <Bar
                    dataKey="escalated"
                    stackId="a"
                    fill="#f59e0b"
                    name="Escalated"
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </ChartCard>
        </main>
        <AboutPanel />
      </div>
    </div>
  );
}

function KpiCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="border border-border p-3 sm:p-4">
      <div className="font-mono text-[9px] font-bold uppercase tracking-widest text-muted-foreground sm:text-[10px]">
        {label}
      </div>
      <div className="mt-1 font-serif text-2xl leading-tight sm:text-3xl">{value}</div>
      {hint ? (
        <div className="mt-1 font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
          {hint}
        </div>
      ) : null}
    </div>
  );
}

function ChartCard({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border border-border p-4 sm:p-5">
      <header className="mb-3">
        <h2 className="font-serif text-lg font-medium text-foreground sm:text-xl">
          {title}
        </h2>
        {description ? (
          <p className="mt-1 font-serif text-xs italic text-muted-foreground sm:text-sm">
            {description}
          </p>
        ) : null}
      </header>
      {children}
    </section>
  );
}

function EmptyState({ loading }: { loading: boolean }) {
  return (
    <div className="flex h-40 items-center justify-center font-mono text-xs uppercase tracking-widest text-muted-foreground">
      {loading ? "Loading…" : "No data yet"}
    </div>
  );
}
