/**
 * AI claim extraction from article text.
 * Sends article + source name to an LLM and returns structured claim suggestions.
 */

export type ExtractClaimsInput = {
  articleText: string;
  sourceName: string;
  eventId: string;
};

export type ExtractedClaim = {
  actor_name: string;
  claim_text: string;
  claim_type: string | null;
  classification: "Verified Event" | "Disputed Claim";
  confidence: string;
};

const RULES = `
- Extract only distinct, attributable claims from the article (e.g. who said what, attributions, denials).
- For each claim set actor_name to the person, group, or source making or associated with the claim.
- Use claim_type to describe the kind of claim (e.g. "attribution", "denial", "accusation", "official statement").
- Use classification: "Verified Event" when the claim describes something presented as verified/factual; "Disputed Claim" when it is clearly contested or one side's narrative.
- Use confidence: "Low", "Medium", or "High" based on how clearly the article attributes the claim and how specific it is.
- Output only a JSON array. No markdown, no code fence, no extra text.
`;

const CLASSIFICATION_VALUES = ["Verified Event", "Disputed Claim"] as const;
const CONFIDENCE_VALUES = ["Low", "Medium", "High"];

function buildPrompt(input: ExtractClaimsInput): string {
  const text = input.articleText.trim().slice(0, 15000);
  return `You are extracting structured claims from a source article for a stability/conflict event.

Event ID (for context only): ${input.eventId}
Source name: ${input.sourceName}

Article text:
${text}

${RULES}

Respond with a single JSON array of objects. Each object must have exactly these keys (use null for claim_type if unclear):
- "actor_name" (string): who is making or associated with the claim
- "claim_text" (string): the claim in one clear sentence
- "claim_type" (string or null): e.g. attribution, denial, accusation, official statement
- "classification" (string): exactly one of "Verified Event" or "Disputed Claim"
- "confidence" (string): exactly one of "Low", "Medium", "High"

Example: [{"actor_name":"Government spokesperson","claim_text":"The ministry confirmed the incident.","claim_type":"official statement","classification":"Verified Event","confidence":"Medium"},...]`;
}

const DEFAULT_MODEL = "gpt-4o-mini";

function normalizeClaim(raw: Record<string, unknown>): ExtractedClaim {
  const actor_name = typeof raw.actor_name === "string" ? raw.actor_name.trim() : "";
  const claim_text = typeof raw.claim_text === "string" ? raw.claim_text.trim() : "";
  const claim_type =
    raw.claim_type !== undefined && raw.claim_type !== null && typeof raw.claim_type === "string"
      ? raw.claim_type.trim() || null
      : null;
  const classificationRaw =
    typeof raw.classification === "string" && CLASSIFICATION_VALUES.includes(raw.classification as (typeof CLASSIFICATION_VALUES)[number])
      ? (raw.classification as (typeof CLASSIFICATION_VALUES)[number])
      : "Disputed Claim";
  const confidenceRaw =
    typeof raw.confidence === "string" && CONFIDENCE_VALUES.includes(raw.confidence)
      ? raw.confidence
      : "Medium";

  return {
    actor_name: actor_name || "Unknown",
    claim_text: claim_text || "(no text)",
    claim_type,
    classification: classificationRaw,
    confidence: confidenceRaw,
  };
}

/**
 * Call OpenAI Chat Completions and parse JSON array of claims.
 * Requires OPENAI_API_KEY in env.
 */
export async function extractClaims(
  input: ExtractClaimsInput,
  options?: { model?: string; apiKey?: string }
): Promise<{ claims: ExtractedClaim[]; model: string }> {
  const apiKey = options?.apiKey ?? process.env.OPENAI_API_KEY;
  if (!apiKey?.trim()) {
    throw new Error("OPENAI_API_KEY is required for claim extraction");
  }
  const model = options?.model ?? process.env.OPENAI_MODEL ?? DEFAULT_MODEL;

  const prompt = buildPrompt(input);

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "system",
          content:
            "You output only a valid JSON array of claim objects. Keys: actor_name, claim_text, claim_type, classification, confidence. No markdown, no code fence.",
        },
        { role: "user", content: prompt },
      ],
      temperature: 0.3,
      max_tokens: 2000,
    }),
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`OpenAI API error ${res.status}: ${errBody.slice(0, 500)}`);
  }

  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const raw = data.choices?.[0]?.message?.content?.trim();
  if (!raw) {
    throw new Error("Empty response from OpenAI");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Invalid JSON from OpenAI: " + raw.slice(0, 200));
  }

  if (!Array.isArray(parsed)) {
    throw new Error("Expected JSON array from OpenAI");
  }

  const claims = (parsed as Record<string, unknown>[])
    .filter((item) => item && typeof item === "object")
    .map((item) => normalizeClaim(item as Record<string, unknown>));

  return { claims, model };
}
