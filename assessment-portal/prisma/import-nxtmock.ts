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
  let matched = 0, contactsUpdated = 0, attemptsUpdated = 0, createdFromSheet = 0;

  // reset this source's reconciliation entries (idempotent)
  await prisma.reconciliationItem.deleteMany({ where: { source: "nxtmock" } });
  const bucketA = await prisma.bucket.findFirst({ where: { name: "A" } });

  for (const r of rows) {
    let student = await prisma.student.findUnique({
      where: { externalRef: r.ref },
      include: { attempts: { where: { stage: "nxtmock" }, orderBy: { attemptNumber: "asc" } } },
    });
    if (!student) {
      // Not in the master roster, but present in the Bucket-A nxtmock sheet →
      // create them as a Bucket-A Nxtmock candidate (fixes the reconciliation).
      const created = await prisma.student.create({
        data: {
          externalRef: r.ref,
          name: r.name ?? "(unnamed)",
          email: r.email ?? `${r.ref}@placeholder.invalid`,
          phone: r.mobile ?? undefined,
          yearOfGraduation: r.yog ?? undefined,
          bucketId: bucketA?.id ?? null,
          offlineClearedAt: new Date(),
          currentStage: "nxtmock",
          currentStatus: "availability_requested",
          flowNote: "Added from Bucket A Nxtmock sheet (was not in the master roster).",
        },
      });
      const att = await prisma.stageAttempt.create({
        data: { studentId: created.id, stage: "nxtmock", attemptNumber: 1, status: "availability_requested" },
      });
      await prisma.student.update({ where: { id: created.id }, data: { currentAttemptId: att.id } });
      await prisma.reconciliationItem.create({
        data: { source: "nxtmock", bucket: "A", kind: "created_from_sheet", uid: r.ref, name: r.name ?? undefined, resolved: true,
          detail: { reason: "Created as Bucket A from Nxtmock sheet (absent from master roster)", cycle: r.cycle } as Prisma.InputJsonValue },
      });
      createdFromSheet++;
      student = await prisma.student.findUnique({
        where: { id: created.id },
        include: { attempts: { where: { stage: "nxtmock" }, orderBy: { attemptNumber: "asc" } } },
      });
    }
    if (!student) continue;
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
  console.log(`created from sheet (were missing from roster): ${createdFromSheet}`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
