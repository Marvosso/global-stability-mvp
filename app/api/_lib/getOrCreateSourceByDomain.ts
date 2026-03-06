import { supabaseAdmin } from "./db";

export type GetOrCreateSourcePayload = {
  name: string;
  url: string;
  reliability_tier?: string | null;
  ecosystem_key?: string | null;
  source_type?: "Other";
};

/**
 * Get existing source by domain, or insert one and return its id.
 * On unique violation (23505) for domain, re-selects by domain and returns existing row.
 * Returns null only if insert fails with a non-23505 error or re-select fails.
 */
export async function getOrCreateSourceByDomain(
  domain: string,
  payload: GetOrCreateSourcePayload
): Promise<{ id: string } | null> {
  const { data: existing } = await supabaseAdmin
    .from("sources")
    .select("id")
    .eq("domain", domain)
    .maybeSingle();

  if (existing) return existing;

  const row = {
    domain,
    name: payload.name,
    url: payload.url,
    source_type: payload.source_type ?? "Other",
    reliability_tier: payload.reliability_tier ?? null,
    ecosystem_key: payload.ecosystem_key ?? null,
  };

  const { data: inserted, error } = await supabaseAdmin
    .from("sources")
    .insert(row)
    .select("id")
    .single();

  if (error?.code === "23505") {
    const { data: again } = await supabaseAdmin
      .from("sources")
      .select("id")
      .eq("domain", domain)
      .maybeSingle();
    return again ?? null;
  }

  if (error) return null;
  return inserted ?? null;
}
