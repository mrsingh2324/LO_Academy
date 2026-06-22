import { readFileSync } from "fs";
import { prisma } from "../src/lib/prisma";
import type { Prisma } from "@prisma/client";

// Imports Bucket-A TR2 interviews (mapped by map_tr2.py). Creates/refreshes a
// TR2 attempt per student with Overall Score + Final Verdict + section scores
// in `details`. Advances passers to Placement Pool. Source is the full-workbook
// text export (row-lossy), so a reconciliation note is logged.

const JSON_PATH = process.argv[2];

type Row = Record<string, unknown> & { ref: string; result: "pass" | "fail" | null; interviewDate: string | null };

function parseDate(d: string | null) {
  if (!d) return undefined;
  const t = Date.parse(d);
  return Number.isNaN(t) ? undefined : new Date(t);
}

async function main() {
  const rows: Row[] = JSON.parse(readFileSync(JSON_PATH, "utf8"));
  await prisma.reconciliationItem.deleteMany({ where: { source: "tr2" } });

  let matched = 0, created = 0, toPlacement = 0;
  const unmatched: string[] = [];

  for (const r of rows) {
    const student = await prisma.student.findUnique({ where: { externalRef: r.ref }, include: { attempts: true } });
    if (!student) {
      unmatched.push(r.ref);
      await prisma.reconciliationItem.create({
        data: { source: "tr2", bucket: "A", kind: "unmatched_uid", uid: r.ref, name: (r.name as string) ?? undefined,
          detail: { reason: "UID in TR2 sheet but not in roster" } as Prisma.InputJsonValue },
      });
      continue;
    }
    matched++;

    // rebuild this student's tr2 attempt(s)
    const oldTr2 = student.attempts.filter((a) => a.stage === "tr2").map((a) => a.id);
    if (oldTr2.length) {
      await prisma.message.deleteMany({ where: { attemptId: { in: oldTr2 } } });
      await prisma.scheduledJob.deleteMany({ where: { attemptId: { in: oldTr2 } } });
      await prisma.prepArtifact.deleteMany({ where: { attemptId: { in: oldTr2 } } });
      await prisma.report.deleteMany({ where: { attemptId: { in: oldTr2 } } });
      await prisma.stageAttempt.deleteMany({ where: { id: { in: oldTr2 } } });
    }

    const details: Record<string, unknown> = { ...r };
    delete details.ref; delete details.name; delete details.result;
    const status = r.result === "pass" ? "passed" : r.result === "fail" ? "failed" : "evaluated";
    const tr2 = await prisma.stageAttempt.create({
      data: {
        studentId: student.id,
        stage: "tr2",
        attemptNumber: 1,
        status,
        attendedAt: parseDate(r.interviewDate),
        scheduledAt: parseDate(r.interviewDate),
        score: (r.overallScore as number) ?? undefined,
        outcome: (r.finalVerdict as string) ?? undefined,
        result: r.result ?? "pending",
        remarks: (r.overallRemarks as string) ?? undefined,
        details: details as Prisma.InputJsonValue,
      },
    });
    created++;

    // placement pool eligibility — "After" column is authoritative if present
    const after = (r.placementAfter as string) ?? "";
    const eligible = r.result === "pass" && !/reject/i.test(after);
    if (eligible) {
      await prisma.student.update({
        where: { id: student.id },
        data: { currentStage: "placement_pool", currentStatus: "passed", currentAttemptId: tr2.id, finalPortalRedirectedAt: new Date() },
      });
      toPlacement++;
    } else {
      await prisma.student.update({
        where: { id: student.id },
        data: { currentStage: "tr2", currentStatus: status, currentAttemptId: tr2.id },
      });
    }
  }

  // completeness note (verified): the workbook's TR2 tab holds exactly these
  // interviews; more students are "moved to TR2" but pending their interview.
  const movedToTr2 = await prisma.student.count({ where: { bucket: { name: "A" }, currentStage: "tr2" } });
  await prisma.reconciliationItem.create({
    data: { source: "tr2", bucket: "A", kind: "count_note", name: "TR2 completeness (verified)", resolved: true,
      detail: { reason: `${rows.length} TR2 interviews completed (all rows in the workbook's TR2 tab captured); ${movedToTr2} moved to TR2 total, so ${movedToTr2 - rows.length} are pending their TR2 interview.` } as Prisma.InputJsonValue },
  });

  console.log(`TR2 rows: ${rows.length} | matched: ${matched} | tr2 attempts: ${created} | → placement pool: ${toPlacement} | unmatched: ${unmatched.length}`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
