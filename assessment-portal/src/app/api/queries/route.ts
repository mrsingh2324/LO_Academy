import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Student posts an assessment-related query → lands in the ops inbox.
// Student side (no staff auth); studentId is the capability token for the demo.
export async function POST(req: NextRequest) {
  const { studentId, subject, message } = await req.json();
  if (!studentId || !message?.trim()) {
    return NextResponse.json({ error: "studentId and message required" }, { status: 400 });
  }
  const student = await prisma.student.findUnique({ where: { id: studentId } });
  if (!student) return NextResponse.json({ error: "Unknown student" }, { status: 404 });

  const q = await prisma.studentQuery.create({
    data: { studentId, subject: subject?.trim() || null, message: message.trim() },
  });
  return NextResponse.json({ ok: true, id: q.id });
}
