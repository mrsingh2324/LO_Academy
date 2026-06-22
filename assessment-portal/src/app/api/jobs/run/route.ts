import { NextResponse } from "next/server";
import { runDueJobs } from "@/lib/jobs";
import { getActor } from "@/lib/auth";

// Promote due scheduled_jobs (§5.7). In prod this is a minute-level cron.
export async function POST() {
  const actor = await getActor();
  if (!actor || !["ops", "admin"].includes(actor.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const log = await runDueJobs();
  return NextResponse.json({ ran: log.length, log });
}
