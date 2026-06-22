import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Candidate "login": look up the student by email (or external ref) and return
// their portal id. Demo-grade (no password) — magic links are the §14 default.
export async function POST(req: NextRequest) {
  const { identifier } = await req.json();
  const id = (identifier ?? "").trim();
  if (!id) return NextResponse.json({ error: "Enter your email or candidate ID" }, { status: 400 });

  const student = await prisma.student.findFirst({
    where: { OR: [{ email: { equals: id } }, { externalRef: { equals: id } }] },
  });
  if (!student) return NextResponse.json({ error: "No candidate found with that email/ID" }, { status: 404 });
  return NextResponse.json({ ok: true, studentId: student.id, name: student.name });
}
