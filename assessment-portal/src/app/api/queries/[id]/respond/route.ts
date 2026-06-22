import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActor } from "@/lib/auth";

// Ops/admin replies to a student query.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await getActor();
  if (!actor || !["ops", "admin"].includes(actor.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { response } = await req.json();
  if (!response?.trim()) return NextResponse.json({ error: "response required" }, { status: 400 });

  await prisma.studentQuery.update({
    where: { id },
    data: { response: response.trim(), status: "answered", respondedById: actor.id, respondedAt: new Date() },
  });
  return NextResponse.json({ ok: true });
}
