import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useTheme } from "@/hooks/use-theme";
import { useRulebook } from "@/hooks/use-rulebook";
import { AccountMenu } from "@/components/AccountMenu";
import type { VerticalId } from "@/lib/rulebook";

export type AppTab = "triage" | "queue" | "dashboard" | "evaluation";

/**
 * Shared application header: title, tab navigation, vertical switcher,
 * dark-mode toggle and account chip. Every page renders this so navigation,
 * the active rulebook and the signed-in identity look identical everywhere.
 *
 * `onSelectTab` is supplied only by the Triage page, where Triage/Queue are
 * in-page tabs. Elsewhere those tabs are links back to `/`.
 */
export function AppHeader({
  active,
  title = "Intake Triage & Routing Assistant",
  subtitle = "Decision support — a human reviews every decision.",
  queueCount = 0,
  onSelectTab,
}: {
  active: AppTab;
  title?: string;
  subtitle?: ReactNode;
  queueCount?: number;
  onSelectTab?: (tab: "triage" | "queue") => void;
}) {
  const { user, role, displayName, signOut } = useAuth();
  const { theme, toggle: toggleTheme } = useTheme();
  const { rulebook, verticalId, setVertical, availableVerticals } =
    useRulebook();

  const name = displayName || user?.email || "user";
  const roleLabel =
    role === "agent" ? "Agent" : role === "viewer" ? "Viewer" : "No role";

  const localTab = (tab: "triage" | "queue", children: ReactNode) =>
    onSelectTab ? (
      <button
        type="button"
        key={tab}
        aria-current={active === tab ? "page" : undefined}
        onClick={() => onSelectTab(tab)}
        className={tabClass(active === tab)}
      >
        {children}
      </button>
    ) : (
      <Link
        key={tab}
        to="/"
        search={{ tab }}
        aria-current={active === tab ? "page" : undefined}
        className={tabClass(active === tab)}
      >
        {children}
      </Link>
    );

  return (
    <header className="mb-8 border-b border-foreground pb-6">
      <div className="flex flex-col gap-4">
        {/* Row 1: title (left) + controls (right) */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h1 className="font-serif text-2xl font-medium leading-tight text-foreground sm:text-3xl">
            {title}
          </h1>

          <div className="flex flex-wrap items-center gap-2 md:gap-3">
            <label className="flex items-center gap-1.5">
              <span className="sr-only">Vertical</span>
              <select
                aria-label={`Vertical: ${rulebook.label}`}
                value={verticalId}
                onChange={(e) => setVertical(e.target.value as VerticalId)}
                className="border border-border bg-background px-2 py-1 font-mono text-[10px] font-bold uppercase tracking-widest text-foreground hover:bg-foreground/5 focus:border-foreground focus:outline-none"
              >
                {availableVerticals.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.label}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={toggleTheme}
              aria-label={
                theme === "dark"
                  ? "Switch to light mode"
                  : "Switch to dark mode"
              }
              title={
                theme === "dark"
                  ? "Switch to light mode"
                  : "Switch to dark mode"
              }
              className="inline-flex h-7 w-7 items-center justify-center border border-border bg-background text-foreground hover:bg-foreground/5"
            >
              <span aria-hidden="true" className="text-xs">
                {theme === "dark" ? "☀" : "☾"}
              </span>
            </button>
            <div className="flex items-center gap-2">
              <AccountMenu
                name={name}
                email={user?.email}
                role={role}
                onSignOut={signOut}
              />
              {/* Role is enforced server-side; surfacing it here makes the
                  permission model visible to the person using the app. */}
              <span className="font-mono text-[9px] font-bold uppercase tracking-widest text-muted-foreground">
                {roleLabel}
              </span>
            </div>
          </div>
        </div>

        {/* Row 2: subtitle */}
        <p className="font-serif text-sm italic text-muted-foreground sm:text-base">
          {subtitle}
        </p>

        {/* Row 3: tab nav */}
        <nav
          aria-label="Sections"
          className="flex flex-wrap gap-6 text-xs font-semibold uppercase tracking-widest"
        >
          {localTab("triage", "Triage")}
          {localTab(
            "queue",
            <>
              Queue
              {queueCount > 0 ? (
                <span className="ml-1.5 rounded-sm bg-foreground px-1.5 py-0.5 font-mono text-[9px] text-background">
                  {queueCount}
                </span>
              ) : null}
            </>,
          )}
          <Link
            to="/dashboard"
            aria-current={active === "dashboard" ? "page" : undefined}
            className={tabClass(active === "dashboard")}
          >
            Dashboard
          </Link>
          {role === "agent" ? (
            <Link
              to="/evaluation"
              aria-current={active === "evaluation" ? "page" : undefined}
              className={tabClass(active === "evaluation")}
            >
              Evaluation
            </Link>
          ) : null}
        </nav>
      </div>
    </header>
  );
}

function tabClass(active: boolean) {
  return active
    ? "inline-flex items-center border-b-2 border-foreground pb-1 text-foreground"
    : "inline-flex items-center border-b-2 border-transparent pb-1 text-muted-foreground transition-colors hover:text-foreground";
}
