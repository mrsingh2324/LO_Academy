import { NextRequest, NextResponse } from "next/server";
import { getActor } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { transition, submitResult } from "@/lib/stateMachine";
import type { Prisma } from "@prisma/client";

/**
 * §9 sheet sync (MOCKED inbound). Two sheets:
 *  - availability: rows { externalRef, stage?, chosenSlot, rowRef } → status scheduled
 *  - scores:       rows { externalRef, stage?, score, result, rowRef } → evaluated→shared→branch
 * Keyed by rowRef for idempotent reconciliation (sheet_sync_log).
 */
export async function POST(req: NextRequest) {
  const actor = await getActor();
  if (!actor || !["ops", "admin"].includes(actor.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { sheet, rows } = await req.json();
  if (!["availability", "scores"].includes(sheet) || !Array.isArray(rows)) {
    return NextResponse.json({ error: "sheet (availability|scores) and rows[] required" }, { status: 400 });
  }

  const out = [];
  for (const row of rows) {
    const rowRef = row.rowRef ?? `${sheet}-${row.externalRef}-${row.stage ?? ""}`;
    // idempotent: skip already-synced rows
    const seen = await prisma.sheetSyncLog.findFirst({ where: { sheet, rowRef, status: "ok" } });
    if (seen) { out.push({ rowRef, skipped: true }); continue; }

    const student = await prisma.student.findUnique({
      where: { externalRef: String(row.externalRef) },
      include: { attempts: { orderBy: { createdAt: "desc" } } },
    });
    if (!student) { out.push({ rowRef, error: "student not found" }); continue; }
    const attempt =
      student.attempts.find((a) => (!row.stage || a.stage === row.stage) && ["availability_requested", "scheduled", "awaiting_result", "under_evaluation"].includes(a.status)) ??
      student.attempts[0];
    if (!attempt) { out.push({ rowRef, error: "no active attempt" }); continue; }

    try {
      if (sheet === "availability") {
        await transition(attempt.id, "scheduled", { chosenSlot: new Date(row.chosenSlot), availabilitySheetRef: rowRef }, actor.id);
      } else {
        const result = row.result === "pass" || row.result === "fail" ? row.result : Number(row.score) >= 60 ? "pass" : "fail";
        await submitResult(attempt.id, { score: Number(row.score), result, remarks: row.remarks }, actor.id);
      }
      await prisma.sheetSyncLog.create({
        data: { sheet, direction: "in", rowRef, mappedAttemptId: attempt.id, payload: row as Prisma.InputJsonValue, status: "ok" },
      });
      out.push({ rowRef, mappedAttemptId: attempt.id, ok: true });
    } catch (e) {
      await prisma.sheetSyncLog.create({
        data: { sheet, direction: "in", rowRef, mappedAttemptId: attempt.id, payload: row as Prisma.InputJsonValue, status: "error" },
      });
      out.push({ rowRef, error: (e as Error).message });
    }
  }
  return NextResponse.json({ synced: out });
}
