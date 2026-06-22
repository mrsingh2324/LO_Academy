import { NextResponse } from "next/server";
import { getActor } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendMessage } from "@/lib/adapters";
import { nextWeekendSlots } from "@/lib/slots";
import type { Prisma } from "@prisma/client";

// §7 rule 2 — (re)send the availability form for the student's active attempt.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await getActor();
  if (!actor || !["ops", "admin"].includes(actor.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const student = await prisma.student.findUnique({ where: { id }, include: { attempts: { orderBy: { createdAt: "desc" } } } });
  if (!student) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const attempt = student.attempts.find((a) => a.status === "availability_requested") ?? student.attempts[0];
  if (!attempt) return NextResponse.json({ error: "No active attempt" }, { status: 400 });

  const slots = nextWeekendSlots();
  await prisma.stageAttempt.update({
    where: { id: attempt.id },
    data: { availabilityOptions: slots as unknown as Prisma.InputJsonValue },
  });
  // re-send is idempotent per (attempt, template); force a fresh send by clearing the prior msg
  await prisma.message.deleteMany({ where: { attemptId: attempt.id, templateKey: "availability_request" } });
  await sendMessage(prisma, {
    studentId: student.id,
    attemptId: attempt.id,
    templateKey: "availability_request",
    payload: { stage: attempt.stage, slots },
  });
  return NextResponse.json({ ok: true, slots });
}
