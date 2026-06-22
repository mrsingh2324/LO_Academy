import { prisma } from "../src/lib/prisma";
import { onboardStudent, transition, submitResult, TransitionError } from "../src/lib/stateMachine";

// Lightweight assertions for §6 guards + §7 idempotency (run: npx tsx prisma/test-statemachine.ts)
let pass = 0, fail = 0;
function ok(cond: boolean, label: string) {
  if (cond) { pass++; console.log("  ✓", label); }
  else { fail++; console.error("  ✗", label); }
}

async function main() {
  const ref = "TEST-SM-1";
  await prisma.stageAttempt.deleteMany({ where: { student: { externalRef: ref } } });
  await prisma.message.deleteMany({ where: { student: { externalRef: ref } } });
  await prisma.student.deleteMany({ where: { externalRef: ref } });

  // Bucket A → pipeline starts at Nxtmock.
  const bucketA = await prisma.bucket.upsert({ where: { name: "A" }, create: { name: "A" }, update: {} });

  console.log("Idempotent intake (Bucket A → Nxtmock):");
  const s1 = await onboardStudent({ externalRef: ref, name: "Test One", email: "t1@x.com", bucketId: bucketA.id });
  const s2 = await onboardStudent({ externalRef: ref, name: "Test One", email: "t1@x.com", bucketId: bucketA.id });
  ok(s1.id === s2.id, "re-running intake returns same student (no duplicate)");
  const dupCount = await prisma.student.count({ where: { externalRef: ref } });
  ok(dupCount === 1, "exactly one student row exists");

  const attempt = await prisma.stageAttempt.findFirst({ where: { studentId: s1.id } });
  ok(attempt?.stage === "nxtmock", "Bucket A first stage is nxtmock");
  ok(attempt?.status === "availability_requested", "first attempt in availability_requested");

  console.log("Illegal transitions rejected:");
  let threw = false;
  try { await transition(attempt!.id, "evaluated", {}); } catch (e) { threw = e instanceof TransitionError; }
  ok(threw, "availability_requested → evaluated is rejected");

  threw = false;
  try { await transition(attempt!.id, "passed", {}); } catch (e) { threw = e instanceof TransitionError; }
  ok(threw, "availability_requested → passed is rejected");

  console.log("Legal path + side effects:");
  const slot = new Date(); slot.setDate(slot.getDate() + 3);
  await transition(attempt!.id, "scheduled", { chosenSlot: slot });
  const sched = await prisma.stageAttempt.findUnique({ where: { id: attempt!.id } });
  ok(sched?.status === "scheduled" && sched.scheduledAt !== null, "scheduled sets scheduledAt");
  const confirm = await prisma.message.findFirst({ where: { attemptId: attempt!.id, templateKey: "schedule_confirmation" } });
  ok(!!confirm, "schedule_confirmation message sent");
  const reminders = await prisma.scheduledJob.count({ where: { attemptId: attempt!.id, type: "send_reminder" } });
  ok(reminders === 2, "two reminder jobs enqueued (T-1d, T-2h)");

  // idempotent transition (same status)
  const again = await transition(attempt!.id, "scheduled", { chosenSlot: slot });
  ok(again.status === "scheduled", "repeating same-status transition is a no-op");

  console.log("Audit trail:");
  const audits = await prisma.auditLog.count({ where: { entityId: attempt!.id } });
  ok(audits >= 1, "transitions written to audit_log");

  console.log("Bucket pipeline advancement:");
  // Bucket A: pass Nxtmock → should advance to TR1.
  const a = await onboardStudent({ externalRef: "TEST-SM-A", name: "A Test", email: "a@x.com", bucketId: bucketA.id });
  const aAttempt = await prisma.stageAttempt.findFirst({ where: { studentId: a.id, stage: "nxtmock" } });
  await submitResult(aAttempt!.id, { score: 85, result: "pass" });
  const aAfter = await prisma.student.findUnique({ where: { id: a.id } });
  ok(aAfter?.currentStage === "tr1", "Bucket A: Nxtmock pass → advances to TR1");
  const aTr1 = await prisma.stageAttempt.findFirst({ where: { studentId: a.id, stage: "tr1" } });
  ok(!!aTr1, "Bucket A: TR1 attempt created");

  // Bucket C: pass TR1 (its only stage) → Placement pool.
  const bucketC = await prisma.bucket.upsert({ where: { name: "C" }, create: { name: "C" }, update: {} });
  const c = await onboardStudent({ externalRef: "TEST-SM-C", name: "C Test", email: "c@x.com", bucketId: bucketC.id });
  const cAttempt = await prisma.stageAttempt.findFirst({ where: { studentId: c.id, stage: "tr1" } });
  ok(cAttempt?.stage === "tr1", "Bucket C first stage is TR1");
  await submitResult(cAttempt!.id, { score: 88, result: "pass" });
  const cAfter = await prisma.student.findUnique({ where: { id: c.id } });
  ok(cAfter?.currentStage === "placement_pool", "Bucket C: TR1 pass → Placement pool (no TR2)");
  ok(cAfter?.finalPortalRedirectedAt != null, "Bucket C: placement redirect timestamp set");

  // cleanup pipeline test students
  for (const ref2 of ["TEST-SM-A", "TEST-SM-C"]) {
    const st = await prisma.student.findUnique({ where: { externalRef: ref2 } });
    if (st) {
      const atts = await prisma.stageAttempt.findMany({ where: { studentId: st.id }, select: { id: true } });
      const attIds = atts.map((x) => x.id);
      await prisma.auditLog.deleteMany({ where: { entityId: st.id } });
      await prisma.message.deleteMany({ where: { studentId: st.id } });
      await prisma.scheduledJob.deleteMany({ where: { attemptId: { in: attIds } } });
      await prisma.prepArtifact.deleteMany({ where: { attemptId: { in: attIds } } });
      await prisma.stageAttempt.deleteMany({ where: { studentId: st.id } });
      await prisma.student.delete({ where: { id: st.id } });
    }
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
