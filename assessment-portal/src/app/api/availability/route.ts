import { NextRequest, NextResponse } from "next/server";
import { transition, TransitionError } from "@/lib/stateMachine";
import { prisma } from "@/lib/prisma";

// Student side: candidate picks a slot (magic-link-lite). No staff auth — the
// attemptId is the capability token for this demo.
export async function POST(req: NextRequest) {
  const { attemptId, chosenSlot } = await req.json();
  if (!attemptId || !chosenSlot) {
    return NextResponse.json({ error: "attemptId and chosenSlot required" }, { status: 400 });
  }
  const attempt = await prisma.stageAttempt.findUnique({ where: { id: attemptId } });
  if (!attempt) return NextResponse.json({ error: "Not found" }, { status: 404 });
  try {
    await transition(attemptId, "scheduled", { chosenSlot: new Date(chosenSlot) });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const code = e instanceof TransitionError ? 400 : 500;
    return NextResponse.json({ error: (e as Error).message }, { status: code });
  }
}
