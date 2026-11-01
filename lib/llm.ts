// Provider-agnostic LLM client. Uses whichever key is present:
//   ANTHROPIC_API_KEY (+ ANTHROPIC_MODEL), or
//   OPENAI_API_KEY (+ OPENAI_MODEL, OPENAI_BASE_URL for any OpenAI-compatible
//   API such as Groq, OpenRouter or Gemini's OpenAI endpoint).
// With no key, every caller falls back to deterministic rules, so the app,
// tests and evals still run.

export type LlmMessage = { role: "user" | "assistant"; content: string };

export function llmProvider(): "anthropic" | "openai" | "none" {
  if (process.env.SHIELD_FORCE_MOCK === "1" && process.env.SHIELD_EVAL_LLM !== "1") return "none";
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  if (process.env.OPENAI_API_KEY) return "openai";
  return "none";
}

export async function complete(system: string, messages: LlmMessage[], opts: { maxTokens?: number; images?: string[] } = {}): Promise<string | null> {
  const provider = llmProvider();
  const maxTokens = opts.maxTokens ?? 800;
  try {
    if (provider === "anthropic") {
      const content = (m: LlmMessage, isLast: boolean) => {
        if (!isLast || !opts.images?.length || m.role !== "user") return m.content;
        return [
          ...opts.images.map((dataUrl) => {
            const [meta, data] = dataUrl.split(",");
            const media_type = meta.match(/data:(.*?);/)?.[1] || "image/png";
            return { type: "image", source: { type: "base64", media_type, data } };
          }),
          { type: "text", text: m.content },
        ];
      };
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": process.env.ANTHROPIC_API_KEY!,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5",
          max_tokens: maxTokens,
          system,
          messages: messages.map((m, i) => ({ role: m.role, content: content(m, i === messages.length - 1) })),
        }),
      });
      if (!res.ok) throw new Error(`Anthropic ${res.status}: ${await res.text()}`);
      const j = (await res.json()) as { content: { type: string; text?: string }[] };
      return j.content.filter((c) => c.type === "text").map((c) => c.text).join("");
    }
    if (provider === "openai") {
      const base = process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";
      const last = messages.length - 1;
      const res = await fetch(`${base}/chat/completions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "content-type": "application/json" },
        body: JSON.stringify({
          model: process.env.OPENAI_MODEL || "gpt-4o-mini",
          max_tokens: maxTokens,
          messages: [
            { role: "system", content: system },
            ...messages.map((m, i) =>
              i === last && opts.images?.length && m.role === "user"
                ? { role: m.role, content: [...opts.images.map((url) => ({ type: "image_url", image_url: { url } })), { type: "text", text: m.content }] }
                : m,
            ),
          ],
        }),
      });
      if (!res.ok) throw new Error(`OpenAI-compatible ${res.status}: ${await res.text()}`);
      const j = (await res.json()) as { choices: { message: { content: string } }[] };
      return j.choices[0]?.message?.content ?? null;
    }
  } catch (e) {
    console.error("[llm] falling back to rules:", (e as Error).message);
  }
  return null;
}

/** Ask for JSON and parse it; returns null on any failure so callers fall back. */
export async function completeJSON<T>(system: string, user: string, opts: { maxTokens?: number; images?: string[] } = {}): Promise<T | null> {
  const text = await complete(system + "\nRespond with a single JSON object and nothing else.", [{ role: "user", content: user }], opts);
  if (!text) return null;
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]) as T;
  } catch {
    return null;
  }
}
