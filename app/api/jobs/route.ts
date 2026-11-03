import { NextResponse } from "next/server";
import { runJobs } from "@/lib/jobs";

// Point a cron job (e.g. Render Cron, every 15 min) at GET /api/jobs?key=CRON_SECRET
export async function GET(req: Request) {
  const key = new URL(req.url).searchParams.get("key");
  if (process.env.CRON_SECRET && key !== process.env.CRON_SECRET) return NextResponse.json({ ok: false }, { status: 401 });
  // Always 200 with the run report: per-record failures are in `errors`, never a failed request.
  return NextResponse.json({ ok: true, ...(await runJobs()) });
}
