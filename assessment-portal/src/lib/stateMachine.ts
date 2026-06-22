import { prisma } from "./prisma";
import { audit } from "./audit";
import { sendMessage, bookCalendarEvent } from "./adapters";
import { getSetting } from "./settings";
import {
  firstStageForBucket,
  nextStageInPipeline,
  isPanelStage,
  isTestStage,
  type Status,
  type Stage,
} from "./enums";
import { nextWeekendSlots } from "./slots";
import type { Prisma } from "@prisma/client";

// Allowed transitions (§6). Illegal transitions are rejected server-side.
const ALLOWED: Record<Status, Status[]> = {
  availability_requested: ["scheduled"],
  scheduled: ["awaiting_result"],
  awaiting_result: ["under_evaluation"],
  under_evaluation: ["evaluated"],
  evaluated: ["result_shared"],
  result_shared: ["passed", "failed"],
  passed: [],
  failed: [],
};

export class TransitionError extends Error {}

type Attempt = Prisma.StageAttemptGetPayload<{ include: { student: { include: { bucket: true } } } }>;

export interface TransitionContext {
  chosenSlot?: Date;
  score?: number;
  result?: "pass" | "fail";
  remarks?: string;
  evaluatorId?: string;
  availabilitySheetRef?: string;
  scoreSheetRef?: string;
}

/**
 * The single entry point for advancing an attempt. Validates the transition,
 * applies side effects (§6/§7), updates denormalized student fields, and
 * writes audit_log. Runs in one transaction.
 */
export async function transition(
  attemptId: string,
  to: Status,
  ctx: TransitionContext = {},
  actorId?: string | null
): Promise<Attempt> {
  return prisma.$transaction(async (tx) => {
    const attempt = (await tx.stageAttempt.findUnique({
      where: { id: attemptId },
      include: { student: { include: { bucket: true } } },
    })) as Attempt | null;
    if (!attempt) throw new TransitionError("Attempt not found");

    const from = attempt.status as Status;
    if (from === to) return attempt; // idempotent
    if (!ALLOWED[from]?.includes(to)) {
      throw new TransitionError(`Illegal transition: ${from} → ${to}`);
    }

    const stage = attempt.stage as Stage;
    const before = { status: from };
    const data: Prisma.StageAttemptUpdateInput = { status: to };

    // ---- side effects per target status ----
    if (to === "scheduled") {
      if (!ctx.chosenSlot) throw new TransitionError("chosenSlot required to schedule");
      data.chosenSlot = ctx.chosenSlot;
      data.scheduledAt = ctx.chosenSlot;
      if (ctx.availabilitySheetRef) data.availabilitySheetRef = ctx.availabilitySheetRef;
      // TR interviews get a calendar event (§6, §15)
      if (isPanelStage(stage)) {
        const eventId = await bookCalendarEvent({
          title: `${stage.toUpperCase()} — ${attempt.student.name}`,
          start: ctx.chosenSlot,
          attendees: [attempt.student.email],
        });
        data.calendarEventId = eventId;
      }
      await sendMessage(tx, {
        studentId: attempt.studentId,
        attemptId,
        templateKey: "schedule_confirmation",
        payload: { stage, scheduledAt: ctx.chosenSlot.toISOString() },
      });
      // enqueue reminders + fixed-slot send
      await enqueueReminders(tx, attemptId, ctx.chosenSlot);
      await tx.scheduledJob.create({
        data: { attemptId, type: "fixed_slot_send", runAt: ctx.chosenSlot, payload: { stage } },
      });
    }

    if (to === "awaiting_result") {
      if (isTestStage(stage)) {
        data.submittedAt = null;
        await sendMessage(tx, {
          studentId: attempt.studentId,
          attemptId,
          templateKey: "fixed_slot_test_send",
          payload: { stage },
        });
      } else {
        data.attendedAt = new Date();
        await sendMessage(tx, {
          studentId: attempt.studentId,
          attemptId,
          templateKey: "interview_invite",
          payload: { stage, calendarEventId: attempt.calendarEventId },
        });
      }
    }

    if (to === "under_evaluation") {
      if (isTestStage(stage)) {
        if (ctx.evaluatorId) data.evaluator = { connect: { id: ctx.evaluatorId } };
        data.submittedAt = new Date();
      }
    }

    if (to === "evaluated") {
      if (ctx.score !== undefined) data.score = ctx.score;
      if (ctx.result) data.result = ctx.result;
      if (ctx.remarks !== undefined) data.remarks = ctx.remarks;
      if (ctx.scoreSheetRef) data.scoreSheetRef = ctx.scoreSheetRef;
    }

    if (to === "result_shared") {
      const result = (ctx.result ?? attempt.result) as "pass" | "fail";
      await sendMessage(tx, {
        studentId: attempt.studentId,
        attemptId,
        templateKey: result === "pass" ? "result_pass" : isTestStage(stage) ? "result_fail_test" : "result_fail_tr",
        payload: { stage, score: attempt.score, remarks: attempt.remarks },
      });
    }

    if (to === "passed") {
      await handlePass(tx, attempt, actorId);
    }

    if (to === "failed") {
      await handleFail(tx, attempt, actorId);
    }

    const updated = (await tx.stageAttempt.update({
      where: { id: attemptId },
      data,
      include: { student: true },
    })) as Attempt;

    // mirror status onto the student (denormalized for listing)
    await tx.student.update({
      where: { id: attempt.studentId },
      data: { currentStatus: to },
    });

    await audit(tx, {
      entity: "stage_attempt",
      entityId: attemptId,
      action: `transition:${from}->${to}`,
      actorId,
      before,
      after: { status: to, ...ctx },
    });

    return updated;
  });
}

async function enqueueReminders(tx: Prisma.TransactionClient, attemptId: string, slot: Date) {
  const offsets = await getSetting("reminder_offsets");
  for (const off of offsets) {
    const runAt = new Date(slot);
    if (off === "T-1d") runAt.setDate(runAt.getDate() - 1);
    else if (off === "T-2h") runAt.setHours(runAt.getHours() - 2);
    await tx.scheduledJob.create({
      data: { attemptId, type: "send_reminder", runAt, payload: { offset: off } },
    });
  }
}

// §7 rule 7 — pass: share + branch along the BUCKET PIPELINE.
async function handlePass(tx: Prisma.TransactionClient, attempt: Attempt, actorId?: string | null) {
  const stage = attempt.stage as Stage;
  const bucket = attempt.student.bucket?.name ?? null;
  const ns = nextStageInPipeline(bucket, stage);

  if (ns === null) {
    // Last stage in this bucket's pipeline cleared → Placement pool (terminal).
    await tx.student.update({
      where: { id: attempt.studentId },
      data: { currentStage: "placement_pool", finalPortalRedirectedAt: new Date() },
    });
    await tx.scheduledJob.create({
      data: { attemptId: attempt.id, type: "redirect_final", runAt: new Date(), payload: {} },
    });
    await sendMessage(tx, {
      studentId: attempt.studentId,
      attemptId: attempt.id,
      templateKey: "selected_redirect",
      payload: { stage },
    });
    return;
  }

  // create next stage attempt in availability_requested + open availability
  const slots = nextWeekendSlots();
  const next = await tx.stageAttempt.create({
    data: {
      studentId: attempt.studentId,
      stage: ns,
      attemptNumber: 1,
      status: "availability_requested",
      availabilityOptions: slots as unknown as Prisma.InputJsonValue,
    },
  });
  await tx.student.update({
    where: { id: attempt.studentId },
    data: { currentStage: ns, currentAttemptId: next.id },
  });
  // prep doc for the next round (pass-forward) + ask availability
  await tx.prepArtifact.create({
    data: { attemptId: next.id, type: "pass_forward_prep", body: `Preparation for ${ns.toUpperCase()}.` },
  });
  await sendMessage(tx, {
    studentId: attempt.studentId,
    attemptId: next.id,
    templateKey: "availability_request",
    payload: { stage: ns, slots },
  });
  await audit(tx, {
    entity: "stage_attempt",
    entityId: next.id,
    action: "attempt_created:pass_advance",
    actorId,
    after: { stage: ns },
  });
}

// §7 rule 8 — fail follow-up.
async function handleFail(tx: Prisma.TransactionClient, attempt: Attempt, actorId?: string | null) {
  const stage = attempt.stage as Stage;
  if (isTestStage(stage)) {
    const days = await getSetting("react_prep_days");
    const reopenAt = new Date();
    reopenAt.setDate(reopenAt.getDate() + days);
    await tx.prepArtifact.create({
      data: {
        attemptId: attempt.id,
        type: "react_guideline",
        body: `Preparation guideline for your ${stage.toUpperCase()} reattempt.`,
        reopenAt,
      },
    });
    await tx.scheduledJob.create({
      data: { attemptId: attempt.id, type: "reopen_attempt", runAt: reopenAt, payload: { stage } },
    });
  } else {
    // TR fail → repeat the failed round (§14.1 default routing)
    await tx.prepArtifact.create({
      data: { attemptId: attempt.id, type: "tr_prep", body: `Retry preparation for ${stage.toUpperCase()}.` },
    });
    await tx.scheduledJob.create({
      data: { attemptId: attempt.id, type: "reopen_attempt", runAt: new Date(), payload: { stage } },
    });
  }
  await audit(tx, {
    entity: "stage_attempt",
    entityId: attempt.id,
    action: "fail_followup",
    actorId,
    after: { stage, routing: isTestStage(stage) ? "reopen_after_prep" : "repeat_round" },
  });
}

/**
 * Entry point (§7 rule 1): create student (upsert on externalRef) and, if the
 * bucket has a pipeline, the first attempt in availability_requested. The first
 * stage is bucket-dependent (Nxtmock=A, Dev test=B, TR1=C). Buckets with no
 * pipeline (e.g. D / not qualified) are stored without an attempt. Idempotent.
 */
export async function onboardStudent(input: {
  externalRef: string;
  name: string;
  email: string;
  phone?: string;
  bucketId?: string | null;
  yearOfGraduation?: number | null;
  offlineClearedAt?: Date;
}) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.student.findUnique({ where: { externalRef: input.externalRef } });
    if (existing) return existing; // idempotent

    const bucket = input.bucketId ? await tx.bucket.findUnique({ where: { id: input.bucketId } }) : null;
    const first = firstStageForBucket(bucket?.name);

    const student = await tx.student.create({
      data: {
        externalRef: input.externalRef,
        name: input.name,
        email: input.email,
        phone: input.phone,
        bucketId: input.bucketId ?? null,
        yearOfGraduation: input.yearOfGraduation ?? null,
        offlineClearedAt: first ? input.offlineClearedAt ?? new Date() : null,
        currentStage: first ?? "rejected",
        currentStatus: first ? "availability_requested" : "not_qualified",
      },
    });

    if (!first) {
      await audit(tx, {
        entity: "student",
        entityId: student.id,
        action: "onboarded:not_qualified",
        after: { externalRef: input.externalRef, bucket: bucket?.name ?? null },
      });
      return student;
    }

    const slots = nextWeekendSlots();
    const attempt = await tx.stageAttempt.create({
      data: {
        studentId: student.id,
        stage: first,
        attemptNumber: 1,
        status: "availability_requested",
        availabilityOptions: slots as unknown as Prisma.InputJsonValue,
      },
    });
    await tx.student.update({ where: { id: student.id }, data: { currentAttemptId: attempt.id } });
    await sendMessage(tx, {
      studentId: student.id,
      attemptId: attempt.id,
      templateKey: "availability_request",
      payload: { stage: first, slots },
    });
    await tx.scheduledJob.create({
      data: { attemptId: attempt.id, type: "escalate_no_response", runAt: addDays(new Date(), 3), payload: {} },
    });
    await audit(tx, {
      entity: "student",
      entityId: student.id,
      action: "onboarded",
      after: { externalRef: input.externalRef, bucket: bucket?.name ?? null, stage: first },
    });
    return student;
  });
}

function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

/**
 * Drives an attempt forward through the legal chain to its final pass/fail
 * (§7 rules 6–8). Used by score entry (React) and panel feedback (TR). Each
 * step is an audited, guarded transition; safe to call from any pre-result
 * status.
 */
export async function submitResult(
  attemptId: string,
  ctx: { score: number; result: "pass" | "fail"; remarks?: string; evaluatorId?: string },
  actorId?: string | null
) {
  const order: Status[] = ["scheduled", "awaiting_result", "under_evaluation", "evaluated", "result_shared"];
  let current = await prisma.stageAttempt.findUnique({ where: { id: attemptId } });
  if (!current) throw new TransitionError("Attempt not found");

  const startIdx = order.indexOf(current.status as Status);
  // If still in availability_requested, schedule "now" so the chain can proceed.
  if ((current.status as Status) === "availability_requested") {
    await transition(attemptId, "scheduled", { chosenSlot: new Date() }, actorId);
  }
  for (let i = Math.max(startIdx, 0); i < order.length - 1; i++) {
    const to = order[i + 1];
    const stepCtx =
      to === "under_evaluation"
        ? { evaluatorId: ctx.evaluatorId }
        : to === "evaluated"
          ? { score: ctx.score, result: ctx.result, remarks: ctx.remarks }
          : to === "result_shared"
            ? { result: ctx.result }
            : {};
    const cur = await prisma.stageAttempt.findUnique({ where: { id: attemptId } });
    if (ALLOWED[cur!.status as Status]?.includes(to)) {
      await transition(attemptId, to, stepCtx, actorId);
    }
  }
  // result_shared -> passed | failed
  await transition(attemptId, ctx.result === "pass" ? "passed" : "failed", { result: ctx.result }, actorId);
  return prisma.stageAttempt.findUnique({ where: { id: attemptId }, include: { student: true } });
}

export { ALLOWED };
