import { NextRequest, NextResponse } from "next/server";
import { submitResult, TransitionError } from "@/lib/stateMachine";
import { getActor } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// React score entry (§6/§7 rule 6). ops/admin/evaluator. Evaluators may only
// score attempts assigned to them (RBAC, §15).
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await getActor();
  if (!actor || !["ops", "admin", "evaluator"].includes(actor.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const attempt = await prisma.stageAttempt.findUnique({ where: { id } });
  if (!attempt) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (actor.role === "evaluator" && attempt.evaluatorId && attempt.evaluatorId !== actor.id) {
    return NextResponse.json({ error: "Not assigned to you" }, { status: 403 });
  }

  const { score, result, remarks } = await req.json();
  if (typeof score !== "number" || !["pass", "fail"].includes(result)) {
    return NextResponse.json({ error: "score (number) and result (pass|fail) required" }, { status: 400 });
  }
  try {
    const updated = await submitResult(
      id,
      { score, result, remarks, evaluatorId: actor.role === "evaluator" ? actor.id : undefined },
      actor.id
    );
    return NextResponse.json({ ok: true, status: updated?.status });
  } catch (e) {
    const code = e instanceof TransitionError ? 400 : 500;
    return NextResponse.json({ error: (e as Error).message }, { status: code });
  }
}
