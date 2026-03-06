import { supabaseAdmin } from "../../../_lib/db";
import { getOrCreateSourceByDomain } from "../../../_lib/getOrCreateSourceByDomain";
import { requireReviewer } from "@/lib/rbac";
import { createRequestLogger } from "@/lib/logger";
import { internalError, responseFromThrown } from "@/lib/apiError";
import { normalizeDomainFromUrl } from "@/lib/domain";
import { NextRequest, NextResponse } from "next/server";

const SOURCE_CANDIDATE_AUDIT_TABLE = "source_candidate_audit_log" as const;

export async function POST(request: NextRequest) {
  const requestId = crypto.randomUUID();
  let ctx;
  try {
    ctx = await requireReviewer(request);
  } catch (err) {
    const res = responseFromThrown(err);
    if (res) return res;
    throw err;
  }

  const log = createRequestLogger({ requestId, role: ctx.role });

  const { data: candidates, error: fetchErr } = await supabaseAdmin
    .from("source_candidates")
    .select("id, url, domain, discovered_from_event_id")
    .eq("status", "Pending");

  if (fetchErr) {
    log.error("Failed to fetch pending candidates", { error: fetchErr.message });
    return internalError(fetchErr.message);
  }

  const list = candidates ?? [];
  const trustedDomainCache = new Map<string, { default_reliability_tier: string }>();
  let promoted = 0;
  const errors: string[] = [];

  for (const candidate of list) {
    const domain = candidate.domain ?? (candidate.url ? normalizeDomainFromUrl(candidate.url) : null);
    if (!domain) {
      errors.push(`Candidate ${candidate.id}: no domain`);
      continue;
    }

    let trusted = trustedDomainCache.get(domain);
    if (!trusted) {
      const { data: row } = await supabaseAdmin
        .from("trusted_domains")
        .select("default_reliability_tier")
        .eq("domain", domain)
        .eq("is_enabled", true)
        .maybeSingle();
      if (!row) continue;
      trusted = row;
      trustedDomainCache.set(domain, trusted);
    }

    const source = await getOrCreateSourceByDomain(domain, {
      name: domain,
      url: `https://${domain}`,
      reliability_tier: trusted.default_reliability_tier,
      ecosystem_key: null,
      source_type: "Other",
    });
    if (!source) {
      errors.push(`Candidate ${candidate.id}: could not ensure source for ${domain}`);
      continue;
    }

    const eventId = candidate.discovered_from_event_id;
    if (eventId) {
      const { error: linkErr } = await supabaseAdmin.from("event_sources").insert({
        event_id: eventId,
        source_id: source.id,
        claim_url: candidate.url,
      });
      if (linkErr?.code === "23505") {
        // already linked
      } else if (linkErr) {
        errors.push(`Candidate ${candidate.id}: event_sources insert failed: ${linkErr.message}`);
        continue;
      }
    }

    const { error: updateErr } = await supabaseAdmin
      .from("source_candidates")
      .update({
        status: "Approved",
        reviewed_at: new Date().toISOString(),
        reviewed_by: ctx.userId,
        promoted_to_source_id: source.id,
      })
      .eq("id", candidate.id);

    if (updateErr) {
      errors.push(`Candidate ${candidate.id}: update failed: ${updateErr.message}`);
      continue;
    }

    await supabaseAdmin.from(SOURCE_CANDIDATE_AUDIT_TABLE).insert({
      source_candidate_id: candidate.id,
      action: "approved_via_trusted_domain_bulk",
      actor_id: ctx.userId,
      details: { promoted_to_source_id: source.id },
    });

    promoted++;
  }

  log.info("Promote-all trusted domains finished", { promoted, total: list.length, errors: errors.length });
  return NextResponse.json(
    errors.length > 0 ? { promoted, errors } : { promoted }
  );
}
