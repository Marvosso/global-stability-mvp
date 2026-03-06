import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

let _browserInstance: SupabaseClient | null = null;

function getBrowserClient(): SupabaseClient {
  if (!_browserInstance) {
    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error("NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are required.");
    }
    _browserInstance = createClient(supabaseUrl, supabaseAnonKey);
  }
  return _browserInstance;
}

/** Browser-only Supabase client for auth and client-side data. Lazy-initialized so build/prerender without env does not call createClient. */
export const supabaseBrowserClient = new Proxy({} as SupabaseClient, {
  get(_, prop) {
    return (getBrowserClient() as unknown as Record<string, unknown>)[prop as string];
  },
});
