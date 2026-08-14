# Reduce whitespace on the Evaluation page

## Problem
On `/evaluation`, when no results are present, the "Upload labeled CSV" section sits at the top and the "About · how it works" panel is pushed far down the page, leaving a large empty gap.

## Root cause
The `<main>` element has `flex-1`, forcing it to absorb all remaining vertical space before the `AboutPanel` renders at the bottom. Combined with `space-y-8` inside `main` and `mt-10` on `AboutPanel`, the whitespace is exaggerated when the results sections are absent.

## Changes
1. In `src/routes/evaluation.tsx`:
   - Remove `flex-1` from the `<main>` element so it only takes the space its children need.
   - Reduce the vertical stack spacing from `space-y-8` to `space-y-6`.
2. In `src/components/AboutPanel.tsx`:
   - Reduce the top margin from `mt-10` to `mt-6` so it sits closer to the content above while still remaining visually separate.

## Acceptance
- The Evaluation page shows the upload section and the About panel with noticeably less empty space between them when no results exist.
- Existing results view still stacks correctly and is not visually cramped.
