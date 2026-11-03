// Provider-agnostic LLM client. Uses whichever key is present:
//   ANTHROPIC_API_KEY (+ ANTHROPIC_MODEL), or
//   OPENAI_API_KEY (+ OPENAI_MODEL, OPENAI_BASE_URL for any OpenAI-compatible
//   API such as Groq, OpenRouter or Gemini's OpenAI endpoint). Calls that carry
//   images use OPENAI_VISION_MODEL instead of OPENAI_MODEL.
// With no key, every caller falls back to deterministic rules, so the app,
// tests and evals still run.

export type LlmMessage = { role: "user" | "assistant"; content: string };

/** Groq (OpenAI-compatible) limits: at most 3 images per request, base64 images up to 4 MB. */
export const MAX_IMAGES = 3;
const MAX_IMAGE_DATA_URL = 4 * 1024 * 1024;
/** Low but non-zero: Groq rejects/normalizes 0, and 0.1–0.3 keeps the JSON answers stable. */
const TEMPERATURE = 0.2;
/** Longest Retry-After we'll wait before the single retry; longer means a daily limit, so fall back. */
const MAX_RETRY_WAIT_MS = 20_000;

export function openaiModel(hasImages: boolean): string {
  return hasImages
    ? process.env.OPENAI_VISION_MODEL || "qwen/qwen3.8-27b"
    : process.env.OPENAI_MODEL || "gpt-4o-mini";
}

/** Images we may send: data URLs/URLs under the size cap, at most MAX_IMAGES. */
export function usableImages(images?: string[]): string[] {
  const ok = (images || []).filter((u) => u.length <= MAX_IMAGE_DATA_URL);
  if (images && ok.length < images.length) console.warn(`[llm] dropped ${images.length - ok.length} image(s) over 4 MB`);
  return ok.slice(0, MAX_IMAGES);
}

/** Seconds (or an HTTP date) from Retry-After, in ms; defaults to 2 s when absent or unparseable. */
export function retryAfterMs(header: string | null, nowMs = Date.now()): number {
  if (!header) return 2000;
  const secs = Number(header);
  if (Number.isFinite(secs)) return Math.max(0, secs * 1000);
  const at = Date.parse(header);
  return Number.isNaN(at) ? 2000 : Math.max(0, at - nowMs);
}

/** POST once; on HTTP 429 wait for Retry-After and try exactly once more. */
async function postWithRetry(url: string, init: RequestInit): Promise<Response> {
  const res = await fetch(url, init);
  if (res.status !== 429) return res;
  const wait = retryAfterMs(res.headers.get("retry-after"));
  if (wait > MAX_RETRY_WAIT_MS) return res; // a long wait means a daily/token cap: fall back to rules now
  await new Promise((r) => setTimeout(r, wait));
  return fetch(url, init);
}

/** Reasoning models (Qwen3 on Groq) may inline <think>…</think>; callers only want the answer. */
function stripThinking(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
}

export function llmProvider(): "anthropic" | "openai" | "none" {
  if (process.env.SHIELD_FORCE_MOCK === "1" && process.env.SHIELD_EVAL_LLM !== "1") return "none";
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  if (process.env.OPENAI_API_KEY) return "openai";
  return "none";
}

export async function complete(system: string, messages: LlmMessage[], opts: { maxTokens?: number; images?: string[] } = {}): Promise<string | null> {
  const provider = llmProvider();
  const maxTokens = opts.maxTokens ?? 800;
  const images = usableImages(opts.images);
  try {
    if (provider === "anthropic") {
      const content = (m: LlmMessage, isLast: boolean) => {
        if (!isLast || !images.length || m.role !== "user") return m.content;
        return [
          ...images.map((dataUrl) => {
            const [meta, data] = dataUrl.split(",");
            const media_type = meta.match(/data:(.*?);/)?.[1] || "image/png";
            return { type: "image", source: { type: "base64", media_type, data } };
          }),
          { type: "text", text: m.content },
        ];
      };
      const res = await postWithRetry("https://api.anthropic.com/v1/messages", {
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
      const res = await postWithRetry(`${base}/chat/completions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "content-type": "application/json" },
        body: JSON.stringify(openaiBody(system, messages, maxTokens, images)),
      });
      if (!res.ok) throw new Error(`OpenAI-compatible ${res.status}: ${(await res.text()).slice(0, 300)}`);
      const j = (await res.json()) as { choices: { message: { content: string | null } }[] };
      const text = j.choices[0]?.message?.content;
      return text ? stripThinking(text) : null;
    }
  } catch (e) {
    console.error("[llm] falling back to rules:", (e as Error).message);
  }
  return null;
}

/**
 * Chat Completions body. Only fields Groq accepts: no logprobs, logit_bias, n or messages[].name
 * (each is a 400 there), and messages are rebuilt as plain {role, content}.
 */
export function openaiBody(system: string, messages: LlmMessage[], maxTokens: number, images: string[] = []) {
  const last = messages.length - 1;
  const model = openaiModel(images.length > 0);
  return {
    model,
    max_tokens: maxTokens,
    temperature: TEMPERATURE,
    // Groq reasoning models: keep the reasoning out of the answer and out of the token budget.
    ...(model.startsWith("openai/gpt-oss") ? { reasoning_effort: "low" } : {}),
    ...(model.startsWith("qwen/") ? { reasoning_format: "hidden" } : {}),
    messages: [
      { role: "system", content: system },
      ...messages.map((m, i) =>
        i === last && images.length && m.role === "user"
          ? { role: m.role, content: [...images.map((url) => ({ type: "image_url", image_url: { url } })), { type: "text", text: m.content }] }
          : { role: m.role, content: m.content },
      ),
    ],
  };
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
