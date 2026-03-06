/**
 * AI context draft generator.
 * Sends event + top source excerpts to an LLM and returns structured draft fields.
 * Rules: neutral tone, no speculation, must attribute claims, avoid moral language.
 */

export type ContextDraftInput = {
  title: string;
  summary: string;
  sourceExcerpts: string[];
  category: string;
  location: string | null;
  occurred_at: string | null;
};

export type ContextDraftOutput = {
  summary: string;
  trigger: string | null;
  background: string;
  uncertainties: string | null;
};

const RULES = `
- Use a neutral, factual tone. Do not speculate beyond what is stated in the inputs.
- Attribute all claims to sources (e.g. "Source X reported that …"). Do not present unattributed claims as fact.
- Avoid moral or judgmental language (e.g. avoid "atrocious", "unjust", "condemn").
- If information is missing or conflicting, note it in uncertainties rather than inventing content.
`;

function buildPrompt(input: ContextDraftInput): string {
  const excerpts =
    input.sourceExcerpts.length > 0
      ? input.sourceExcerpts
          .map((ex, i) => `[Excerpt ${i + 1}]: ${ex}`)
          .join("\n\n")
      : "No source excerpts provided.";
  const location = input.location?.trim() || "Location not specified";
  const occurred = input.occurred_at?.trim() || "Date not specified";
  return `You are writing a structured context draft for a stability/conflict event.

Event title: ${input.title}
Event summary: ${input.summary}
Category: ${input.category}
Location: ${location}
Occurred: ${occurred}

Source excerpts (use these with attribution; do not copy verbatim without attribution):
${excerpts}

${RULES}

Respond with a single JSON object only, no markdown or extra text, with these exact keys:
- "summary": one paragraph summarizing the event with attribution where applicable.
- "trigger": one sentence on what triggered or precipitated the event, or null if unknown.
- "background": one short paragraph of background context, or a placeholder if none can be inferred from inputs.
- "uncertainties": one sentence listing key uncertainties or conflicting reports, or null if none.`;
}

const DEFAULT_MODEL = "gpt-4o-mini";

/**
 * Call OpenAI Chat Completions and parse JSON response.
 * Requires OPENAI_API_KEY in env.
 */
export async function generateContextDraft(
  input: ContextDraftInput,
  options?: { model?: string; apiKey?: string }
): Promise<{ draft: ContextDraftOutput; model: string }> {
  const apiKey = options?.apiKey ?? process.env.OPENAI_API_KEY;
  if (!apiKey?.trim()) {
    throw new Error("OPENAI_API_KEY is required for context draft generation");
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
          content: "You output only valid JSON with keys: summary, trigger, background, uncertainties. No markdown, no code fence.",
        },
        { role: "user", content: prompt },
      ],
      temperature: 0.3,
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
    throw new Error("Empty response from OpenAI");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Invalid JSON from OpenAI: " + raw.slice(0, 200));
  }

  const summary = typeof (parsed as Record<string, unknown>).summary === "string" ? (parsed as Record<string, unknown>).summary as string : "";
  const trigger = (parsed as Record<string, unknown>).trigger;
  const background = typeof (parsed as Record<string, unknown>).background === "string" ? (parsed as Record<string, unknown>).background as string : "";
  const uncertainties = (parsed as Record<string, unknown>).uncertainties;

  const draft: ContextDraftOutput = {
    summary: summary || input.title,
    trigger: trigger !== undefined && trigger !== null && typeof trigger === "string" ? trigger : null,
    background: background || "Background context to be added.",
    uncertainties: uncertainties !== undefined && uncertainties !== null && typeof uncertainties === "string" ? uncertainties : null,
  };

  return { draft, model };
}
