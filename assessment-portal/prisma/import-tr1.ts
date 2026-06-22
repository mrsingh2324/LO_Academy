import { readFileSync } from "fs";
import { prisma } from "../src/lib/prisma";
import type { Prisma } from "@prisma/client";

// Imports the Bucket-A "TR1 Attended" sheet (mapped by map_tr1.py).
// Creates one TR1 stage_attempt per interview row (multiple attempts per UID =
// retries, ordered by date → attemptNumber). Stores all interview detail in
// `details` (lossless). Advances the student's stage to reflect TR1 outcome.
// Idempotent: rebuilds a student's tr1/tr2 attempts from the sheet each run.

const JSON_PATH = process.argv[2];

type Row = Record<string, unknown> & { ref: string; result: "pass" | "fail" | null; interviewDateISO: string | null };

async function main() {
  const rows: Row[] = JSON.parse(readFileSync(JSON_PATH, "utf8"));
  const groups = new Map<string, Row[]>();
  for (const r of rows) {
    if (!groups.has(r.ref)) groups.set(r.ref, []);
    groups.get(r.ref)!.push(r);
  }

  let matched = 0, attemptsCreated = 0, movedToTr2 = 0, switched = 0;
  const unmatched: string[] = [];

  await prisma.reconciliationItem.deleteMany({ where: { source: "tr1" } });
  const bucketA = await prisma.bucket.findFirst({ where: { name: "A" } });

  for (const [ref, list] of groups) {
    const student = await prisma.student.findUnique({
      where: { externalRef: ref },
      include: { attempts: true, bucket: true },
    });
    if (!student) {
      unmatched.push(ref);
      await prisma.reconciliationItem.create({
        data: { source: "tr1", bucket: "A", kind: "unmatched_uid", uid: ref,
          name: (list[0]?.name as string) ?? undefined,
          detail: { reason: "UID in TR1 sheet but not in roster" } as Prisma.InputJsonValue },
      });
      continue;
    }
    matched++;
    // Bucket switcher: was in another bucket, moved to A, gave Bucket-A TR1 directly.
    // Flag as an anomalous flow, record origin, and re-bucket to A (their real path now).
    if (student.bucket?.name && student.bucket.name !== "A") {
      const from = student.bucket.name;
      await prisma.student.update({
        where: { id: student.id },
        data: {
          anomalousFlow: true,
          switchedFromBucket: from,
          flowNote: `Switched from Bucket ${from} → A; appeared for Bucket A TR1 directly (skipped A's earlier stages).`,
          ...(bucketA ? { bucketId: bucketA.id } : {}),
        },
      });
      await prisma.reconciliationItem.create({
        data: { source: "tr1", bucket: "A", kind: "bucket_switch", uid: ref, name: student.name, resolved: true,
          detail: { reason: `Switched from Bucket ${from} → A; gave Bucket A TR1 directly`, switchedFrom: from } as Prisma.InputJsonValue },
      });
      switched++;
    }

    // order retries by interview date (nulls last, stable)
    list.sort((a, b) => (a.interviewDateISO ?? "9999").localeCompare(b.interviewDateISO ?? "9999"));

    // fill resume if missing
    const resume = list.find((r) => r.resume)?.resume as string | undefined;
    if (resume && !student.resumeUrl) await prisma.student.update({ where: { id: student.id }, data: { resumeUrl: resume } });

    // they reached TR1 → mark nxtmock attempt as cleared (timeline coherence)
    const nxt = student.attempts.find((a) => a.stage === "nxtmock");
    if (nxt && nxt.result !== "pass") {
      await prisma.stageAttempt.update({ where: { id: nxt.id }, data: { result: "pass", status: "passed", outcome: nxt.outcome ?? "Cleared" } });
    }

    // rebuild only tr1 attempts (idempotent) — never touch tr2 (owned by import-tr2)
    const old = student.attempts.filter((a) => a.stage === "tr1").map((a) => a.id);
    if (old.length) {
      await prisma.message.deleteMany({ where: { attemptId: { in: old } } });
      await prisma.scheduledJob.deleteMany({ where: { attemptId: { in: old } } });
      await prisma.prepArtifact.deleteMany({ where: { attemptId: { in: old } } });
      await prisma.report.deleteMany({ where: { attemptId: { in: old } } });
      await prisma.stageAttempt.deleteMany({ where: { id: { in: old } } });
    }

    let lastTr1Id = "";
    let attemptNo = 0;
    for (const r of list) {
      attemptNo++;
      const status = r.result === "pass" ? "passed" : r.result === "fail" ? "failed" : "evaluated";
      const details: Record<string, unknown> = { ...r };
      delete details.ref; delete details.name; delete details.result; delete details.interviewDateISO;
      const created = await prisma.stageAttempt.create({
        data: {
          studentId: student.id,
          stage: "tr1",
          attemptNumber: attemptNo,
          status,
          attendedAt: r.interviewDateISO ? new Date(r.interviewDateISO) : undefined,
          scheduledAt: r.interviewDateISO ? new Date(r.interviewDateISO) : undefined,
          score: (r.totalScore as number) ?? undefined,
          outcome: (r.finalStatus as string) ?? undefined,
          result: r.result ?? "pending",
          remarks: (r.overallComments as string) ?? undefined,
          details: details as Prisma.InputJsonValue,
        },
      });
      lastTr1Id = created.id;
      attemptsCreated++;
    }

    const latest = list[list.length - 1];
    const moved = typeof latest.movedToTr2 === "string" && latest.movedToTr2.toLowerCase().includes("moved");

    if (latest.result === "pass" && moved) {
      // advanced to TR2 — reuse an existing tr2 attempt (with imported results) if present,
      // otherwise create a placeholder awaiting scheduling. Never overwrite TR2 data.
      const existingTr2 = await prisma.stageAttempt.findFirst({ where: { studentId: student.id, stage: "tr2" }, orderBy: { attemptNumber: "desc" } });
      const tr2 = existingTr2 ?? await prisma.stageAttempt.create({
        data: { studentId: student.id, stage: "tr2", attemptNumber: 1, status: "availability_requested" },
      });
      await prisma.student.update({
        where: { id: student.id },
        data: { currentStage: "tr2", currentStatus: tr2.status, currentAttemptId: tr2.id },
      });
      movedToTr2++;
    } else {
      await prisma.student.update({
        where: { id: student.id },
        data: {
          currentStage: "tr1",
          currentStatus: latest.result === "pass" ? "passed" : latest.result === "fail" ? "failed" : "evaluated",
          currentAttemptId: lastTr1Id,
        },
      });
    }
  }

  console.log(`TR1 groups: ${groups.size} | matched students: ${matched} | tr1 attempts created: ${attemptsCreated} | advanced to TR2: ${movedToTr2} | bucket-switchers flagged: ${switched}`);
  console.log(`unmatched UIDs: ${unmatched.length}${unmatched.length ? " e.g. " + unmatched.slice(0, 5).join(", ") : ""}`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
