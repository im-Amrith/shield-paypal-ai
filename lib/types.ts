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
  captureId?: string;
  trackingNumber?: string;
  carrier?: string;
  shippedAt?: string;
  deliveredAt?: string;
  releasedAt?: string;
  disputeReason?: string;
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
  outbox: { at: string; to: string; subject: string; body: string; provider: string }[];
  accountState: Record<string, { limited: boolean; limitedAt?: string; reasonCode?: string }>;
}
