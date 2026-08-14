import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
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
            Sign in to continue.
          </p>
        </div>

        {error && (
          <p className="border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-800">
            {error}
          </p>
        )}

        <div className="space-y-4 border border-border p-5">
          <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            Explore instantly — no signup
          </p>
          {(["agent", "viewer"] as DemoRole[]).map((role) => {
            const isPrimary = role === "agent";
            return (
              <button
                key={role}
                type="button"
                onClick={() => handleDemo(role)}
                disabled={locked}
                aria-busy={demoBusy === role}
                className={
                  "flex w-full items-center justify-center gap-2 px-4 py-2 font-mono text-xs font-bold uppercase tracking-widest " +
                  (isPrimary
                    ? "bg-foreground text-background hover:opacity-90"
                    : "border border-foreground bg-transparent text-foreground hover:bg-foreground hover:text-background")
                }
              >
                {demoBusy === role && (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                )}
                {demoBusy === role ? "Signing in…" : DEMO_ACCOUNTS[role].label}
              </button>
            );
          })}
          <p className="font-serif text-xs italic text-muted-foreground">
            Agent can triage and review. Viewer is read-only — enforced by database
            permissions, not hidden buttons. Shared demo environment — data resets periodically.
          </p>
        </div>
      </div>
    </div>
  );
}
