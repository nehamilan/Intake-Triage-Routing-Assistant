import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { DEMO_ACCOUNTS, DEMO_PASSWORD } from "./demo-accounts";

/**
 * Idempotently ensures the two public demo accounts exist with the correct
 * role row. Safe to call on every demo sign-in: it creates on first use and
 * no-ops afterwards. Privileged work only — never returns user data.
 */
export const ensureDemoAccount = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    z.object({ role: z.enum(["agent", "viewer"]) }).parse(data),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const account = DEMO_ACCOUNTS[data.role];

    let userId: string | null = null;

    const created = await supabaseAdmin.auth.admin.createUser({
      email: account.email,
      password: DEMO_PASSWORD,
      email_confirm: true,
      user_metadata: { display_name: account.displayName },
    });

    if (created.data?.user) {
      userId = created.data.user.id;
    } else {
      // Already exists — find it and reset the known demo password.
      const list = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 });
      const existing = list.data?.users.find((u) => u.email === account.email);
      if (!existing) throw new Error("Demo account unavailable");
      userId = existing.id;
      await supabaseAdmin.auth.admin.updateUserById(userId, {
        password: DEMO_PASSWORD,
        email_confirm: true,
        user_metadata: { display_name: account.displayName },
      });
    }

    await supabaseAdmin
      .from("profiles")
      .upsert({ id: userId, display_name: account.displayName });

    const roleRows = await supabaseAdmin
      .from("user_roles")
      .select("id, role")
      .eq("user_id", userId);

    const hasRole = (roleRows.data ?? []).some((r) => r.role === data.role);
    if (!hasRole) {
      await supabaseAdmin.from("user_roles").delete().eq("user_id", userId);
      await supabaseAdmin.from("user_roles").insert({ user_id: userId, role: data.role });
    }

    return { ok: true as const };
  });
