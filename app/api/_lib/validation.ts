import { z } from "zod";
import {
  actor_alignment,
  actor_role,
  actor_type,
  confidence_level,
  event_category,
  event_status,
  event_subtype,
  reliability_tier,
  severity_level,
  source_type
} from "./enums";

const eventCategoryEnum = z.enum(event_category);
const eventSubtypeEnum = z.enum(event_subtype);
const severityEnum = z.enum(severity_level);
const confidenceEnum = z.enum(confidence_level);
const eventStatusEnum = z.enum(event_status);
const actorTypeEnum = z.enum(actor_type);
const actorAlignmentEnum = z.enum(actor_alignment);
const actorRoleEnum = z.enum(actor_role);
const sourceTypeEnum = z.enum(source_type);
const reliabilityTierEnum = z.enum(reliability_tier);

export const uuidSchema = z.string().uuid();

export const createDraftEventSchema = z.object({
  title: z.string().min(1).max(500),
  summary: z.string().min(1).max(5000),
  details: z.string().max(100_000).optional(),
  category: eventCategoryEnum,
  subtype: eventSubtypeEnum.nullish(),
  primary_classification: z.enum(["Verified Event", "Disputed Claim"]),
  secondary_classification: z.enum(["Official Claim", "Opposition Claim"]).nullish(),
  severity: severityEnum,
  confidence_level: confidenceEnum,
  confidence_score: z.number().min(0).max(100).optional(),
  occurred_at: z.string().datetime().optional(),
  ended_at: z.string().datetime().optional(),
  primary_location: z.string().optional(),
  requires_dual_review: z.boolean().optional(),
  source_url: z.string().url().optional(),
  actors: z
    .array(
      z.object({
        actor_id: uuidSchema,
        role: actorRoleEnum,
        is_primary: z.boolean().optional(),
        notes: z.string().max(2000).optional()
      })
    )
    .optional(),
  sources: z
    .array(
      z.object({
        source_id: uuidSchema,
        claim_url: z.string().url().optional(),
        claim_timestamp: z.string().datetime().optional(),
        source_primary_classification: z.enum(["Verified Event", "Disputed Claim"]).optional(),
        source_secondary_classification: z.enum(["Official Claim", "Opposition Claim"]).optional(),
        source_confidence_level: confidenceEnum.optional(),
        raw_excerpt: z.string().max(10_000).optional()
      })
    )
    .optional()
});

export type CreateDraftEventData = z.infer<typeof createDraftEventSchema>;

export const pendingEventsQuerySchema = z.object({
  status: z
    .array(eventStatusEnum)
    .optional()
    .default(["Draft", "UnderReview"]),
  requires_dual_review: z
    .preprocess((v) => (typeof v === "string" ? v === "true" : v), z.boolean().optional())
    .optional(),
  category: eventCategoryEnum.optional(),
  severity: severityEnum.optional(),
  created_by: uuidSchema.optional(),
  search: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  offset: z.coerce.number().int().min(0).optional().default(0)
});

export const publicEventsQuerySchema = z.object({
  tier: reliabilityTierEnum.optional(),
  region: z.string().min(1).max(50).optional(),
  limit: z.coerce.number().int().min(1).max(500).optional().default(20),
  offset: z.coerce.number().int().min(0).optional().default(0)
});

export const reviewEventSchema = z.object({
  action: z.enum(["request_changes", "approve_for_review", "publish", "reject"]),
  primary_classification: z.enum(["Verified Event", "Disputed Claim"]).optional(),
  secondary_classification: z.enum(["Official Claim", "Opposition Claim"]).optional(),
  severity: severityEnum.optional(),
  confidence_level: confidenceEnum.optional(),
  confidence_score: z.number().min(0).max(100).optional(),
  requires_dual_review: z.boolean().optional(),
  justification: z.string().min(1)
});

export const updateConfidenceSchema = z.object({
  confidence_level: confidenceEnum.optional(),
  confidence_score: z.number().min(0).max(100).optional(),
  justification: z.string().min(1),
  origin: z.enum(["HumanReview", "SystemRule", "Ingestion"]).optional()
});

export const actorCreateSchema = z.object({
  name: z.string().min(1),
  canonical_name: z.string().optional(),
  actor_type: actorTypeEnum,
  alignment: actorAlignmentEnum,
  affiliation_label: z.string().min(1),
  affiliated_to_actor_id: uuidSchema.optional(),
  country_code: z.string().length(2).optional(),
  notes: z.string().max(2000).optional()
});

export const actorUpdateSchema = actorCreateSchema.partial();

export const sourceCreateSchema = z.object({
  name: z.string().min(1).max(500),
  source_type: sourceTypeEnum,
  url: z.string().url().max(2048).optional().nullish(),
  ecosystem_key: z.string().max(500).optional().nullish(),
  reliability_tier: reliabilityTierEnum.optional()
});

export const sourceUpdateSchema = sourceCreateSchema.partial();

// Source candidates (intake pipeline)
export const sourceCandidateStatusEnum = z.enum(["Pending", "Approved", "Rejected"]);

export const sourceCandidatesQuerySchema = z.object({
  status: sourceCandidateStatusEnum.optional().default("Pending"),
});

export const approveSourceCandidateSchema = z.object({
  name: z.string().min(1).max(500),
  reliability_tier: reliabilityTierEnum.optional(),
  ecosystem_key: z.string().max(500).optional(),
  notes: z.string().max(2000).optional(),
});

export const rejectSourceCandidateSchema = z.object({
  reason: z.string().max(2000).optional(),
});

// Event context fields (Phase 4C) – PATCH /api/internal/events/[id]
const competingClaimSchema = z.object({
  claim: z.string().min(1).max(5_000),
  attributed_to: z.string().max(500).optional().nullable(),
  confidence: z.string().max(200).optional().nullable(),
});

export const eventContextUpdateSchema = z.object({
  context_background: z.string().max(100_000).optional().nullable(),
  key_parties: z.string().max(50_000).optional().nullable(),
  competing_claims: z.array(competingClaimSchema).optional().nullable(),
  outcome: z.string().max(200).optional().nullable(),
});

export type EventContextUpdate = z.infer<typeof eventContextUpdateSchema>;

// Phase 11C: event_claims / event_facts (Context Engine)
export const createClaimSchema = z.object({
  claim_text: z.string().min(1).max(10_000),
  actor_name: z.string().min(1).max(500),
  classification: z.enum(["Verified Event", "Disputed Claim"]),
  confidence_level: z.string().min(1).max(100),
  evidence_source_url: z.string().url().max(2048),
  claim_type: z.string().max(200).optional(),
});
export type CreateClaimData = z.infer<typeof createClaimSchema>;

export const createFactSchema = z.object({
  fact_text: z.string().min(1).max(10_000),
  evidence_source_url: z.string().url().max(2048).optional(),
  confidence_level: z.string().max(100).optional(),
});
export type CreateFactData = z.infer<typeof createFactSchema>;

// Phase 12B: extract claims body – by event_source_id OR pasted article_text + source_name
export const extractClaimsBodySchema = z
  .object({
    event_source_id: uuidSchema.optional(),
    article_text: z.string().max(100_000).optional(),
    source_name: z.string().max(500).optional(),
    evidence_source_url: z.string().url().max(2048).optional(),
  })
  .refine(
    (data) =>
      (data.event_source_id != null) ||
      (typeof data.article_text === "string" && data.article_text.length > 0 && typeof data.source_name === "string" && data.source_name.length > 0),
    { message: "Provide event_source_id or both article_text and source_name" }
  );
export type ExtractClaimsBody = z.infer<typeof extractClaimsBodySchema>;

// Approve candidate: optional evidence_source_url override when candidate has null
export const approveClaimCandidateSchema = z.object({
  evidence_source_url: z.string().url().max(2048).optional(),
});
export type ApproveClaimCandidateData = z.infer<typeof approveClaimCandidateSchema>;

// Batch ingest (feed scripts): items array for POST /api/internal/ingest
export const ingestItemSchema = z.object({
  feed_key: z.string().min(1),
  source_name: z.string().min(1),
  source_url: z.string().url(),
  title: z.string().min(1).max(500),
  summary: z.string().max(5000).optional(),
  published_at: z.string().optional(),
  occurred_at: z.string().optional(),
  location: z.string().max(500).optional(),
  category: eventCategoryEnum.optional(),
  subtype: eventSubtypeEnum.optional(),
  lat: z.union([z.number(), z.string()]).optional(),
  lng: z.union([z.number(), z.string()]).optional(),
  tags: z.union([z.array(z.string()), z.string()]).optional(),
  raw: z.unknown().optional(),
});

export const ingestBatchSchema = z.object({
  items: z.array(ingestItemSchema),
});

export type IngestItem = z.infer<typeof ingestItemSchema>;
export type IngestBatch = z.infer<typeof ingestBatchSchema>;

// User watchlists (Phase 5A) – POST /api/watchlists. Phase 5D: email_notifications.
export const watchlistCreateSchema = z.object({
  name: z.string().max(200).optional().nullable(),
  categories: z.array(z.string()).optional().default([]),
  severities: z.array(z.string()).optional().default([]),
  confidence_levels: z.array(z.string()).optional().default([]),
  countries: z.array(z.string()).optional().default([]),
  bbox: z.union([z.record(z.unknown()), z.array(z.number())]).optional().nullable(),
  email_notifications: z.boolean().optional().default(false),
});

export type WatchlistCreate = z.infer<typeof watchlistCreateSchema>;

// Phase 15A: row-based watchlist entry (watch_type + watch_value)
export const watchlistEntryCreateSchema = z.object({
  watch_type: z.enum(["country", "category", "actor"]),
  watch_value: z.string().min(1).max(500).transform((s) => s.trim()),
  email_notifications: z.boolean().optional().default(false),
});
export type WatchlistEntryCreate = z.infer<typeof watchlistEntryCreateSchema>;

// Phase 15C: user dashboards – filters applied when querying events, scores, escalation signals
export const dashboardFiltersSchema = z.object({
  region: z.string().min(1).max(50).optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
  offset: z.coerce.number().int().min(0).optional(),
  tier: reliabilityTierEnum.optional(),
});
export type DashboardFilters = z.infer<typeof dashboardFiltersSchema>;

export const dashboardCreateSchema = z.object({
  name: z.string().min(1).max(200),
  filters: z.record(z.unknown()).optional().default({}),
});
export type DashboardCreateData = z.infer<typeof dashboardCreateSchema>;

export const dashboardUpdateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  filters: z.record(z.unknown()).optional(),
});
export type DashboardUpdateData = z.infer<typeof dashboardUpdateSchema>;
