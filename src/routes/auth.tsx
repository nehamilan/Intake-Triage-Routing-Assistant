import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { useAuth } from "@/hooks/use-auth";
import { useServerFn } from "@tanstack/react-start";
import { ensureDemoAccount } from "@/lib/demo-auth.functions";
import { DEMO_ACCOUNTS, DEMO_PASSWORD, type DemoRole } from "@/lib/demo-accounts";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — Intake Triage" },
      { name: "description", content: "Sign in to the Intake Triage & Routing Assistant." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const router = useRouter();
  const { user, loading } = useAuth();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [demoBusy, setDemoBusy] = useState<DemoRole | null>(null);
  const [showOwn, setShowOwn] = useState(false);
  const locked = busy || demoBusy !== null;
  const ensureDemo = useServerFn(ensureDemoAccount);

  const handleDemo = async (role: DemoRole) => {
    setError(null);
    setDemoBusy(role);
    try {
      await ensureDemo({ data: { role } });
      const { error } = await supabase.auth.signInWithPassword({
        email: DEMO_ACCOUNTS[role].email,
        password: DEMO_PASSWORD,
      });
      if (error) throw error;
      router.invalidate();
      navigate({ to: "/" });
    } catch {
      setError("Could not start the demo session. Please try again.");
    } finally {
      setDemoBusy(null);
    }
  };

  useEffect(() => {
    if (!loading && user) navigate({ to: "/" });
  }, [loading, user, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: window.location.origin,
            data: { display_name: displayName || email.split("@")[0] },
          },
        });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
      router.invalidate();
      navigate({ to: "/" });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const handleGoogle = async () => {
    setError(null);
    setBusy(true);
    try {
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: window.location.origin,
      });
      if (result.error) {
        setError(result.error instanceof Error ? result.error.message : String(result.error));
        setBusy(false);
        return;
      }
      if (result.redirected) return;
      router.invalidate();
      navigate({ to: "/" });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <h1 className="font-serif text-2xl font-medium">Intake Triage</h1>
          <p className="mt-1 font-serif text-sm italic text-muted-foreground">
            Sign {mode === "signin" ? "in" : "up"} to continue
          </p>
        </div>

        <div className="space-y-2 border border-border p-3">
          <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            Explore instantly — no signup
          </p>
          {(["agent", "viewer"] as DemoRole[]).map((role) => (
            <button
              key={role}
              type="button"
              onClick={() => handleDemo(role)}
              disabled={locked}
              aria-busy={demoBusy === role}
              className="flex w-full items-center justify-center gap-2 bg-foreground px-4 py-2 font-mono text-xs font-bold uppercase tracking-widest text-background hover:opacity-90"
            >
              {demoBusy === role && (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              )}
              {demoBusy === role ? "Signing in…" : DEMO_ACCOUNTS[role].label}
            </button>
          ))}
          <p className="font-serif text-xs italic text-muted-foreground">
            Agent can triage and review. Viewer is read-only — enforced by database
            permissions, not hidden buttons.
          </p>
        </div>

        {error && (
          <p className="border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-800">
            {error}
          </p>
        )}

        {!showOwn && (
          <p className="text-center">
            <button
              type="button"
              onClick={() => {
                setShowOwn(true);
                setError(null);
              }}
              className="font-serif text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
            >
              Sign in with your own account
            </button>
          </p>
        )}

        {showOwn && (
        <div className="space-y-6">
        <button
          type="button"
          onClick={handleGoogle}
          disabled={locked}
          className="flex w-full items-center justify-center gap-2 border border-foreground px-4 py-2 font-mono text-xs font-bold uppercase tracking-widest hover:bg-foreground hover:text-background"
        >
          Continue with Google
        </button>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-border" />
          </div>
          <div className="relative flex justify-center">
            <span className="bg-background px-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              or
            </span>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          {mode === "signup" && (
            <input
              type="text"
              placeholder="Display name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full border border-border bg-background px-3 py-2 text-sm"
            />
          )}
          <input
            type="email"
            required
            autoComplete="off"
            name="intake-email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full border border-border bg-background px-3 py-2 text-sm"
          />
          <input
            type="password"
            required
            autoComplete="new-password"
            name="intake-password"
            minLength={6}
            placeholder="Password (min 6 chars)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full border border-border bg-background px-3 py-2 text-sm"
          />
          <button
            type="submit"
            disabled={locked}
            className="flex w-full items-center justify-center gap-2 bg-foreground px-4 py-2 font-mono text-xs font-bold uppercase tracking-widest text-background hover:opacity-90"
          >
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
            {busy ? "Signing in…" : mode === "signin" ? "Sign in" : "Create account"}
          </button>
        </form>

        <p className="text-center font-serif text-xs text-muted-foreground">
          {mode === "signin" ? "New here?" : "Have an account?"}{" "}
          <button
            type="button"
            onClick={() => {
              setMode(mode === "signin" ? "signup" : "signin");
              setError(null);
            }}
            className="underline"
          >
            {mode === "signin" ? "Create an account" : "Sign in"}
          </button>
        </p>
        <p className="text-center font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          New accounts start as viewer (read-only)
        </p>
      </div>
    </div>
  );
}
