/**
 * ReliefWeb Disasters API ingestion.
 * Fetches ongoing disasters from the ReliefWeb JSON API (not RSS).
 * Maps report types into Humanitarian Crisis taxonomy: Food Crisis, Population Displacement, Flood, Drought, Disease Outbreak.
 * API: https://api.reliefweb.int/v1/disasters
 */

import type { IngestItem } from "@/app/api/_lib/validation";
import { supabaseAdmin } from "@/app/api/_lib/db";
import {
  createDraftEventAndMaybeCandidate,
  CreateDraftEventError,
} from "@/app/api/_lib/createDraftEvent";
import { mapIngestItemToDraftData } from "@/app/api/_lib/processIngestBatch";

const FEED_KEY = "reliefweb_disasters";
const SOURCE_NAME = "ReliefWeb Disasters";

const DEFAULT_DISASTERS_PATH =
  "https://api.reliefweb.int/v1/disasters?limit=50" +
  "&fields[include][]=name&fields[include][]=date&fields[include][]=country" +
  "&fields[include][]=type&fields[include][]=url&fields[include][]=status" +
  "&filter[field]=status&filter[value]=ongoing";

/** Ensure URL has appname parameter; append if missing. */
function ensureAppnameInUrl(url: string, appname: string): string {
  const parsed = new URL(url);
  if (parsed.searchParams.has("appname")) return url;
  parsed.searchParams.set("appname", appname);
  return parsed.toString();
}

const DEFAULT_CATEGORY = "Humanitarian Crisis" as const;

/** Map ReliefWeb report/disaster type names into event taxonomy. Default category: Humanitarian Crisis. */
function mapReliefWebToTaxonomy(typeName: string): {
  category: typeof DEFAULT_CATEGORY;
  subtype: "Food Crisis" | "Population Displacement" | "Flood" | "Drought" | "Disease Outbreak" | undefined;
} {
  const lower = typeName.toLowerCase();
  if (lower.includes("famine") || lower.includes("food security")) return { category: DEFAULT_CATEGORY, subtype: "Food Crisis" };
  if (lower.includes("displacement")) return { category: DEFAULT_CATEGORY, subtype: "Population Displacement" };
  if (lower.includes("flood") || lower.includes("flash flood")) return { category: DEFAULT_CATEGORY, subtype: "Flood" };
  if (lower.includes("drought")) return { category: DEFAULT_CATEGORY, subtype: "Drought" };
  if (lower.includes("epidemic") || lower.includes("disease outbreak")) return { category: DEFAULT_CATEGORY, subtype: "Disease Outbreak" };
  return { category: DEFAULT_CATEGORY, subtype: undefined };
}

type ReliefWebDisaster = {
  id: number;
  fields: {
    name?: string;
    url?: string;
    status?: string;
    date?: { created?: string; event?: string };
    country?: Array<{ name: string; iso3?: string }>;
    type?: Array<{ name: string }>;
  };
};

type ReliefWebResponse = {
  data?: ReliefWebDisaster[];
};

const log = {
  error: (msg: string, meta?: Record<string, unknown>) => console.error(msg, meta),
  warn: (msg: string, meta?: Record<string, unknown>) => console.warn(msg, meta),
};

export async function ingestReliefWeb(
  options: { apiUrl?: string; appname?: string } = {}
): Promise<{ fetched: number; processed: number; skipped: number }> {
  const appname = (
    options.appname ?? process.env.RELIEFWEB_APPNAME ?? ""
  ).trim();
  if (!appname) {
    throw new Error(
      "RELIEFWEB_APPNAME is required for ReliefWeb API requests. Set RELIEFWEB_APPNAME in .env.local (e.g. your approved appname from ReliefWeb)."
    );
  }

  const baseUrl = (
    options.apiUrl ??
    process.env.RELIEFWEB_API_URL ??
    ""
  ).trim();
  const apiUrl = baseUrl
    ? ensureAppnameInUrl(baseUrl, appname)
    : ensureAppnameInUrl(DEFAULT_DISASTERS_PATH, appname);

  let runId: string | null = null;
  try {
    const { data: runRow, error: runInsertErr } = await supabaseAdmin
      .from("ingestion_runs")
      .insert({ feed_key: FEED_KEY, items_fetched: 0, processed: 0, skipped: 0, status: "running" })
      .select("id")
      .single();
    runId = runInsertErr ? null : (runRow?.id ?? null);
  } catch {
    runId = null;
  }

  const res = await fetch(apiUrl, {
    headers: { "User-Agent": "global-stability-mvp/1.0", "Accept": "application/json" },
  });

  if (!res.ok) {
    const body = await res.text();
    const errMsg = `ReliefWeb API fetch failed: ${res.status} ${res.statusText} ${body.slice(0, 200)}`;
    if (runId) {
      await supabaseAdmin
        .from("ingestion_runs")
        .update({ finished_at: new Date().toISOString(), status: "error", items_fetched: 0, processed: 0, skipped: 0 })
        .eq("id", runId);
    }
    throw new Error(errMsg);
  }

  const json = (await res.json()) as ReliefWebResponse;
  const disasters = json.data ?? [];

  const ingestItems: IngestItem[] = disasters
    .map((disaster): IngestItem | null => {
      const fields = disaster.fields;
      const title = (fields.name ?? "").trim();
      const sourceUrl = (fields.url ?? "").trim();
      if (!title || !sourceUrl) return null;

      const firstType = fields.type?.[0]?.name ?? "";
      const { category, subtype } = mapReliefWebToTaxonomy(firstType);

      const countryName = fields.country?.[0]?.name ?? "";
      const location = countryName || undefined;

      const dateStr = fields.date?.event ?? fields.date?.created;

      return {
        feed_key: FEED_KEY,
        source_name: SOURCE_NAME,
        source_url: sourceUrl,
        title: title.slice(0, 500),
        summary: [firstType, countryName].filter(Boolean).join(" — ") || undefined,
        published_at: dateStr || undefined,
        occurred_at: dateStr || undefined,
        location,
        category,
        subtype,
        confidence_level: "High",
      } as IngestItem;
    })
    .filter((x): x is IngestItem => x != null);

  if (ingestItems.length === 0) {
    if (runId) {
      await supabaseAdmin
        .from("ingestion_runs")
        .update({ finished_at: new Date().toISOString(), items_fetched: 0, processed: 0, skipped: 0, status: "ok" })
        .eq("id", runId);
    }
    return { fetched: 0, processed: 0, skipped: 0 };
  }

  let processed = 0;
  let skipped = 0;

  for (const item of ingestItems) {
    const { data: existing } = await supabaseAdmin
      .from("ingestion_items")
      .select("id")
      .eq("source_url", item.source_url)
      .maybeSingle();

    if (existing) {
      skipped++;
      continue;
    }

    const { data: inserted, error: insertErr } = await supabaseAdmin
      .from("ingestion_items")
      .insert({
        feed_key: FEED_KEY,
        source_url: item.source_url,
        source_name: SOURCE_NAME,
        payload: item as unknown as Record<string, unknown>,
        status: "New",
      })
      .select("id")
      .single();

    if (insertErr) {
      if (insertErr.code === "23505") {
        skipped++;
        continue;
      }
      log.error("ingestion_items insert failed", {
        error: insertErr.message,
        source_url: item.source_url,
      });
      skipped++;
      continue;
    }

    const draftData = mapIngestItemToDraftData(item);
    try {
      await createDraftEventAndMaybeCandidate({ data: draftData, createdBy: null });
      await supabaseAdmin
        .from("ingestion_items")
        .update({ status: "Processed" })
        .eq("id", inserted.id);
      processed++;
    } catch (err) {
      if (err instanceof CreateDraftEventError) {
        log.error("Draft create failed (CreateDraftEventError)", {
          message: err.message,
          status: err.status,
          source_url: item.source_url,
        });
      } else {
        log.warn("Draft create failed", {
          source_url: item.source_url,
          message: err instanceof Error ? err.message : "Unknown",
        });
      }
      await supabaseAdmin
        .from("ingestion_items")
        .update({ status: "Skipped" })
        .eq("id", inserted.id);
      skipped++;
    }
  }

  if (runId) {
    try {
      await supabaseAdmin
        .from("ingestion_runs")
        .update({ finished_at: new Date().toISOString(), items_fetched: ingestItems.length, processed, skipped, status: "ok" })
        .eq("id", runId);
    } catch {
      // ignore
    }
  }

  return { fetched: ingestItems.length, processed, skipped };
}
