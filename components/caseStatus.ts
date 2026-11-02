import type { SupportCase } from "@/lib/types";
import type { Tone } from "./ui";

export const CASE_STATUS: Record<SupportCase["status"], { label: string; tone: Tone }> = {
  open: { label: "Open", tone: "accent" },
  reopened: { label: "Reopened", tone: "accent" },
  waiting_customer: { label: "Needs your reply", tone: "accent" },
  waiting_human: { label: "With a specialist", tone: "accent" },
  resolved: { label: "Resolved", tone: "success" },
};

export const WHO: Record<string, string> = { customer: "You", tier1: "Shield assistant", tier2: "Resolution agent", human: "Priya · Support", system: "" };
export const TIERS = ["Tier 1", "Resolution agent", "Specialist"];
