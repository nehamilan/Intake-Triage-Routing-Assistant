import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { classifyRequest } from "@/lib/classify-request.functions";
import { applyRules } from "@/lib/apply-rules";
import { RULEBOOK, CATEGORY_LABELS, type Category } from "@/lib/rulebook";

export const Route = createFileRoute("/evaluation")({
  head: () => ({
    meta: [
      { title: "Evaluation — Accuracy against labeled test set" },
      {
        name: "description",
        content:
          "Upload a labeled CSV and measure routing, priority, category accuracy and escalation recall.",
      },
    ],
  }),
  component: EvaluationPage,
});

// ---------------------------------------------------------------------------
// CSV parsing (RFC-4180-ish: quoted fields, doubled quotes, comma separator).
// ---------------------------------------------------------------------------

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;
  const src = text.replace(/\r\n?/g, "\n");
  while (i < src.length) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQuotes = false; i++; continue;
      }
      field += c; i++; continue;
    }
    if (c === '"') { inQuotes = true; i++; continue; }
    if (c === ",") { row.push(field); field = ""; i++; continue; }
    if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; i++; continue; }
    field += c; i++;
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.length > 0 && !(r.length === 1 && r[0].trim() === ""));
}

function toCsvValue(v: string | number | boolean | null | undefined): string {
  const s = v == null ? "" : String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface LabeledRow {
  message: string;
  true_category: string;
  true_priority: string;
  true_route: string;
  should_escalate?: boolean;
}

interface EvalResult extends LabeledRow {
  pred_category: string;
  pred_priority: string;
  pred_route: string;
  pred_status: string;
  pred_confidence: number;
  category_correct: boolean;
  priority_correct: boolean;
  route_correct: boolean;
  did_escalate: boolean;
  escalation_correct: boolean | null; // null if no ground truth for escalation
  error?: string;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

function EvaluationPage() {
  const { user, role, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
  }, [loading, user, navigate]);

  const classify = useServerFn(classifyRequest);

  const [rows, setRows] = useState<LabeledRow[] | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const [parseError, setParseError] = useState<string | null>(null);
  const [results, setResults] = useState<EvalResult[] | null>(null);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number }>({ done: 0, total: 0 });
  const [runError, setRunError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Loading…</div>
      </div>
    );
  }
  if (!user) return null;

  const isAgent = role === "agent";

  function handleFile(f: File) {
    setParseError(null);
    setResults(null);
    setFileName(f.name);
    f.text().then((text) => {
      try {
        const parsed = parseCsv(text);
        if (parsed.length < 2) throw new Error("CSV needs a header row and at least one data row.");
        const header = parsed[0].map((h) => h.trim().toLowerCase());
        const need = ["message", "true_category", "true_priority", "true_route"];
        for (const n of need) {
          if (!header.includes(n)) throw new Error(`Missing required column: ${n}`);
        }
        const idx = (name: string) => header.indexOf(name);
        const escIdx = header.indexOf("should_escalate");
        const out: LabeledRow[] = [];
        for (let r = 1; r < parsed.length; r++) {
          const cols = parsed[r];
          const message = (cols[idx("message")] ?? "").trim();
          if (!message) continue;
          const rawEsc = escIdx >= 0 ? (cols[escIdx] ?? "").trim().toLowerCase() : "";
          out.push({
            message,
            true_category: (cols[idx("true_category")] ?? "").trim(),
            true_priority: (cols[idx("true_priority")] ?? "").trim(),
            true_route: (cols[idx("true_route")] ?? "").trim(),
            should_escalate: escIdx >= 0
              ? rawEsc === "true" || rawEsc === "1" || rawEsc === "yes"
              : undefined,
          });
        }
        if (out.length === 0) throw new Error("No data rows found.");
        setRows(out);
      } catch (err) {
        setRows(null);
        setParseError(err instanceof Error ? err.message : String(err));
      }
    });
  }

  async function runEvaluation() {
    if (!rows) return;
    setRunning(true);
    setRunError(null);
    setResults(null);
    setProgress({ done: 0, total: rows.length });
    const out: EvalResult[] = [];
    try {
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        try {
          const decision = await classify({
            data: { requestText: row.message, attachments: [] },
          });
          const rule = applyRules(decision, row.message, []);
          const didEscalate = rule.status !== "auto_routed";
          const escCorrect =
            row.should_escalate === undefined ? null : row.should_escalate === didEscalate;
          out.push({
            ...row,
            pred_category: decision.category,
            pred_priority: rule.priority,
            pred_route: rule.finalRoute,
            pred_status: rule.status,
            pred_confidence: decision.confidence,
            category_correct: decision.category === row.true_category,
            priority_correct: rule.priority === row.true_priority,
            route_correct: rule.finalRoute === row.true_route,
            did_escalate: didEscalate,
            escalation_correct: escCorrect,
          });
        } catch (err) {
          out.push({
            ...row,
            pred_category: "",
            pred_priority: "",
            pred_route: "",
            pred_status: "",
            pred_confidence: 0,
            category_correct: false,
            priority_correct: false,
            route_correct: false,
            did_escalate: false,
            escalation_correct: row.should_escalate === undefined ? null : false,
            error: err instanceof Error ? err.message : String(err),
          });
        }
        setProgress({ done: i + 1, total: rows.length });
        setResults([...out]);
      }
    } catch (err) {
      setRunError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
    }
  }

  const metrics = useMemo(() => computeMetrics(results ?? []), [results]);

  function downloadCsv() {
    if (!results) return;
    const header = [
      "message", "true_category", "true_priority", "true_route", "should_escalate",
      "pred_category", "pred_priority", "pred_route", "pred_status", "pred_confidence",
      "category_correct", "priority_correct", "route_correct", "did_escalate", "escalation_correct",
      "error",
    ];
    const lines = [header.join(",")];
    for (const r of results) {
      lines.push([
        r.message, r.true_category, r.true_priority, r.true_route,
        r.should_escalate === undefined ? "" : r.should_escalate,
        r.pred_category, r.pred_priority, r.pred_route, r.pred_status,
        r.pred_confidence.toFixed(3),
        r.category_correct, r.priority_correct, r.route_correct, r.did_escalate,
        r.escalation_correct === null ? "" : r.escalation_correct,
        r.error ?? "",
      ].map(toCsvValue).join(","));
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `evaluation-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-6 py-8 sm:px-8 sm:py-10">
        <header className="mb-8 border-b border-foreground pb-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h1 className="font-serif text-2xl font-medium leading-tight sm:text-3xl">
                Evaluation — Accuracy vs. Labeled Test Set
              </h1>
              <p className="mt-2 font-serif text-sm italic text-muted-foreground sm:text-base">
                Upload a labeled CSV. Every row runs through the full pipeline: pre-checks, classifier,
                and rulebook. The numbers below are the evidence that the product works.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Link
                to="/"
                className="border border-border bg-background px-3 py-1 font-mono text-[10px] font-bold uppercase tracking-widest text-foreground hover:bg-foreground/5"
              >
                Home
              </Link>
              <Link
                to="/dashboard"
                className="border border-border bg-background px-3 py-1 font-mono text-[10px] font-bold uppercase tracking-widest text-foreground hover:bg-foreground/5"
              >
                Dashboard
              </Link>
            </div>
          </div>
        </header>

        {!isAgent ? (
          <div className="border border-amber-300 bg-amber-50 px-4 py-6 font-serif text-sm text-amber-900">
            Evaluation runs the classifier server-side, which requires the <b>agent</b> role.
            Your current role is <b>{role ?? "none"}</b>. Ask an admin to grant agent access.
          </div>
        ) : (
          <main className="flex-1 space-y-8">
            {/* Upload / controls */}
            <section className="border border-border p-4 sm:p-6">
              <h2 className="mb-2 font-mono text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                1. Upload labeled CSV
              </h2>
              <p className="mb-3 font-serif text-sm text-muted-foreground">
                Required columns: <code>message</code>, <code>true_category</code>,{" "}
                <code>true_priority</code>, <code>true_route</code>.{" "}
                Optional: <code>should_escalate</code> (true/false). If omitted, escalation recall is
                inferred from rows whose true_route equals "Human Review Queue".
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,text/csv"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleFile(f);
                  }}
                  className="font-mono text-xs"
                />
                {fileName && (
                  <span className="font-mono text-[11px] text-muted-foreground">{fileName}</span>
                )}
                <button
                  type="button"
                  disabled={!rows || running}
                  onClick={runEvaluation}
                  className="border border-foreground bg-foreground px-4 py-1.5 font-mono text-[11px] font-bold uppercase tracking-widest text-background hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {running ? `Running… ${progress.done}/${progress.total}` : "Run evaluation"}
                </button>
                {results && !running && (
                  <button
                    type="button"
                    onClick={downloadCsv}
                    className="border border-border bg-background px-4 py-1.5 font-mono text-[11px] font-bold uppercase tracking-widest hover:bg-foreground/5"
                  >
                    Download results CSV
                  </button>
                )}
              </div>
              {parseError && (
                <p className="mt-3 border border-red-300 bg-red-50 px-3 py-2 font-mono text-xs text-red-800">
                  {parseError}
                </p>
              )}
              {rows && !parseError && (
                <p className="mt-3 font-mono text-[11px] text-muted-foreground">
                  Parsed {rows.length} row{rows.length === 1 ? "" : "s"}.
                </p>
              )}
              {runError && (
                <p className="mt-3 border border-red-300 bg-red-50 px-3 py-2 font-mono text-xs text-red-800">
                  {runError}
                </p>
              )}
            </section>

            {/* Headline metrics */}
            {results && results.length > 0 && (
              <>
                <section>
                  <h2 className="mb-3 font-mono text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                    Headline accuracy
                  </h2>
                  <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                    <BigStat label="Routing" value={metrics.routeAcc} n={metrics.total} />
                    <BigStat label="Priority" value={metrics.priorityAcc} n={metrics.total} />
                    <BigStat label="Category" value={metrics.categoryAcc} n={metrics.total} />
                    <BigStat
                      label="Escalation recall"
                      value={metrics.escalationRecall}
                      n={metrics.escalationDenominator}
                      subtitle={
                        metrics.escalationDenominator === 0
                          ? "no positives in set"
                          : `${metrics.escalationTruePos}/${metrics.escalationDenominator} caught`
                      }
                    />
                  </div>
                </section>

                {/* Confusion matrix */}
                <section>
                  <h2 className="mb-3 font-mono text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                    Confusion matrix — true category (rows) vs. predicted (cols)
                  </h2>
                  <ConfusionMatrix matrix={metrics.confusion} categories={metrics.categories} />
                </section>

                {/* Per-row table */}
                <section>
                  <h2 className="mb-3 font-mono text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                    Per-row results ({results.length})
                  </h2>
                  <div className="overflow-x-auto border border-border">
                    <table className="w-full text-left font-mono text-[11px]">
                      <thead className="bg-foreground/5">
                        <tr>
                          <th className="px-2 py-1.5">#</th>
                          <th className="px-2 py-1.5">Message</th>
                          <th className="px-2 py-1.5">True cat</th>
                          <th className="px-2 py-1.5">Pred cat</th>
                          <th className="px-2 py-1.5">True prio</th>
                          <th className="px-2 py-1.5">Pred prio</th>
                          <th className="px-2 py-1.5">True route</th>
                          <th className="px-2 py-1.5">Pred route</th>
                          <th className="px-2 py-1.5">Conf</th>
                        </tr>
                      </thead>
                      <tbody>
                        {results.map((r, i) => (
                          <tr key={i} className="border-t border-border align-top">
                            <td className="px-2 py-1.5 text-muted-foreground">{i + 1}</td>
                            <td className="max-w-[24ch] truncate px-2 py-1.5" title={r.message}>
                              {r.message}
                            </td>
                            <td className="px-2 py-1.5">{r.true_category}</td>
                            <td className={`px-2 py-1.5 ${r.category_correct ? "text-emerald-700" : "text-red-700"}`}>
                              {r.pred_category || (r.error ? "—" : "")}
                            </td>
                            <td className="px-2 py-1.5">{r.true_priority}</td>
                            <td className={`px-2 py-1.5 ${r.priority_correct ? "text-emerald-700" : "text-red-700"}`}>
                              {r.pred_priority}
                            </td>
                            <td className="px-2 py-1.5">{r.true_route}</td>
                            <td className={`px-2 py-1.5 ${r.route_correct ? "text-emerald-700" : "text-red-700"}`}>
                              {r.pred_route}
                            </td>
                            <td className="px-2 py-1.5">{r.pred_confidence.toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              </>
            )}
          </main>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Metrics
// ---------------------------------------------------------------------------

interface Metrics {
  total: number;
  routeAcc: number;
  priorityAcc: number;
  categoryAcc: number;
  escalationRecall: number;
  escalationDenominator: number;
  escalationTruePos: number;
  confusion: number[][];
  categories: string[];
}

function computeMetrics(results: EvalResult[]): Metrics {
  const total = results.length;
  if (total === 0) {
    return {
      total: 0, routeAcc: 0, priorityAcc: 0, categoryAcc: 0,
      escalationRecall: 0, escalationDenominator: 0, escalationTruePos: 0,
      confusion: [], categories: [],
    };
  }
  const routeAcc = results.filter((r) => r.route_correct).length / total;
  const priorityAcc = results.filter((r) => r.priority_correct).length / total;
  const categoryAcc = results.filter((r) => r.category_correct).length / total;

  // Escalation: use should_escalate when provided, otherwise infer from
  // true_route === "Human Review Queue".
  const positives = results.filter((r) =>
    r.should_escalate !== undefined
      ? r.should_escalate === true
      : r.true_route === "Human Review Queue",
  );
  const truePos = positives.filter((r) => r.did_escalate).length;
  const escalationRecall = positives.length === 0 ? 0 : truePos / positives.length;

  // Confusion: use union of RULEBOOK + any labels seen (in case CSV has stray).
  const known = RULEBOOK.categories as readonly string[];
  const seen = new Set<string>(known);
  for (const r of results) {
    if (r.true_category) seen.add(r.true_category);
    if (r.pred_category) seen.add(r.pred_category);
  }
  const categories = Array.from(seen);
  const idx = new Map(categories.map((c, i) => [c, i]));
  const confusion: number[][] = categories.map(() => categories.map(() => 0));
  for (const r of results) {
    const ti = idx.get(r.true_category);
    const pi = idx.get(r.pred_category);
    if (ti !== undefined && pi !== undefined) confusion[ti][pi] += 1;
  }

  return {
    total,
    routeAcc, priorityAcc, categoryAcc,
    escalationRecall,
    escalationDenominator: positives.length,
    escalationTruePos: truePos,
    confusion,
    categories,
  };
}

// ---------------------------------------------------------------------------
// UI bits
// ---------------------------------------------------------------------------

function BigStat({
  label, value, n, subtitle,
}: { label: string; value: number; n: number; subtitle?: string }) {
  const pct = (value * 100).toFixed(1);
  return (
    <div className="border border-foreground p-4">
      <div className="font-mono text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 font-serif text-4xl leading-none sm:text-5xl">{pct}%</div>
      <div className="mt-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
        {subtitle ?? `n = ${n}`}
      </div>
    </div>
  );
}

function ConfusionMatrix({ matrix, categories }: { matrix: number[][]; categories: string[] }) {
  const max = Math.max(1, ...matrix.flat());
  const label = (c: string) =>
    (CATEGORY_LABELS as Record<string, string>)[c] ?? c;
  return (
    <div className="overflow-x-auto border border-border">
      <table className="w-full border-collapse font-mono text-[11px]">
        <thead>
          <tr>
            <th className="border border-border bg-foreground/5 px-2 py-1.5 text-left">true \ pred</th>
            {categories.map((c) => (
              <th key={c} className="border border-border bg-foreground/5 px-2 py-1.5 text-left">
                {label(c)}
              </th>
            ))}
            <th className="border border-border bg-foreground/5 px-2 py-1.5 text-left">total</th>
          </tr>
        </thead>
        <tbody>
          {categories.map((rowCat, i) => {
            const rowTotal = matrix[i].reduce((a, b) => a + b, 0);
            return (
              <tr key={rowCat}>
                <th className="border border-border bg-foreground/5 px-2 py-1.5 text-left font-normal">
                  {label(rowCat)}
                </th>
                {matrix[i].map((v, j) => {
                  const intensity = v / max;
                  const isDiag = i === j;
                  const bg = v === 0
                    ? "transparent"
                    : isDiag
                      ? `rgba(16, 185, 129, ${0.15 + intensity * 0.6})` // emerald
                      : `rgba(220, 38, 38, ${0.15 + intensity * 0.55})`; // red
                  return (
                    <td
                      key={j}
                      className="border border-border px-2 py-1.5 text-center"
                      style={{ background: bg }}
                    >
                      {v || ""}
                    </td>
                  );
                })}
                <td className="border border-border px-2 py-1.5 text-center text-muted-foreground">
                  {rowTotal}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="border-t border-border bg-foreground/5 px-2 py-1.5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
        Green = correct (diagonal). Red = confusion. Darker = more instances.
      </p>
    </div>
  );
}
