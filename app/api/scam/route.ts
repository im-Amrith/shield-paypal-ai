import { handle } from "@/lib/http";
import { checkScam } from "@/lib/scam";

export const POST = handle(async (b) => {
  const text = String(b.text || "").slice(0, 8000);
  const image = typeof b.image === "string" && b.image.startsWith("data:image/") && b.image.length < 6_000_000 ? b.image : undefined;
  if (!text.trim() && !image) throw new Error("Paste a message or add a screenshot");
  return checkScam(text || "(see screenshot)", image);
});
