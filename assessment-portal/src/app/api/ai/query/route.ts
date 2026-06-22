import { NextRequest, NextResponse } from "next/server";
import { runNlQuery } from "@/lib/nlquery";
import { getActor } from "@/lib/auth";

// §8.1 NL query — ops/admin only.
export async function POST(req: NextRequest) {
  const actor = await getActor();
  if (!actor || !["ops", "admin"].includes(actor.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { question } = await req.json();
  if (!question || typeof question !== "string") {
    return NextResponse.json({ error: "question required" }, { status: 400 });
  }
  const result = await runNlQuery(question, actor.id);
  return NextResponse.json({
    status: result.status,
    filter: result.filter,
    count: result.students.length,
    students: result.students.map((s) => ({
      id: s.id,
      name: s.name,
      email: s.email,
      bucket: s.bucket?.name ?? null,
      currentStage: s.currentStage,
      currentStatus: s.currentStatus,
      latestScore: s.attempts[0]?.score ?? null,
    })),
  });
}
