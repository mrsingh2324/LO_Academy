import { NextRequest, NextResponse } from "next/server";
import { generateTrReport } from "@/lib/report";
import { getActor } from "@/lib/auth";

// §8.2 Generate TR report — ops/admin only.
export async function POST(req: NextRequest) {
  const actor = await getActor();
  if (!actor || !["ops", "admin"].includes(actor.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { attemptId } = await req.json();
  if (!attemptId) return NextResponse.json({ error: "attemptId required" }, { status: 400 });
  try {
    const report = await generateTrReport(attemptId, actor.id);
    return NextResponse.json({ id: report.id, content: report.content, model: report.model });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
