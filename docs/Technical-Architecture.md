---
title: Technical Architecture
description: Stack, routing, server functions, database schema, auth, and styling for the triage application.
---

# Technical Architecture

## Stack Overview

| Layer | Technology |
|-------|------------|
| Framework | TanStack Start (React 19, Vite 7, SSR/SSG) |
| Styling | Tailwind CSS v4 with CSS theme variables |
| Backend / Auth | Supabase (Postgres + Auth) |
| AI | Lovable AI Gateway → Gemini 1.5 Flash |
| Charts | Recharts |
| Toast notifications | Sonner |

The app targets an edge/serverless runtime. Server functions use `createServerFn` from `@tanstack/react-start`; public API endpoints would live under `src/routes/api/public/` if needed.

## Route & Component Structure

Key routes:

- `/auth` — sign-in / sign-up.
- `/` — main triage page (two-panel input + queue).
- `/dashboard` — read-only metrics and charts.
- `/evaluation` — labeled test set evaluation (agent-only).

Shared components:

- `AuthGate.tsx` — wraps authenticated routes and enforces role checks.
- `AccountMenu.tsx` — compact avatar dropdown with role and sign-out.
- `DecisionCard.tsx` — displays AI proposal, guardrail flags, and review controls.
- `RevisionTimeline.tsx` — expandable audit history inside queue rows.

## Server Functions

- `classifyRequest` — protected by `requireSupabaseAuth`. Runs deterministic pre-checks, calls the LLM, validates output, applies post-checks, and returns a decision.
- `applyRules` — deterministic post-check layer: confidence gate, embargo date validation, and flag generation.
- Queue helpers — read/write `requests` and `request_revisions` tables, filtered by vertical and role.

Server functions keep secrets (AI gateway key, Supabase service role) inside handlers and never expose them to the client.

## Database Schema

**`public.requests`**

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid | Primary key |
| `created_at` | timestamptz | Auto |
| `vertical` | text | `research_data` or `banking_complaints` |
| `request_text` | text | Original intake message |
| `ai_category` | text | Model output |
| `ai_priority` | text | Model output |
| `ai_route` | text | Model output |
| `ai_confidence` | float | Model output |
| `ai_reason` | text | Model output |
| `final_category` | text | After review |
| `final_priority` | text | After review |
| `final_route` | text | After review |
| `status` | text | auto_routed / escalated_* / overridden |
| `flags` | jsonb | Array of human-readable flags |
| `was_overridden` | bool | True if any override occurred |
| `reviewer_note` | text | Optional note on accept |
| `reviewer_name` | text | Agent who finalized |
| `reviewed_at` | timestamptz | Finalize timestamp |
| `supersedes_id` | uuid | Points to previous version if revised |

**`public.request_revisions`**

Stores every finalized version of a request, including field changes and guardrail acknowledgments, for audit.

**`public.profiles` & `public.user_roles`**

Implements RBAC. Roles are stored in a separate table per Supabase best practice. A security-definer `has_role` function is used in RLS policies to avoid recursion.

## Authentication & Authorization

- Supabase Auth manages sessions.
- `src/start.ts` registers `attachSupabaseAuth` middleware so server functions receive the bearer token.
- `requireSupabaseAuth` middleware rejects unauthenticated calls.
- Route components check the user's role and redirect or hide actions accordingly.
- New accounts default to `viewer`; promotion to `agent` is done in `public.user_roles`.

## Styling & Theming

- Tailwind v4 with semantic color tokens in `src/styles.css`.
- Dark mode toggle persists the choice in `localStorage`.
- Fonts: EB Garamond for headings, JetBrains Mono for data/mono elements.
- Responsive charts and mobile-friendly queue table.
