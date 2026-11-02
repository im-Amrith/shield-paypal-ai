import Link from "next/link";
import { buttonClass } from "@/components/styles";

export default function NotFound() {
  return (
    <main id="main" className="mx-auto max-w-xl px-4 pb-20 pt-32">
      <h1 className="text-[24px] font-semibold">That page doesn&apos;t exist</h1>
      <p className="mt-2 text-muted">The link may be old, or the deal or invoice was removed when the demo was reset.</p>
      <Link href="/app" className={`${buttonClass("primary")} mt-5`}>Go to Shield</Link>
    </main>
  );
}
