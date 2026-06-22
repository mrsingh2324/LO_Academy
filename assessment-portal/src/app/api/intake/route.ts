import { NextRequest, NextResponse } from "next/server";
import { onboardStudent } from "@/lib/stateMachine";
import { getActor } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// §7 rule 1 — intake. Accepts one student or an array. Idempotent on externalRef.
export async function POST(req: NextRequest) {
  const actor = await getActor();
  if (!actor || !["ops", "admin"].includes(actor.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = await req.json();
  const rows = Array.isArray(body) ? body : [body];
  const results = [];
  for (const r of rows) {
    if (!r.externalRef || !r.name || !r.email) {
      results.push({ externalRef: r.externalRef, error: "externalRef, name, email required" });
      continue;
    }
    let bucketId: string | null = null;
    if (r.bucket) {
      const b = await prisma.bucket.upsert({
        where: { name: String(r.bucket) },
        create: { name: String(r.bucket) },
        update: {},
      });
      bucketId = b.id;
    }
    const s = await onboardStudent({
      externalRef: String(r.externalRef),
      name: r.name,
      email: r.email,
      phone: r.phone,
      bucketId,
      offlineClearedAt: r.offlineClearedAt ? new Date(r.offlineClearedAt) : undefined,
    });
    results.push({ externalRef: r.externalRef, id: s.id });
  }
  return NextResponse.json({ count: results.length, results });
}
