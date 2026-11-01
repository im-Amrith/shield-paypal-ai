// Support knowledge base. Short articles written in our own words from
// PayPal's public help topics; each step is cited back to the customer.
// Replace or extend with real help-center content for production.

export interface Article {
  id: string;
  title: string;
  category: string;
  keywords: string[];
  steps: string[];
  url: string;
}

export const KB: Article[] = [
  {
    id: "kb-limited", title: "Why is my account limited and how do I fix it?", category: "limitation",
    keywords: ["limited", "limitation", "frozen", "freeze", "hold", "locked", "restricted", "suspended", "180", "review"],
    steps: [
      "Open the Resolution Center (or the bell icon) and look for the limitation notice; it lists exactly what PayPal needs.",
      "Upload what's asked: usually ID, proof of address, invoices or proof of delivery.",
      "Reviews usually finish within a few business days after documents are uploaded.",
      "If funds are held for up to 180 days, it is to cover possible refunds; you'll be emailed when they are released.",
    ],
    url: "https://www.paypal.com/smarthelp/topic/account-access",
  },
  {
    id: "kb-not-received", title: "I paid but never received the item", category: "refund",
    keywords: ["never", "received", "arrive", "arrived", "delivered", "item", "order", "refund", "money back", "seller", "not received", "missing"],
    steps: [
      "First message the seller from the transaction details; many issues resolve there.",
      "If there's no answer, open a dispute in the Resolution Center within 180 days of payment.",
      "Choose 'I didn't receive an item'. If not resolved in 20 days, escalate it to a claim and PayPal decides.",
      "Payments sent as Friends & Family aren't covered by Purchase Protection.",
    ],
    url: "https://www.paypal.com/smarthelp/topic/disputes-and-limitations",
  },
  {
    id: "kb-unauthorized", title: "I see a payment I didn't make", category: "unauthorized",
    keywords: ["unauthorized", "didn't make", "not me", "hacked", "stolen", "unknown", "fraud", "someone used", "recognize"],
    steps: [
      "Change your PayPal password and security questions now, and turn on 2-step verification.",
      "Report the transaction as unauthorized in the Resolution Center within 60 days.",
      "Remove any cards or banks you don't recognize from your wallet.",
      "Check your email for login alerts and change that password too.",
    ],
    url: "https://www.paypal.com/smarthelp/topic/security",
  },
  {
    id: "kb-auto-payments", title: "Stop a subscription or automatic payment", category: "subscription",
    keywords: ["subscription", "automatic", "recurring", "cancel", "auto pay", "renewal", "monthly", "charged again", "billing agreement"],
    steps: [
      "Go to Settings → Payments → Manage automatic payments.",
      "Select the merchant and choose Cancel.",
      "This stops PayPal paying them; also cancel your account with the merchant so they don't bill another way.",
      "If you were charged after cancelling, open a dispute for a 'billing problem'.",
    ],
    url: "https://www.paypal.com/smarthelp/topic/payments",
  },
  {
    id: "kb-pending", title: "Why is my payment pending or on hold?", category: "payment_pending",
    keywords: ["pending", "on hold", "unclaimed", "waiting", "available", "release", "held payment"],
    steps: [
      "Payments to new sellers can be held up to 21 days; adding tracking or confirming delivery releases them sooner.",
      "Unclaimed payments wait for the recipient to accept or create an account (30 days).",
      "eCheck payments take 3–5 business days to clear.",
    ],
    url: "https://www.paypal.com/smarthelp/topic/payments",
  },
  {
    id: "kb-withdraw", title: "My bank withdrawal hasn't arrived", category: "withdrawal",
    keywords: ["withdraw", "withdrawal", "transfer to bank", "bank", "hasn't arrived", "payout", "transfer"],
    steps: [
      "Standard transfers take 1–3 business days (longer around holidays).",
      "Check the bank details in your wallet; a returned transfer comes back to your balance in 5–7 days.",
      "In India, payments received are transferred to your bank automatically.",
    ],
    url: "https://www.paypal.com/smarthelp/topic/wallet",
  },
  {
    id: "kb-fees", title: "Fees and currency conversion", category: "fees",
    keywords: ["fee", "fees", "charge", "conversion", "exchange rate", "currency", "deducted", "less than"],
    steps: [
      "Open the transaction details to see the fee and the exchange rate used.",
      "Cross-border and conversion fees apply when currencies differ.",
      "To lower conversion costs, invoice in the currency you'll keep, or choose to be billed by your card issuer where offered.",
    ],
    url: "https://www.paypal.com/myaccount/about/fees",
  },
  {
    id: "kb-scam", title: "I think I've been scammed", category: "scam",
    keywords: ["scam", "scammed", "fake", "tricked", "gift card", "phishing", "romance", "tax office", "otp"],
    steps: [
      "Stop sending money and don't share codes or passwords with anyone.",
      "If you paid with Goods & Services, open a dispute right away.",
      "Report the email or message to phishing@paypal.com and change your password.",
      "If you paid with gift cards or crypto, contact the card issuer or exchange and your local cybercrime line quickly.",
    ],
    url: "https://www.paypal.com/smarthelp/topic/security",
  },
  {
    id: "kb-dispute", title: "Respond to a dispute as a seller", category: "dispute",
    keywords: ["dispute", "claim", "chargeback", "buyer opened", "case", "respond", "seller protection"],
    steps: [
      "Respond in the Resolution Center within 10 days, or the case may close in the buyer's favor.",
      "Upload proof of delivery or of the service provided (files, messages, sign-off).",
      "Offer a partial refund if it's fair; many buyers accept and close the case.",
    ],
    url: "https://www.paypal.com/smarthelp/topic/disputes-and-limitations",
  },
  {
    id: "kb-login", title: "I can't log in", category: "login",
    keywords: ["login", "log in", "password", "locked out", "can't sign in", "2fa", "code not received", "access"],
    steps: [
      "Use 'Having trouble logging in?' to reset your password.",
      "If the security code doesn't arrive, choose another verification method.",
      "Never share a code sent to you; PayPal staff will never ask for it.",
    ],
    url: "https://www.paypal.com/smarthelp/topic/account-access",
  },
];

const tokenize = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s']/g, " ").split(/\s+/).filter(Boolean);

/** Keyword + phrase retrieval. Small KB, so this is plenty and fully offline. */
export function retrieve(query: string, k = 2): { article: Article; score: number }[] {
  const q = query.toLowerCase();
  const qTokens = new Set(tokenize(q));
  return KB.map((article) => {
    let score = 0;
    for (const kw of article.keywords) {
      if (kw.includes(" ")) score += q.includes(kw) ? 3 : 0;
      else if (qTokens.has(kw)) score += 2;
    }
    for (const t of tokenize(article.title)) if (t.length > 3 && qTokens.has(t)) score += 0.5;
    return { article, score };
  })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}
