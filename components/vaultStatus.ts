import type { VaultDeal } from "@/lib/types";
import type { Tone } from "./ui";

export const VAULT_STEPS = ["Created", "Paid & held", "Shipped", "Delivered", "Released"];
export const vaultStage = (s: VaultDeal["status"]) =>
  ({ created: 0, authorized: 1, shipped: 2, delivered: 3, released: 4, disputed: 3, voided: 1, expired: 1 })[s];
export const vaultStatus: Record<VaultDeal["status"], { label: string; tone: Tone }> = {
  created: { label: "Waiting for buyer", tone: "neutral" },
  authorized: { label: "Paid & held", tone: "accent" },
  shipped: { label: "Shipped", tone: "accent" },
  delivered: { label: "Delivered", tone: "accent" },
  released: { label: "Released", tone: "success" },
  disputed: { label: "Disputed", tone: "danger" },
  voided: { label: "Cancelled", tone: "neutral" },
  expired: { label: "Expired", tone: "neutral" },
};
