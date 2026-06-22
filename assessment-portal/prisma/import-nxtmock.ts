import { readFileSync } from "fs";
import { prisma } from "../src/lib/prisma";
import type { Prisma } from "@prisma/client";

// Imports the Bucket-A "nxtmock" sheet (mapped to JSON by map_nxtmock.py).
// Backfills student contacts and enriches each student's Nxtmock attempt with
// score / result / report link / full details. Matches by externalRef (UID).

const JSON_PATH = process.argv[2] ?? "/private/tmp/claude-501/-Users-satyamsingh-Desktop-June2026-Assessments-DB/772fe37a-7f33-4a8a-b53e-3489dab0a74a/scratchpad/nxtmock-mapped.json";

type Row = {
  ref: string; name: string | null; mobile: string | null; email: string | null; resume: string | null;
  yog: number | null; cycle: string | null; offlineDate: string | null; accessStatus: string | null;
  accessGivenDate: string | null; attempted: string | null; score: number | null; reportLink: string | null;
  resultRaw: string | null; result: "pass" | "fail" | null; sharedStatus: string | null;
};

async function main() {
  const rows: Row[] = JSON.parse(readFileSync(JSON_PATH, "utf8"));
  let matched = 0, contactsUpdated = 0, attemptsUpdated = 0;
  const unmatched: string[] = [];

  // reset this source's reconciliation entries (idempotent)
  await prisma.reconciliationItem.deleteMany({ where: { source: "nxtmock" } });

  for (const r of rows) {
    const student = await prisma.student.findUnique({
      where: { externalRef: r.ref },
      include: { attempts: { where: { stage: "nxtmock" }, orderBy: { attemptNumber: "asc" } } },
    });
    if (!student) {
      unmatched.push(r.ref);
      await prisma.reconciliationItem.create({
        data: { source: "nxtmock", bucket: "A", kind: "unmatched_uid", uid: r.ref, name: r.name ?? undefined,
          detail: { reason: "UID in nxtmock sheet but not in roster", cycle: r.cycle } as Prisma.InputJsonValue },
      });
      continue;
    }
    matched++;

    // backfill contacts (only overwrite synthetic/empty values)
    const data: Prisma.StudentUpdateInput = {};
    if (r.email) data.email = r.email;
    if (r.mobile) data.phone = r.mobile;
    if (r.resume) data.resumeUrl = r.resume;
    if (r.yog) data.yearOfGraduation = r.yog;
    if (Object.keys(data).length) { await prisma.student.update({ where: { id: student.id }, data }); contactsUpdated++; }

    // enrich the nxtmock attempt
    const attempt = student.attempts[0];
    if (attempt) {
      const attempted = (r.attempted ?? "").toLowerCase() === "attempted";
      const details = {
        cycle: r.cycle, offlineDate: r.offlineDate, accessStatus: r.accessStatus,
        accessGivenDate: r.accessGivenDate, attemptedStatus: r.attempted, score: r.score,
        reportLink: r.reportLink, result: r.resultRaw, resultSharedStatus: r.sharedStatus,
      };
      await prisma.stageAttempt.update({
        where: { id: attempt.id },
        data: {
          score: r.score ?? undefined,
          outcome: r.resultRaw ?? undefined,
          result: r.result ?? undefined,
          details: details as Prisma.InputJsonValue,
          attendedAt: attempted ? new Date() : undefined,
          // reflect a graded nxtmock without driving the full state machine
          status: r.result ? "evaluated" : attempted ? "awaiting_result" : undefined,
        },
      });
      attemptsUpdated++;
    }
  }

  console.log(`nxtmock rows: ${rows.length}`);
  console.log(`matched students: ${matched} | contacts updated: ${contactsUpdated} | nxtmock attempts enriched: ${attemptsUpdated}`);
  console.log(`unmatched UIDs (not in DB): ${unmatched.length}`);
  if (unmatched.length) console.log("  sample:", unmatched.slice(0, 5).join(", "));
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
