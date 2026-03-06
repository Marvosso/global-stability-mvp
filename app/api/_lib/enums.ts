// Lightweight runtime mirrors of key Postgres enum types, for validation.

export const event_category = [
  "Armed Conflict",
  "Political Tension",
  "Military Posture",
  "Diplomatic Confrontation",
  "Coercive Economic Action",
  "Natural Disaster",
] as const;

export const event_subtype = [
  "Battle",
  "Targeted Assassination",
  "Air Strike",
  "Border Skirmish",
  "Protest",
  "Legislation Dispute",
  "Government Crisis",
  "Earthquake",
  "Flood",
  "Cyclone",
  "Drought",
  "Wildfire",
] as const;

export const severity_level = ["Low", "Medium", "High", "Critical"] as const;

export const confidence_level = ["Low", "Medium", "High"] as const;

export const event_status = ["Draft", "UnderReview", "Published", "Rejected"] as const;

export const actor_type = ["National Government", "Armed Non-State Group", "International Organization"] as const;

export const actor_alignment = ["State", "Non-State", "Unknown"] as const;

export const actor_role = ["Initiator", "Target", "Mediator", "Observer"] as const;

export const source_type = ["Official", "Media", "NGO", "SocialMedia", "Other"] as const;

export const reliability_tier = ["Low", "Medium", "High"] as const;

