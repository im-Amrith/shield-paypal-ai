// Pure class-name helpers, safe to call from server and client components.

const btn = {
  /** Orange (dark) / blue (light) fill. Text is near-black on orange for contrast. */
  primary: "bg-accent text-on-accent hover:bg-accent-2",
  accent: "bg-accent text-on-accent hover:bg-accent-2",
  secondary: "border border-fg/70 bg-transparent text-fg hover:bg-raised",
  /** Outlined red: white on #EF4444 is under 4.5:1, so the colour goes on the text and edge. */
  danger: "border border-danger bg-transparent text-danger hover:bg-danger-tint",
  quiet: "text-accent hover:bg-accent-tint",
  safe: "bg-accent text-on-accent hover:bg-accent-2",
};
export type ButtonVariant = keyof typeof btn;

export function buttonClass(variant: ButtonVariant = "primary", full = false, size: "md" | "lg" = "md") {
  const h = size === "lg" ? "min-h-14 px-6 text-[17px]" : "min-h-11 px-5 text-[15px]";
  return `press inline-flex items-center justify-center gap-2 rounded-control font-bold disabled:cursor-not-allowed disabled:opacity-45 ${h} ${btn[variant]} ${full ? "w-full" : ""}`;
}

export const inputClass = "w-full min-h-11 rounded-control border border-border bg-raised px-3.5 py-2.5 text-[15px] text-fg placeholder:text-muted hover:border-muted/60 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/40";
export const labelClass = "block text-[14px] font-semibold text-fg";
