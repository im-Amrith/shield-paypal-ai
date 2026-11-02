import Link from "next/link";
import { buttonClass } from "@/components/styles";

export default function NotFound() {
  return (
    <div className="max-w-xl">
      <h1 className="text-[24px] font-semibold">That page doesn&apos;t exist</h1>
      <p className="mt-2 text-muted">The link may be old, or the deal or invoice was removed when the demo was reset.</p>
      <Link href="/" className={`${buttonClass("primary")} mt-5`}>Go home</Link>
    </div>
  );
}
