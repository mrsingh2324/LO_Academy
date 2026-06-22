import { NextRequest, NextResponse } from "next/server";
import { submitResult, TransitionError } from "@/lib/stateMachine";
import { getActor } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

// Panel feedback for a TR round (§6/§7). panelist/ops/admin. Panelists submit
// feedback only for rounds (RBAC, §15). Saving feedback drives the attempt to
// its result (pass/fail derived from the recommendation unless overridden).
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await getActor();
  if (!actor || !["panelist", "ops", "admin"].includes(actor.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const attempt = await prisma.stageAttempt.findUnique({ where: { id } });
  if (!attempt) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (attempt.stage !== "tr1" && attempt.stage !== "tr2") {
    return NextResponse.json({ error: "Panel feedback is for TR rounds only" }, { status: 400 });
  }

  const body = await req.json();
  const { scores, strengths, weaknesses, recommendation, score } = body;
  if (!["advance", "reject", "borderline"].includes(recommendation)) {
    return NextResponse.json({ error: "recommendation must be advance|reject|borderline" }, { status: 400 });
  }

  await prisma.panelFeedback.create({
    data: {
      attemptId: id,
      panelistId: actor.id,
      scores: (scores ?? {}) as Prisma.InputJsonValue,
      strengths,
      weaknesses,
      recommendation,
    },
  });

  const result: "pass" | "fail" = recommendation === "advance" ? "pass" : "fail";
  const numericScore = typeof score === "number" ? score : recommendation === "advance" ? 80 : 50;
  try {
    const updated = await submitResult(id, { score: numericScore, result, remarks: strengths }, actor.id);
    return NextResponse.json({ ok: true, status: updated?.status, result });
  } catch (e) {
    const code = e instanceof TransitionError ? 400 : 500;
    return NextResponse.json({ error: (e as Error).message }, { status: code });
  }
}
