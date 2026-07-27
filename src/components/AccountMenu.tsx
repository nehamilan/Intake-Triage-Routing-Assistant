import { LogOut } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * Compact circular avatar that opens a dropdown containing identity + Sign out.
 * Replaces the always-visible name/role/sign-out cluster so the header never wraps.
 */
export function AccountMenu({
  name,
  email,
  role,
  onSignOut,
}: {
  name: string;
  email?: string | null;
  role?: string | null;
  onSignOut: () => void;
}) {
  const initials = getInitials(name || email || "?");
  const ringClass =
    role === "agent"
      ? "ring-foreground"
      : role === "viewer"
        ? "ring-muted-foreground"
        : "ring-border";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Account menu"
          className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border bg-background font-mono text-[10px] font-bold uppercase tracking-widest text-foreground ring-2 ring-offset-2 ring-offset-background hover:bg-foreground/5 focus:outline-none ${ringClass}`}
        >
          {initials}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="flex flex-col gap-0.5">
          <span className="truncate font-serif text-sm font-normal text-foreground">
            {name}
          </span>
          {email && email !== name ? (
            <span className="truncate font-mono text-[10px] normal-case tracking-normal text-muted-foreground">
              {email}
            </span>
          ) : null}
          <span className="mt-1 font-mono text-[9px] font-bold uppercase tracking-widest text-muted-foreground">
            Role: {role ?? "no role"}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onSignOut} className="font-mono text-xs uppercase tracking-widest">
          <LogOut aria-hidden="true" className="mr-2 h-3.5 w-3.5" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function getInitials(source: string): string {
  const cleaned = source.trim();
  if (!cleaned) return "?";
  const parts = cleaned.split(/[\s@._-]+/).filter(Boolean);
  if (parts.length === 0) return cleaned.slice(0, 2).toUpperCase();
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}
