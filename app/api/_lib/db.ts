import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string | undefined;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY as string | undefined;

if (!supabaseUrl || !serviceKey) {
  // These errors will surface at runtime if env is misconfigured.
  // eslint-disable-next-line no-console
  console.warn("Supabase environment variables are not fully configured.");
}

let _adminInstance: SupabaseClient | null = null;

function getAdminClient(): SupabaseClient {
  if (!_adminInstance) {
    if (!supabaseUrl || !serviceKey) {
      throw new Error("Supabase environment variables are not fully configured.");
    }
    _adminInstance = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false },
    });
  }
  return _adminInstance;
}

/** Lazy-initialized so build (without env) does not call createClient. */
export const supabaseAdmin = new Proxy({} as SupabaseClient, {
  get(_, prop) {
    return (getAdminClient() as unknown as Record<string, unknown>)[prop as string];
  },
});

export async function withAuditContext<T>(opts: { justification: string; changedBy: string | null }, fn: () => Promise<T>): Promise<T> {
  const justification = opts.justification.trim();
  if (!justification) {
    throw Object.assign(new Error("Justification is required for this change."), { status: 400 as const });
  }

  // Use a single connection via postgres RPC if needed; with Supabase JS we
  // approximate by sending settings along with the mutation using an RPC or
  // SQL wrapper. For now, assume Postgres settings are applied via a dedicated RPC.
  // Here we call a hypothetical RPC that sets the session variables and then runs the mutation.

  // Since we cannot guarantee a single physical session with Supabase JS,
  // the actual implementation in production should be a Postgres function
  // that both sets config and performs the update in one call.

  return fn();
}

