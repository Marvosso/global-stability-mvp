/**
 * AI contradiction detection between claims for an event.
 * Sends claim list to an LLM and returns pairs with contradiction score and reason.
 */

export type ClaimForDetection = {
  id: string;
  claim_text: string;
  actor_name?: string | null;
};

export type ContradictionPair = {
  claim_a_id: string;
  claim_b_id: string;
  conflict_score: number;
  reason: string;
};

const DEFAULT_MODEL = "gpt-4o-mini";

function buildPrompt(claims: ClaimForDetection[]): string {
  const list = claims
    .map(
      (c) =>
        `- [ID: ${c.id}] (${c.actor_name ?? "Unknown"}): ${(c.claim_text ?? "").trim().slice(0, 300)}`
    )
    .join("\n");
  return `You are analyzing claims about a single event to find contradictory or conflicting narratives.

Claims (each has an ID; use exact IDs in your response):
${list}

Identify pairs of claims that contradict or strongly conflict with each other (e.g. one says X happened, another says X did not happen; or mutually exclusive attributions).

Respond with a JSON array of objects. Each object must have:
- "claim_a_id" (string): exact claim ID from the list
- "claim_b_id" (string): exact claim ID from the list (different from claim_a_id)
- "conflict_score" (number): 0 to 1, where 1 = direct contradiction, 0.5 = tension/ambiguity
- "reason" (string): one short sentence explaining the contradiction

Use only claim IDs that appear in the list. Each pair should appear only once (e.g. a,b not also b,a). If no contradictions exist, return [].

Output only the JSON array, no markdown or code fence.`;
}

function normalizePair(
  raw: Record<string, unknown>,
  validIds: Set<string>
): ContradictionPair | null {
  const a = typeof raw.claim_a_id === "string" ? raw.claim_a_id.trim() : "";
  const b = typeof raw.claim_b_id === "string" ? raw.claim_b_id.trim() : "";
  if (!a || !b || a === b || !validIds.has(a) || !validIds.has(b)) return null;
  const score =
    typeof raw.conflict_score === "number"
      ? Math.max(0, Math.min(1, raw.conflict_score))
      : typeof raw.conflict_score === "string"
        ? Math.max(0, Math.min(1, parseFloat(raw.conflict_score) || 0.5))
        : 0.5;
  const reason =
    typeof raw.reason === "string" ? raw.reason.trim().slice(0, 500) : "Contradiction detected";
  return { claim_a_id: a, claim_b_id: b, conflict_score: score, reason };
}

/**
 * Call OpenAI to detect contradicting claim pairs.
 * Requires OPENAI_API_KEY in env.
 */
export async function detectContradictions(
  claims: ClaimForDetection[],
  options?: { model?: string; apiKey?: string }
): Promise<{ pairs: ContradictionPair[]; model: string }> {
  const apiKey = options?.apiKey ?? process.env.OPENAI_API_KEY;
  if (!apiKey?.trim()) {
    throw new Error("OPENAI_API_KEY is required for contradiction detection");
  }
  const model = options?.model ?? process.env.OPENAI_MODEL ?? DEFAULT_MODEL;

  if (claims.length < 2) {
    return { pairs: [], model };
  }

  const validIds = new Set(claims.map((c) => c.id));
  const prompt = buildPrompt(claims);

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
            "You output only a valid JSON array of contradiction objects. Keys: claim_a_id, claim_b_id, conflict_score, reason. No markdown, no code fence.",
        },
        { role: "user", content: prompt },
      ],
      temperature: 0.2,
      max_tokens: 1500,
    }),
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`OpenAI API error ${res.status}: ${errBody.slice(0, 500)}`);
  }

  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const raw = data.choices?.[0]?.message?.content?.trim();
  if (!raw) {
    return { pairs: [], model };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { pairs: [], model };
  }

  if (!Array.isArray(parsed)) {
    return { pairs: [], model };
  }

  const seen = new Set<string>();
  const pairs: ContradictionPair[] = [];
  for (const item of parsed as Record<string, unknown>[]) {
    if (!item || typeof item !== "object") continue;
    const pair = normalizePair(item as Record<string, unknown>, validIds);
    if (!pair) continue;
    const key = pair.claim_a_id < pair.claim_b_id ? `${pair.claim_a_id}:${pair.claim_b_id}` : `${pair.claim_b_id}:${pair.claim_a_id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    pairs.push(pair);
  }

  return { pairs, model };
}
