import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type AppRole = "agent" | "viewer";

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  role: AppRole | null;
  displayName: string | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

async function fetchRoleAndProfile(userId: string) {
  const [roleRes, profileRes] = await Promise.all([
    supabase.from("user_roles").select("role").eq("user_id", userId).limit(1),
    supabase.from("profiles").select("display_name").eq("id", userId).maybeSingle(),
  ]);
  const role = (roleRes.data?.[0]?.role ?? null) as AppRole | null;
  const displayName = profileRes.data?.display_name ?? null;
  return { role, displayName };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    // Subscribe first, then hydrate.
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      if (s?.user) {
        // Defer role fetch to avoid deadlock inside the callback.
        setTimeout(() => {
          if (cancelled) return;
          fetchRoleAndProfile(s.user.id).then(({ role, displayName }) => {
            if (cancelled) return;
            setRole(role);
            setDisplayName(displayName);
          });
        }, 0);
      } else {
        setRole(null);
        setDisplayName(null);
      }
    });

    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      setSession(data.session);
      if (data.session?.user) {
        fetchRoleAndProfile(data.session.user.id).then(({ role, displayName }) => {
          if (cancelled) return;
          setRole(role);
          setDisplayName(displayName);
          setLoading(false);
        });
      } else {
        setLoading(false);
      }
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider
      value={{
        user: session?.user ?? null,
        session,
        role,
        displayName,
        loading,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
