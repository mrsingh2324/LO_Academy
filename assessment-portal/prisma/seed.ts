import { prisma } from "../src/lib/prisma";
import { onboardStudent, transition } from "../src/lib/stateMachine";

// Synthetic seed so the portal is demoable immediately. Real intake replaces
// this via /api/intake or the sheet-import endpoint.

const FIRST = ["Aarav", "Diya", "Vivaan", "Ananya", "Aditya", "Saanvi", "Arjun", "Ishaan", "Kiara", "Reyansh", "Myra", "Kabir", "Aanya", "Vihaan", "Anika", "Rohan", "Tara", "Dhruv", "Naina", "Yash"];
const LAST = ["Sharma", "Verma", "Reddy", "Nair", "Iyer", "Gupta", "Singh", "Patel", "Rao", "Menon"];

function name(i: number) {
  return `${FIRST[i % FIRST.length]} ${LAST[i % LAST.length]}`;
}

async function driveScheduledToResult(attemptId: string, result: "pass" | "fail", score: number, evaluatorId: string) {
  // availability_requested -> scheduled
  const slot = new Date();
  slot.setDate(slot.getDate() + 3);
  slot.setHours(9, 0, 0, 0);
  await transition(attemptId, "scheduled", { chosenSlot: slot });
  await transition(attemptId, "awaiting_result", {});
  await transition(attemptId, "under_evaluation", { evaluatorId });
  await transition(attemptId, "evaluated", { result, score, remarks: result === "pass" ? "Solid fundamentals." : "Needs more practice." });
  await transition(attemptId, "result_shared", { result });
  await transition(attemptId, result === "pass" ? "passed" : "failed", { result });
}

async function main() {
  console.log("Seeding…");
  // wipe (dev only)
  await prisma.$transaction([
    prisma.auditLog.deleteMany(),
    prisma.aiQueryLog.deleteMany(),
    prisma.sheetSyncLog.deleteMany(),
    prisma.message.deleteMany(),
    prisma.scheduledJob.deleteMany(),
    prisma.report.deleteMany(),
    prisma.prepArtifact.deleteMany(),
    prisma.panelFeedback.deleteMany(),
    prisma.stageAttempt.deleteMany(),
    prisma.student.deleteMany(),
    prisma.user.deleteMany(),
    prisma.bucket.deleteMany(),
    prisma.setting.deleteMany(),
  ]);

  const buckets = await Promise.all(
    ["A", "B", "C"].map((n) =>
      prisma.bucket.create({ data: { name: n, description: `Cohort ${n}` } })
    )
  );

  const [admin, ops, evaluator, panelist] = await Promise.all([
    prisma.user.create({ data: { name: "Admin User", email: "admin@portal.test", role: "admin" } }),
    prisma.user.create({ data: { name: "Ops Coordinator", email: "ops@portal.test", role: "ops" } }),
    prisma.user.create({ data: { name: "Eva Grader", email: "eval@portal.test", role: "evaluator" } }),
    prisma.user.create({ data: { name: "Pat Panelist", email: "panel@portal.test", role: "panelist" } }),
  ]);

  for (let i = 0; i < 24; i++) {
    const bucket = buckets[i % 3];
    const student = await onboardStudent({
      externalRef: `EXT-${1000 + i}`,
      name: name(i),
      email: `student${i}@example.com`,
      phone: `+9198${String(10000000 + i).slice(0, 8)}`,
      bucketId: bucket.id,
    });

    const reactAttempt = await prisma.stageAttempt.findFirst({
      where: { studentId: student.id, stage: "react" },
    });
    if (!reactAttempt) continue;

    const bucketReact = i % 7; // distribution
    if (bucketReact <= 1) {
      // still in react / scheduled
      if (bucketReact === 1) {
        const slot = new Date(); slot.setDate(slot.getDate() + 3); slot.setHours(9, 0, 0, 0);
        await transition(reactAttempt.id, "scheduled", { chosenSlot: slot });
      }
      continue;
    }
    if (bucketReact === 2) {
      await driveScheduledToResult(reactAttempt.id, "fail", 41, evaluator.id);
      continue;
    }
    // pass react -> now in tr1
    await driveScheduledToResult(reactAttempt.id, "pass", 78 + (i % 15), evaluator.id);
    const tr1 = await prisma.stageAttempt.findFirst({ where: { studentId: student.id, stage: "tr1" } });
    if (!tr1) continue;

    if (bucketReact === 3) continue; // sitting in tr1 availability
    if (bucketReact === 4) {
      await driveScheduledToResult(tr1.id, "fail", 52, evaluator.id);
      await addPanel(tr1.id, panelist.id, "reject");
      continue;
    }
    // pass tr1
    await driveScheduledToResult(tr1.id, "pass", 80 + (i % 12), evaluator.id);
    await addPanel(tr1.id, panelist.id, "advance");
    const tr2 = await prisma.stageAttempt.findFirst({ where: { studentId: student.id, stage: "tr2" } });
    if (!tr2) continue;
    if (bucketReact === 5) continue; // sitting in tr2
    // tr2 pass -> selected
    await driveScheduledToResult(tr2.id, "pass", 85 + (i % 10), evaluator.id);
    await addPanel(tr2.id, panelist.id, "advance");
  }

  const counts = await prisma.student.groupBy({ by: ["currentStage"], _count: true });
  console.log("Students by stage:", counts);
  console.log("Done. Users: admin@portal.test / ops@portal.test / eval@portal.test / panel@portal.test");
}

async function addPanel(attemptId: string, panelistId: string, rec: string) {
  await prisma.panelFeedback.create({
    data: {
      attemptId,
      panelistId,
      scores: { problem_solving: 4, coding: 4, communication: 3, system_design: 3 },
      strengths: "Clear communication and structured problem solving.",
      weaknesses: "Could deepen system-design tradeoff discussion.",
      recommendation: rec,
    },
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
