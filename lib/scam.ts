// Pre-payment scam check. Deterministic rules first (fast, explainable,
// testable), optionally refined by an LLM that can also read screenshots.
import { completeJSON, llmProvider } from "./llm";

export interface Signal {
  id: string;
  label: string;
  why: string;
  weight: number;
  excerpt?: string;
}

export interface ScamResult {
  score: number; // 0-100
  level: "low" | "medium" | "high";
  signals: Signal[];
  advice: string;
  recommendVault: boolean;
  explanation?: string;
  source: "rules" | "rules+ai";
}

interface Rule {
  id: string;
  label: string;
  why: string;
  weight: number;
  re: RegExp;
}

export const RULES: Rule[] = [
  { id: "ff_request", label: "Asks for Friends & Family", weight: 0.45,
    why: "Friends & Family payments have no Purchase Protection, so you can't get your money back if the item never arrives.",
    re: /friends?\s*(&|and|n)\s*family|\bf\s?&\s?f\b|\bfnf\b|gift(ed)? payment|send (it )?as (a )?(gift|friend)|personal payment|(avoid|save|skip|no) (the )?(paypal )?fees?/i },
  { id: "credentials", label: "Asks for a code or password", weight: 0.6,
    why: "No real buyer, seller or official ever needs your OTP, PIN or password.",
    re: /\b(otp|one[- ]time (password|code)|verification code|security code|upi pin|atm pin|share (your|the) pin|passwords?|login details)\b/i },
  { id: "overpayment", label: "Overpayment or refund-the-difference", weight: 0.5,
    why: "Overpaying and asking you to send back the difference is a classic scam; the original payment gets reversed later.",
    re: /over ?pa(id|y|yment)|sent (you )?(extra|more than)|refund (me )?the (difference|extra|balance)|send (me )?back the (extra|difference|balance)/i },
  { id: "gift_card_crypto", label: "Gift cards or crypto", weight: 0.5,
    why: "Gift cards and crypto can't be reversed. Legitimate sellers and agencies don't ask for them.",
    re: /gift ?cards?|itunes|google play (card|code)|steam (card|wallet)|amazon (card|voucher)|bitcoin|\bcrypto|\busdt\b|\bbtc\b|binance/i },
  { id: "authority", label: "Claims to be an authority", weight: 0.45,
    why: "Tax offices, police and courts never demand payment over chat or a call, and never threaten arrest to get it.",
    re: /tax (office|department|officer)|income tax|\birs\b|\bhmrc\b|\bpolice\b|arrest|warrant|customs (fee|duty|clearance)|\bcourt\b|legal action|\bcbi\b|narcotics|digital arrest|parcel (has been |was )?seized/i },
  { id: "prize", label: "Prize or lottery", weight: 0.45,
    why: "You can't win a prize you didn't enter, and real prizes never charge a fee to release.",
    re: /you('ve| have)? won|lottery|lucky draw|claim (your )?(prize|reward)|processing fee to release|release (the )?(prize|funds)/i },
  { id: "romance", label: "Romance and money", weight: 0.4,
    why: "Someone you've only met online asking for money for an emergency is the core pattern of romance scams.",
    re: /my (love|darling|sweetheart|dear(est)?)|i love you|soul ?mate|marry you|stuck at (the )?airport|hospital bills?|visa fee|send (me )?money (so i can|to) (come|see)/i },
  { id: "utility_threat", label: "Threat to cut a service", weight: 0.4,
    why: "Electricity, gas and phone companies don't threaten same-day disconnection over SMS or calls and ask you to pay an 'officer'.",
    re: /(electricity|power|gas|water|mobile|sim|connection)( supply)? (will be |is being )?(disconnect|cut|block|suspend)|disconnection (tonight|today)/i },
  { id: "job_scam", label: "Easy-money job offer", weight: 0.35,
    why: "Jobs that pay a lot for simple tasks and ask you to pay first are a common trap.",
    re: /work from home.*earn|earn (rs\.? ?|₹|\$)?\d[\d,]* (daily|per day|a day)|liking (videos|posts)|task[- ]based (job|work)|guaranteed returns?/i },
  { id: "suspicious_link", label: "Suspicious link", weight: 0.4,
    why: "Shortened or look-alike links often lead to fake payment pages that steal logins.",
    re: /(bit\.ly|tinyurl\.com|t\.me|rb\.gy|cutt\.ly|is\.gd)\/|paypa1|pay-?pal[-_.](?!com\b)[a-z0-9-]+\.[a-z]{2,}|paypal\.[a-z]+-[a-z]+/i },
  { id: "shipping_agent", label: "Third-party \"shipping agent\"", weight: 0.3,
    why: "Buyers who send their own courier or 'agent' usually plan to claim the item never arrived.",
    re: /(my|our) (shipping |courier )?agent|courier will (collect|pick)|pick ?up agent|shipping company will (contact|email)/i },
  { id: "advance_fee", label: "Pay upfront / deposit first", weight: 0.25,
    why: "Being asked to pay a token or deposit before seeing anything is common in rental and job scams.",
    re: /advance (payment|fee)|token amount|booking amount|(pay|send) (a )?deposit (first|before)|pay (first|upfront|in advance)|registration fee/i },
  { id: "urgency", label: "Pressure to act fast", weight: 0.2,
    why: "Scammers rush you so you don't stop to check.",
    re: /\burgent(ly)?\b|immediately|right now|within (the next )?\d+ ?(min|mins|minutes|hours?)|today only|last chance|act fast|hurry|\basap\b|before (it'?s )?too late|or else/i },
  { id: "off_platform", label: "Moves you off the platform", weight: 0.15,
    why: "Moving the chat to WhatsApp or Telegram takes you away from the marketplace's protections.",
    re: /whats ?app|telegram|signal app|text me (at|on)|email me (at|on)|contact me (on|at)|call me (on|at)/i },
  { id: "unverifiable", label: "Can't meet or verify", weight: 0.2,
    why: "A seller who is 'abroad' or 'on deployment' can't be verified and won't be reachable later.",
    re: /(i('| a)?m|currently) (abroad|overseas|offshore|on a ship|deployed|out of (the )?country)|can'?t (meet|talk on the phone|video call)/i },
  { id: "too_good", label: "Price too good to be true", weight: 0.2,
    why: "Far-below-market prices are bait.",
    re: /(way |far )?below (market|retail)|too good to be true|almost free|\b(80|85|90|95)% off|half (the )?price.*(sealed|brand new)|(sealed|brand new).*half (the )?price/i },
];

function excerpt(text: string, m: RegExpMatchArray): string {
  const i = m.index ?? 0;
  const start = Math.max(0, i - 30);
  const end = Math.min(text.length, i + m[0].length + 30);
  return (start > 0 ? "…" : "") + text.slice(start, end).replace(/\s+/g, " ").trim() + (end < text.length ? "…" : "");
}

export function levelFor(score: number): ScamResult["level"] {
  return score >= 60 ? "high" : score >= 30 ? "medium" : "low";
}

export function scoreRules(text: string): Omit<ScamResult, "source"> {
  const signals: Signal[] = [];
  for (const r of RULES) {
    const m = text.match(r.re);
    if (m) signals.push({ id: r.id, label: r.label, why: r.why, weight: r.weight, excerpt: excerpt(text, m) });
  }
  // Probabilistic OR: several weak signals add up, one strong one dominates.
  let p = 1 - signals.reduce((acc, s) => acc * (1 - s.weight), 1);
  const asksGoodsAndServices = /goods (and|&) services|buyer protection|via (a )?paypal invoice/i.test(text);
  if (asksGoodsAndServices && !signals.some((s) => s.id === "ff_request")) p = Math.max(0, p - 0.1);
  const score = Math.round(Math.min(1, p) * 100);
  const level = levelFor(score);
  const recommendVault = signals.some((s) => ["ff_request", "shipping_agent", "unverifiable", "advance_fee", "too_good", "off_platform"].includes(s.id));
  const advice =
    level === "high"
      ? "Don't send money. This matches known scam patterns. If it's a real sale, insist on a Vault payment so funds release only after delivery."
      : level === "medium"
        ? "Be careful. Pay only with Goods & Services or a Vault link, never Friends & Family, and keep the chat on the marketplace."
        : "No strong scam signals found. Still pay with Goods & Services so you're covered by Purchase Protection.";
  return { score, level, signals, advice, recommendVault };
}

export async function checkScam(text: string, image?: string): Promise<ScamResult> {
  const base = scoreRules(text);
  if (llmProvider() === "none") return { ...base, source: "rules" };
  const ai = await completeJSON<{ score: number; red_flags: string[]; explanation: string }>(
    `You are a payments fraud analyst protecting a consumer before they pay someone. Assess scam risk in the chat or listing.
Return {"score": 0-100, "red_flags": [short strings], "explanation": "2 plain sentences for a non-expert"}.
Consider: Friends & Family requests, overpayment, gift cards/crypto, impersonating authorities, romance, urgency, off-platform moves, fake shipping agents, look-alike links, OTP requests.`,
    `Rule engine found: ${base.signals.map((s) => s.label).join(", ") || "nothing"} (score ${base.score}).\n\nContent:\n"""${text.slice(0, 6000)}"""`,
    { images: image ? [image] : undefined, maxTokens: 400 },
  );
  if (!ai || typeof ai.score !== "number") return { ...base, source: "rules" };
  // The LLM may raise risk (e.g. from a screenshot) but only lowers it a little,
  // so a confident rule hit can't be talked away by clever wording.
  const aiScore = Math.min(100, Math.max(0, ai.score));
  const score =
    aiScore >= base.score
      ? Math.round(0.4 * base.score + 0.6 * aiScore)
      : Math.max(base.score - 10, Math.round((base.score + aiScore) / 2));
  const extra = (ai.red_flags || [])
    .filter((f) => !base.signals.some((s) => f.toLowerCase().includes(s.label.toLowerCase().split(" ")[0])))
    .slice(0, 3)
    .map((f, i) => ({ id: `ai_${i}`, label: f, why: "Flagged by the AI review.", weight: 0 }));
  const level = levelFor(score);
  return { ...base, score, level, signals: [...base.signals, ...extra], explanation: ai.explanation, source: "rules+ai" };
}
