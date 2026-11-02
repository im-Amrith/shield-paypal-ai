// One catalogue of Shield's tools, shared by the mega-menu, the landing page and the breadcrumbs.

export type ArtId = "scan" | "vault" | "guardian" | "subs" | "invoice" | "fx" | "health" | "voice" | "console" | "rules";
export type PillarId = "protect" | "getpaid" | "resolve";

export interface Tool { id: string; title: string; tag?: string; desc: string; href: string; art: ArtId; public?: boolean }
export interface Pillar { id: PillarId; label: string; href: string; blurb: string; tools: Tool[] }

export const PILLARS: Pillar[] = [
  {
    id: "protect", label: "Protect", href: "/protect", blurb: "Stop scams before the money moves.",
    tools: [
      { id: "scan", title: "Scam check", tag: "AI", desc: "Paste a chat or screenshot before you pay", href: "/protect/scan", art: "scan" },
      { id: "vault", title: "Vault escrow", tag: "PayPal Authorize", desc: "Money released only after delivery", href: "/vault", art: "vault" },
      { id: "guardian", title: "Guardian mode", tag: "Family", desc: "Unusual payments wait for a trusted relative", href: "/guardian", art: "guardian" },
      { id: "subs", title: "Subscriptions", desc: "Find repeat charges you forgot", href: "/subscriptions", art: "subs" },
    ],
  },
  {
    id: "getpaid", label: "Get Paid", href: "/get-paid", blurb: "Invoice once. The agent does the chasing.",
    tools: [
      { id: "invoices", title: "Invoices & collections agent", tag: "Agent", desc: "Send once, the agent chases politely", href: "/get-paid", art: "invoice" },
      { id: "fx", title: "FX copilot", desc: "See what you keep in each currency", href: "/get-paid#fx", art: "fx" },
      { id: "health", title: "Account health", tag: "Early warning", desc: "Know why before a freeze", href: "/get-paid/account", art: "health" },
    ],
  },
  {
    id: "resolve", label: "Resolve", href: "/support", blurb: "Support that fixes it, with a person when it matters.",
    tools: [
      { id: "support", title: "AI support", tag: "Voice", desc: "Speak or type in English, हिन्दी, മലയാളം", href: "/support", art: "voice" },
      { id: "console", title: "Support console", tag: "Specialists", desc: "Approve risky actions or take over", href: "/console", art: "console" },
      { id: "rules", title: "How decisions are made", desc: "The guardrails engine", href: "/#guardrails", art: "rules", public: true },
    ],
  },
];

export const ALL_TOOLS = PILLARS.flatMap((p) => p.tools);

/** Where a tool link goes for this visitor: signed-out visitors sign in first, then land on the tool. */
export function toolHref(t: { href: string; public?: boolean }, signedIn: boolean) {
  return signedIn || t.public ? t.href : `/signin?next=${encodeURIComponent(t.href)}`;
}

/** Breadcrumb trail for an app path: ancestors plus the current page. */
export function crumbsFor(path: string): { href?: string; label: string }[] {
  const P = { protect: { href: "/protect", label: "Protect" }, getpaid: { href: "/get-paid", label: "Get Paid" }, resolve: { href: "/support", label: "Resolve" } };
  const seg = path.split("/").filter(Boolean);
  const detail = seg.length > 1;
  switch (seg[0]) {
    case "protect": return seg[1] === "scan" ? [P.protect, { label: "Scam check" }] : [{ label: "Protect" }];
    case "vault": return detail ? [P.protect, { href: "/vault", label: "Vault" }, { label: "Deal" }] : [P.protect, { label: "Vault" }];
    case "guardian": return detail ? [P.protect, { href: "/guardian", label: "Guardian mode" }, { label: "Payment check" }] : [P.protect, { label: "Guardian mode" }];
    case "subscriptions": return [P.protect, { label: "Subscriptions" }];
    case "get-paid":
      if (seg[1] === "account") return [P.getpaid, { label: "Account health" }];
      if (seg[1] === "pay") return [{ href: "/app", label: "Invoices" }, { label: "Pay invoice" }];
      return [{ label: "Get Paid" }];
    case "support": return [{ label: "Resolve" }, { label: "AI support" }];
    case "console": return [{ label: "Resolve" }, { label: "Support console" }];
    case "alerts": return [{ href: "/app", label: "Home" }, { label: "Alerts" }];
    case "demo": return [{ href: "/app", label: "Home" }, { label: "Demo controls" }];
    default: return [];
  }
}
