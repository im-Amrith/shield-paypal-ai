import { describe, it, expect, afterEach, vi } from "vitest";
import { complete, openaiBody, openaiModel, retryAfterMs, usableImages, MAX_IMAGES } from "@/lib/llm";

const ENV = { ...process.env };
afterEach(() => {
  process.env = { ...ENV };
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function useGroq() {
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.SHIELD_FORCE_MOCK;
  process.env.OPENAI_API_KEY = "test";
  process.env.OPENAI_BASE_URL = "https://api.groq.com/openai/v1";
  process.env.OPENAI_MODEL = "openai/gpt-oss-120b";
  delete process.env.OPENAI_VISION_MODEL;
}

const ok = (content: string) => new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });

describe("OpenAI-compatible (Groq) client", () => {
  it("uses the vision model only when images are attached", () => {
    useGroq();
    expect(openaiModel(false)).toBe("openai/gpt-oss-120b");
    expect(openaiModel(true)).toBe("qwen/qwen3.8-27b");
    process.env.OPENAI_VISION_MODEL = "some/vision";
    expect(openaiBody("s", [{ role: "user", content: "hi" }], 100, ["data:image/jpeg;base64,AAAA"]).model).toBe("some/vision");
  });

  it("never sends fields Groq rejects, and uses a low non-zero temperature", () => {
    useGroq();
    const msgs = [{ role: "user", content: "hi", name: "meera" }] as unknown as Parameters<typeof openaiBody>[1];
    const body = openaiBody("sys", msgs, 100) as Record<string, unknown>;
    for (const k of ["logprobs", "top_logprobs", "logit_bias", "n"]) expect(body).not.toHaveProperty(k);
    for (const m of body.messages as Record<string, unknown>[]) expect(m).not.toHaveProperty("name");
    expect(body.temperature).toBeGreaterThanOrEqual(0.1);
    expect(body.temperature).toBeLessThanOrEqual(0.3);
  });

  it("sends at most 3 images and drops any over 4 MB", () => {
    const small = "data:image/jpeg;base64,AAAA";
    const huge = "data:image/jpeg;base64," + "A".repeat(4 * 1024 * 1024);
    expect(usableImages([small, small, small, small, small])).toHaveLength(MAX_IMAGES);
    expect(usableImages([huge, small])).toEqual([small]);
  });

  it("parses Retry-After as seconds or an HTTP date", () => {
    expect(retryAfterMs("3")).toBe(3000);
    expect(retryAfterMs(null)).toBe(2000);
    const now = Date.parse("2026-11-03T10:00:00Z");
    expect(retryAfterMs("Tue, 03 Nov 2026 10:00:05 GMT", now)).toBe(5000);
  });

  it("retries once on 429 after Retry-After, then succeeds", async () => {
    useGroq();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response("{}", { status: 429, headers: { "retry-after": "0" } }))
      .mockResolvedValueOnce(ok("<think>hmm</think>{\"a\":1}"));
    vi.stubGlobal("fetch", fetchMock);
    expect(await complete("s", [{ role: "user", content: "x" }])).toBe("{\"a\":1}");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("falls back (null) after a second 429, without a third try", async () => {
    useGroq();
    const fetchMock = vi.fn().mockImplementation(async () => new Response("{}", { status: 429, headers: { "retry-after": "0" } }));
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(await complete("s", [{ role: "user", content: "x" }])).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("doesn't wait out a long Retry-After (daily cap): falls back at once", async () => {
    useGroq();
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 429, headers: { "retry-after": "600" } }));
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(await complete("s", [{ role: "user", content: "x" }])).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
