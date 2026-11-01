import { handle } from "@/lib/http";
import { markRead } from "@/lib/notify";

export const POST = handle(async (b) => {
  markRead(String(b.id));
  return true;
});
