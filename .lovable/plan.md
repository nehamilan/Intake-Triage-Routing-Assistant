## Move Sign Out into an account menu

Replace the always-visible name/role chip + sign-out button cluster with a single circular **account avatar button** in the header. Clicking it opens a dropdown menu containing the user's identity and a Sign out action. This eliminates the wrap issue permanently (one small round target instead of a wide cluster) and matches conventions users already know from Gmail, GitHub, Linear, etc.

### What the header shows

- Compact circular avatar button (initials from name/email, role-tinted ring for `agent` vs `viewer`).
- No inline name, role pill, or sign-out button in the header bar itself.

### What the dropdown contains

```text
┌─────────────────────────────┐
│ Neha Milan                  │  ← full name (or email fallback)
│ nehamilan1991@gmail.com     │  ← muted
│ Role: AGENT                 │  ← role badge
├─────────────────────────────┤
│ ⎋  Sign out                 │
└─────────────────────────────┘
```

Uses the existing shadcn `DropdownMenu` primitive already in the project.

### Files touched

- `src/components/AuthGate.tsx` — replace the identity + sign-out cluster with `<DropdownMenu>` containing `Avatar` trigger and menu items. Keep sign-out logic identical.
- `src/routes/dashboard.tsx` — same treatment so the viewer dashboard header matches.

### Behavior preserved

- Sign-out calls the same `supabase.auth.signOut()` flow.
- Role is still visible (inside the menu, plus optional colored ring on avatar).
- Fully keyboard-accessible via Radix dropdown defaults.

### Not doing

- No changes to auth logic, routes, roles, or any business code.
- No changes to the vertical switcher or dark mode toggle placement.
