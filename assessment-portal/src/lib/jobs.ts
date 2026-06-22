import { prisma } from "./prisma";
import { sendMessage } from "./adapters";
import { transition } from "./stateMachine";
import { nextWeekendSlots } from "./slots";
import type { Prisma } from "@prisma/client";

/**
 * Minimal durable-job processor (§5.7, §7). In production a worker + cron
 * promotes due jobs every minute; here it runs on demand via /api/jobs/run.
 * Each job is idempotent — re-running never double-sends (guarded by message
 * uniqueness and job status).
 */
export async function runDueJobs(now: Date = new Date()) {
  const due = await prisma.scheduledJob.findMany({
    where: { status: "pending", runAt: { lte: now } },
    orderBy: { runAt: "asc" },
    take: 100,
  });

  const log: { id: string; type: string; result: string }[] = [];
  for (const job of due) {
    try {
      await processOne(job);
      await prisma.scheduledJob.update({
        where: { id: job.id },
        data: { status: "done", executedAt: new Date(), attempts: { increment: 1 } },
      });
      log.push({ id: job.id, type: job.type, result: "done" });
    } catch (e) {
      await prisma.scheduledJob.update({
        where: { id: job.id },
        data: { status: "failed", attempts: { increment: 1 }, payload: { error: (e as Error).message } as Prisma.InputJsonValue },
      });
      log.push({ id: job.id, type: job.type, result: `failed: ${(e as Error).message}` });
    }
  }
  return log;
}

async function processOne(job: { id: string; type: string; attemptId: string | null }) {
  if (!job.attemptId) return;
  const attempt = await prisma.stageAttempt.findUnique({ where: { id: job.attemptId } });
  if (!attempt) return;

  switch (job.type) {
    case "fixed_slot_send":
      // §7 rule 5 — on the slot day, send the test/invite and move to awaiting_result
      if (attempt.status === "scheduled") {
        await transition(attempt.id, "awaiting_result", {});
      }
      break;
    case "send_reminder":
      await sendMessage(prisma, {
        studentId: attempt.studentId,
        attemptId: attempt.id,
        templateKey: "reminder",
        payload: { stage: attempt.stage },
      });
      break;
    case "reopen_attempt": {
      // §7 rule 8 — open a fresh attempt for the same stage
      const existing = await prisma.stageAttempt.count({ where: { studentId: attempt.studentId, stage: attempt.stage } });
      const slots = nextWeekendSlots();
      const next = await prisma.stageAttempt.create({
        data: {
          studentId: attempt.studentId,
          stage: attempt.stage,
          attemptNumber: existing + 1,
          status: "availability_requested",
          availabilityOptions: slots as unknown as Prisma.InputJsonValue,
        },
      });
      await prisma.student.update({
        where: { id: attempt.studentId },
        data: { currentStatus: "availability_requested", currentAttemptId: next.id },
      });
      await sendMessage(prisma, {
        studentId: attempt.studentId,
        attemptId: next.id,
        templateKey: "availability_request",
        payload: { stage: attempt.stage, slots, reattempt: true },
      });
      break;
    }
    case "escalate_no_response":
      // flag only — surfaced on the dashboard via availability_requested count
      break;
    case "redirect_final":
      // handoff already presented on the student portal
      break;
  }
}
