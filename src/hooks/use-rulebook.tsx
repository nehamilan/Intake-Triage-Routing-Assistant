import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  RULEBOOKS,
  RESEARCH_RULEBOOK,
  type Rulebook,
  type VerticalId,
} from "@/lib/rulebook";

interface RulebookContextValue {
  rulebook: Rulebook;
  verticalId: VerticalId;
  setVertical: (id: VerticalId) => void;
  availableVerticals: Rulebook[];
}

const RulebookContext = createContext<RulebookContextValue | undefined>(
  undefined,
);
const STORAGE_KEY = "itra:vertical";

export function RulebookProvider({ children }: { children: ReactNode }) {
  const [verticalId, setVerticalId] = useState<VerticalId>("research");

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved === "research" || saved === "banking") {
        setVerticalId(saved);
      }
    } catch {
      // ignore
    }
  }, []);

  const setVertical = useCallback((id: VerticalId) => {
    setVerticalId(id);
    try {
      window.localStorage.setItem(STORAGE_KEY, id);
    } catch {
      // ignore
    }
  }, []);

  const rulebook = RULEBOOKS[verticalId] ?? RESEARCH_RULEBOOK;

  return (
    <RulebookContext.Provider
      value={{
        rulebook,
        verticalId,
        setVertical,
        availableVerticals: Object.values(RULEBOOKS),
      }}
    >
      {children}
    </RulebookContext.Provider>
  );
}

export function useRulebook() {
  const ctx = useContext(RulebookContext);
  if (!ctx) throw new Error("useRulebook must be used within RulebookProvider");
  return ctx;
}
