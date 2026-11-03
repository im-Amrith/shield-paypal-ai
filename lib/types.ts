// Shared domain types for Shield.

export type Persona = "meera" | "ravi" | "client" | "buyer" | "agent";

export interface User {
  id: Persona;
  name: string;
  email: string;
  role: "freelancer" | "senior" | "client" | "buyer" | "support";
  currency: string;
  guardianOf?: Persona; // e.g. meera is guardian of ravi
  guardedBy?: Persona;
}

export interface Notification {
  id: string;
  userId: Persona;
  at: string; // ISO
  title: string;
  body: string;
  kind: "freeze" | "risk" | "guardian" | "vault" | "invoice" | "support" | "info";
  link?: string;
  read: boolean;
  channel: ("push" | "email" | "in_app")[];
  attempt?: number; // re-notification count
}

export interface Transaction {
  id: string;
  userId: Persona;
  at: string;
  amount: number;
  currency: string;
  direction: "in" | "out";
  counterparty: string;
  country: string;
  type: "goods_services" | "friends_family" | "invoice" | "refund";
  memo?: string;
  disputed?: boolean;
  refunded?: boolean;
  captureId?: string; // PayPal capture id when the payment went through our app
  recurring?: boolean;
}

export type VaultStatus =
  | "created"
  | "authorized"
  | "shipped"
  | "delivered"
  | "released"
  | "disputed"
  | "voided"
  | "expired";

export interface VaultDeal {
  id: string;
  sellerId: Persona;
  buyerId?: Persona;
  title: string;
  amount: number;
  currency: string;
  status: VaultStatus;
  createdAt: string;
  paypalOrderId?: string;
  authorizationId?: string;
  authorizedAt?: string;
  /** Set when the hold was reauthorized after PayPal's 3-day honor period (allowed once, days 4–29). */
  reauthorizedAt?: string;
  captureId?: string;
  trackingNumber?: string;
  carrier?: string;
  shippedAt?: string;
  deliveredAt?: string;
  releasedAt?: string;
  disputeReason?: string;
  /** Tracking registered with PayPal against the capture (toolkit create_shipment_tracking, or Orders v2 /track).
   *  "pending" until the payment is released: PayPal doesn't accept tracking on an authorization. */
  paypalTracking?: { status: "pending" | "shared" | "failed"; via: string; at: string; detail?: string };
  autoReleaseHours: number;
  history: { at: string; event: string; detail?: string }[];
}

export interface Invoice {
  id: string;
  freelancerId: Persona;
  clientName: string;
  clientEmail: string;
  relationship: "new" | "regular" | "key_account";
  items: { name: string; amount: number }[];
  currency: string;
  issuedAt: string;
  dueAt: string;
  lateFeePercent: number; // agreed up front, 0 = none
  lateFeeApplied?: boolean;
  status: "draft" | "sent" | "paid" | "partially_paid" | "cancelled" | "disputed";
  amountPaid: number;
  paypalInvoiceId?: string;
  payLink?: string;
  reminders: { at: string; step: number; tone: string; subject: string; body: string }[];
  offerPayLater: boolean;
}

export interface GuardianHold {
  id: string;
  seniorId: Persona;
  guardianId: Persona;
  payee: string;
  amount: number;
  currency: string;
  note: string;
  createdAt: string;
  coolingOffUntil: string;
  reasons: string[];
  riskScore: number;
  status: "held" | "approved" | "blocked" | "cancelled_by_senior";
  decidedAt?: string;
}

export interface SupportMessage {
  at: string;
  from: "customer" | "tier1" | "tier2" | "human" | "system";
  text: string;
  sources?: { title: string; id: string }[];
}

export interface ProposedAction {
  id: string;
  tool: string;
  args: Record<string, unknown>;
  summary: string;
  decision: "auto" | "ask_customer" | "needs_human" | "blocked";
  reason: string;
  status: "pending" | "approved" | "denied" | "executed" | "failed";
  result?: string;
  /** Which PayPal integration ran it, e.g. "PayPal Agent Toolkit · create_refund". */
  via?: string;
}

export interface SupportCase {
  id: string;
  customerId: Persona;
  createdAt: string;
  updatedAt: string;
  tier: 1 | 2 | 3; // 3 = human has taken over
  status: "open" | "waiting_customer" | "waiting_human" | "resolved" | "reopened";
  category: string;
  summary: string;
  messages: SupportMessage[];
  actions: ProposedAction[];
  troubleshootAttempts: number;
  timeline: { at: string; label: string }[];
}

export interface Policy {
  userId: Persona;
  perOrderCap: number;
  monthlyCap: number;
  autoApproveBelow: number;
  refundHumanAbove: number;
  revoked: boolean;
}

// ---------- Shopping agent (Protect → /shop) ----------

export interface ShopItem {
  query: string; // what the user asked for, e.g. "rice 5kg"
  productId: string;
  title: string;
  brand?: string;
  price: number;
  currency: string;
  retailer: string;
  url?: string;
  image?: string;
  rating?: number;
  reason: string; // why the agent picked it
  source: "channel3" | "sample";
}

export interface ShopCart {
  id: string;
  userId: Persona;
  createdAt: string;
  need: string;
  budget?: number;
  monthly: boolean;
  items: ShopItem[];
  skipped: { query: string; why: string }[];
  total: number;
  currency: string;
  decision: "auto" | "ask_customer" | "needs_human" | "blocked";
  reason: string;
  status: "awaiting_payment" | "pending_approval" | "paid" | "blocked" | "declined";
  paypalOrderId?: string;
  captureId?: string;
  paidAt?: string;
  approvedAt?: string; // one-tap approval for carts above the auto-approve threshold
  reorderId?: string; // set when this cart came from a saved reorder
  source: "channel3" | "sample";
}

export interface Reorder {
  id: string;
  userId: Persona;
  need: string;
  budget?: number;
  items: { query: string; productId: string; title: string }[];
  createdAt: string;
  lastOrderedAt: string;
  everyDays: number;
  active: boolean;
  lastProposedAt?: string;
  notifiedAt?: string;
}

export interface DB {
  version: number;
  clockOffsetMs: number;
  users: User[];
  transactions: Transaction[];
  notifications: Notification[];
  vaultDeals: VaultDeal[];
  invoices: Invoice[];
  holds: GuardianHold[];
  cases: SupportCase[];
  policies: Policy[];
  carts?: ShopCart[];
  reorders?: Reorder[];
  outbox: { at: string; to: string; subject: string; body: string; provider: string }[];
  accountState: Record<string, { limited: boolean; limitedAt?: string; reasonCode?: string }>;
}
