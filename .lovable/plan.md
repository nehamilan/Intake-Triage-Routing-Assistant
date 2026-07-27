## Fix: Sign-out wraps to its own line in the agent header

### Change

In `src/components/AuthGate.tsx`, replace the text "Sign out" button with a responsive variant:
- `< sm` breakpoint: compact icon-only button (Lucide `LogOut` icon), same 7×7 square as the theme toggle, with `aria-label="Sign out"` and matching `title` for the tooltip.
- `≥ sm` breakpoint: existing text button "Sign out" with the same styling as today.

Implementation detail: render one button and toggle content with Tailwind responsive classes — `hidden sm:inline` on the text, `sm:hidden` on the icon — so we don't duplicate the element. Adjust padding to `px-2 sm:px-3` so the icon variant stays square.

No other header controls change. No logic changes.

### Why this fixes it

The header is `flex flex-wrap`. "Sign out" is the widest trailing item; shrinking it to an icon on small screens frees enough width for the whole row to fit on one line at ~640px, matching the screenshot.

### Verification

- Reload `/` at 640px and confirm all header controls sit on one line, with a logout icon at the end.
- Resize to ≥ 640px and confirm the full "Sign out" label returns.
- Confirm keyboard focus, `aria-label`, and click behavior still sign the user out.