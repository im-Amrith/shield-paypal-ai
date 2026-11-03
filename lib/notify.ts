// Notifications: in-app + email (Resend if RESEND_API_KEY is set, otherwise
// recorded in the demo outbox) + web push placeholder (in-app badge).
import { mutate, uid, db } from "./store";
import { nowIso } from "./clock";
import { publicUrl } from "./url";
import type { Notification, Persona } from "./types";

export async function sendEmail(to: string, subject: string, body: string): Promise<"resend" | "outbox"> {
  let provider: "resend" | "outbox" = "outbox";
  if (process.env.RESEND_API_KEY && process.env.SHIELD_FORCE_MOCK !== "1") {
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "content-type": "application/json" },
        body: JSON.stringify({
          from: process.env.EMAIL_FROM || "Shield <onboarding@resend.dev>",
          to: process.env.DEMO_EMAIL_OVERRIDE || to,
          subject,
          text: body,
        }),
      });
      if (res.ok) provider = "resend";
      else console.error("[email] resend failed", res.status, await res.text());
    } catch (e) {
      console.error("[email] resend error", (e as Error).message);
    }
  }
  mutate((d) => {
    d.outbox.unshift({ at: nowIso(), to, subject, body, provider });
    d.outbox = d.outbox.slice(0, 200);
  });
  return provider;
}

export async function notify(
  userId: Persona,
  n: Pick<Notification, "title" | "body" | "kind" | "link"> & { email?: boolean; attempt?: number },
): Promise<Notification> {
  const user = db().users.find((u) => u.id === userId);
  const channel: Notification["channel"] = ["in_app", "push"];
  if (n.email && user) {
    await sendEmail(user.email, n.title, `${n.body}\n\n${n.link ? `Open in Shield: ${publicUrl(n.link)}` : ""}`);
    channel.push("email");
  }
  const note: Notification = {
    id: uid("ntf"), userId, at: nowIso(), title: n.title, body: n.body, kind: n.kind, link: n.link,
    read: false, channel, attempt: n.attempt ?? 1,
  };
  mutate((d) => {
    d.notifications.unshift(note);
  });
  return note;
}

export function markRead(id: string) {
  mutate((d) => {
    const n = d.notifications.find((x) => x.id === id);
    if (n) n.read = true;
  });
}
