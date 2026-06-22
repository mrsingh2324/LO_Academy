import { randomUUID } from "crypto";
import { readFileSync } from "fs";
import { prisma } from "../src/lib/prisma";
import { nextWeekendSlots } from "../src/lib/slots";
import { firstStageForBucket } from "../src/lib/enums";
import type { Prisma } from "@prisma/client";

// Import the real intake sheet (User ID, Student Name, YOG, Students Current bucket).
// Qualified (A/B/C) → enter the React pipeline. Not Qualified → Bucket D, stored
// but not started into React (they didn't clear the offline assessment).

const CSV = process.argv[2] ?? "/private/tmp/claude-501/-Users-satyamsingh-Desktop-June2026-Assessments-DB/772fe37a-7f33-4a8a-b53e-3489dab0a74a/scratchpad/students.csv";

function parseLine(line: string): { ref: string; name: string; yog: number | null; bucketRaw: string } | null {
  const parts = line.split(",");
  if (parts.length < 4) return null;
  const ref = parts[0].trim();
  const bucketRaw = parts[parts.length - 1].trim();
  const yogStr = parts[parts.length - 2].trim();
  const name = parts.slice(1, parts.length - 2).join(",").trim(); // names may contain commas
  if (!ref) return null;
  const yog = /^\d{4}$/.test(yogStr) ? Number(yogStr) : null;
  return { ref, name, yog, bucketRaw };
}

function bucketLetter(raw: string): "A" | "B" | "C" | "D" {
  const m = raw.match(/Bucket\s*-\s*([ABC])/i);
  if (m) return m[1].toUpperCase() as "A" | "B" | "C";
  return "D"; // "Offline Not Qualified"
}

async function chunked<T>(rows: T[], size: number, fn: (batch: T[]) => Promise<unknown>) {
  for (let i = 0; i < rows.length; i += size) await fn(rows.slice(i, i + size));
}

async function main() {
  const lines = readFileSync(CSV, "utf8").split("\n").map((l) => l.replace(/\r$/, "")).filter(Boolean);
  const header = lines.shift();
  console.log("Header:", header);

  // dedupe by externalRef
  const seen = new Set<string>();
  const rows = [];
  for (const line of lines) {
    const r = parseLine(line);
    if (!r || seen.has(r.ref)) continue;
    seen.add(r.ref);
    rows.push(r);
  }
  console.log(`Parsed ${rows.length} unique students.`);

  console.log("Clearing existing student data (users/settings kept)…");
  await prisma.auditLog.deleteMany();
  await prisma.aiQueryLog.deleteMany();
  await prisma.sheetSyncLog.deleteMany();
  await prisma.message.deleteMany();
  await prisma.scheduledJob.deleteMany();
  await prisma.report.deleteMany();
  await prisma.prepArtifact.deleteMany();
  await prisma.panelFeedback.deleteMany();
  await prisma.studentQuery.deleteMany(); // FK → student (Postgres enforces order)
  await prisma.reconciliationItem.deleteMany();
  await prisma.stageAttempt.deleteMany();
  await prisma.student.deleteMany();
  await prisma.bucket.deleteMany();

  const buckets: Record<string, string> = {};
  for (const [name, desc] of [["A", "Offline Qualified — A"], ["B", "Offline Qualified — B"], ["C", "Offline Qualified — C"], ["D", "Offline Not Qualified"]]) {
    const b = await prisma.bucket.create({ data: { name, description: desc } });
    buckets[name] = b.id;
  }

  const now = new Date();
  const slots = nextWeekendSlots();
  const studentRows: Prisma.StudentCreateManyInput[] = [];
  const attemptRows: Prisma.StageAttemptCreateManyInput[] = [];
  const messageRows: Prisma.MessageCreateManyInput[] = [];

  let qualified = 0;
  for (const r of rows) {
    const letter = bucketLetter(r.bucketRaw);
    const first = firstStageForBucket(letter); // Nxtmock=A, Dev test=B, TR1=C, null=D
    const isQualified = first !== null;
    const studentId = randomUUID();
    const attemptId = isQualified ? randomUUID() : null;

    studentRows.push({
      id: studentId,
      externalRef: r.ref,
      name: r.name || "(unnamed)",
      email: `${r.ref}@placeholder.invalid`,
      yearOfGraduation: r.yog,
      bucketId: buckets[letter],
      offlineClearedAt: isQualified ? now : null,
      currentStage: first ?? "rejected",
      currentStatus: isQualified ? "availability_requested" : "not_qualified",
      currentAttemptId: attemptId,
    });

    if (isQualified && attemptId && first) {
      qualified++;
      attemptRows.push({
        id: attemptId,
        studentId,
        stage: first,
        attemptNumber: 1,
        status: "availability_requested",
        availabilityOptions: slots as unknown as Prisma.InputJsonValue,
      });
      messageRows.push({
        id: randomUUID(),
        studentId,
        attemptId,
        channel: "email",
        templateKey: "availability_request",
        payload: { stage: "react" } as Prisma.InputJsonValue,
        status: "sent",
        providerMessageId: `mock-availability_request-${studentId.slice(0, 8)}`,
        sentAt: now,
      });
    }
  }

  console.log(`Inserting ${studentRows.length} students (${qualified} qualified → bucket pipeline, ${studentRows.length - qualified} not qualified → Bucket D)…`);
  await chunked(studentRows, 500, (b) => prisma.student.createMany({ data: b }));
  await chunked(attemptRows, 500, (b) => prisma.stageAttempt.createMany({ data: b }));
  await chunked(messageRows, 500, (b) => prisma.message.createMany({ data: b }));

  await prisma.auditLog.create({
    data: { entity: "import", entityId: "sheet", action: "bulk_import", after: { count: studentRows.length, qualified } as Prisma.InputJsonValue },
  });

  const byStage = await prisma.student.groupBy({ by: ["currentStage"], _count: true });
  console.log("By stage:", byStage);
  const byBucket = await prisma.bucket.findMany({ include: { _count: { select: { students: true } } } });
  console.log("By bucket:", byBucket.map((b) => `${b.name}:${b._count.students}`).join("  "));
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
