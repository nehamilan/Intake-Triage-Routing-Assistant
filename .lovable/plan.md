## Context

New signups get the `viewer` role by default (set by the `handle_new_user` trigger). Viewers are read-only — that's why Accept / Override / Reopen and the Evaluation page are hidden for you. To edit entries under Recent Decisions you need the `agent` role.

There is no separate "admin" login — the app has exactly two roles: `agent` (full read + write) and `viewer` (read-only dashboard). "Agent" is the equivalent of admin here.

## Plan

1. You tell me the email you signed up with on the preview (`https://id-preview--3ba9c55a-...lovable.app`).
2. I run a one-line migration that upgrades that user's row in `public.user_roles` from `viewer` to `agent`:

   ```sql
   UPDATE public.user_roles
   SET role = 'agent'
   WHERE user_id = (SELECT id FROM auth.users WHERE email = '<your-email>');
   ```
3. You sign out and back in (or just refresh) — the header will show the `agent` badge and all edit controls appear.

## Credentials

Keep using the same email + password you already signed up with. Nothing new to remember — the change is purely a role flip on the server.

## Optional follow-ups (say the word if you want any of these)

- Change the trigger so **new signups default to `agent`** (fine for a demo, not for production).
- Add a small **"Users & Roles" admin page** where an existing agent can promote/demote other users from the UI.
- Add a **first-user-becomes-agent** rule so bootstrapping doesn't need a manual SQL step.

Reply with the email and I'll ship step 2.