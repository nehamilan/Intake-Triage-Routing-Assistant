/**
 * Pre-seeded demo identities.
 *
 * These are intentionally public credentials for two throwaway accounts that
 * exist only so reviewers can experience both permission levels. Role
 * separation is enforced by row-level security in the database — signing in as
 * the viewer account really does lose write access, it is not a UI toggle.
 */
export type DemoRole = "agent" | "viewer";

export const DEMO_ACCOUNTS: Record<
  DemoRole,
  { email: string; displayName: string; label: string }
> = {
  agent: {
    email: "agent-demo@intaketriage.app",
    displayName: "Demo Agent",
    label: "Continue as Agent (demo)",
  },
  viewer: {
    email: "viewer-demo@intaketriage.app",
    displayName: "Demo Viewer",
    label: "Continue as Viewer (demo)",
  },
};

/** Public by design: these accounts hold no private data. */
export const DEMO_PASSWORD = "demo-triage-2026";

export const DEMO_EMAILS = new Set(
  Object.values(DEMO_ACCOUNTS).map((a) => a.email),
);

/**
 * Identity shown in the UI. Real user emails are never rendered — anyone who
 * signs in with their own account sees a generic demo label instead.
 */
export function publicIdentity(
  email: string | null | undefined,
  displayName: string | null | undefined,
  role: string | null | undefined,
): { name: string; email: string } {
  if (email && DEMO_EMAILS.has(email)) {
    const match = Object.values(DEMO_ACCOUNTS).find((a) => a.email === email)!;
    return { name: displayName || match.displayName, email: match.email };
  }
  const fallback = role === "agent" ? DEMO_ACCOUNTS.agent : DEMO_ACCOUNTS.viewer;
  return { name: fallback.displayName, email: fallback.email };
}
