import { prisma } from "./prisma";
import { getLLM } from "./llm";
import { getSetting } from "./settings";
import type { Prisma } from "@prisma/client";

/**
 * §8.2 — assemble a TR attempt's data, call the LLM with the configured prompt,
 * save a `reports` row with the source_data snapshot for reproducibility.
 */
export async function generateTrReport(attemptId: string, actorId?: string | null) {
  const attempt = await prisma.stageAttempt.findUnique({
    where: { id: attemptId },
    include: {
      student: { include: { bucket: true } },
      panelFeedback: { include: { panelist: true } },
    },
  });
  if (!attempt) throw new Error("Attempt not found");
  // Every stage can produce a report (per the bucket-flow diagram).

  // prior-stage performance for context
  const history = await prisma.stageAttempt.findMany({
    where: { studentId: attempt.studentId },
    orderBy: { createdAt: "asc" },
    select: { stage: true, attemptNumber: true, score: true, result: true, remarks: true },
  });

  const sourceData = {
    student: { name: attempt.student.name, bucket: attempt.student.bucket?.name ?? null },
    stage: attempt.stage,
    score: attempt.score,
    result: attempt.result,
    remarks: attempt.remarks,
    panelFeedback: attempt.panelFeedback.map((f) => ({
      panelist: f.panelist.name,
      scores: f.scores,
      strengths: f.strengths,
      weaknesses: f.weaknesses,
      recommendation: f.recommendation,
    })),
    history,
  };

  const template = await getSetting("ai_report_template");
  const promptVersion = await getSetting("ai_report_prompt_version");
  const llm = getLLM();
  const content = await llm.generateText({
    system: template,
    user: `Write the ${attempt.stage.toUpperCase()} report for ${attempt.student.name}.\n\nData:\n${JSON.stringify(
      sourceData,
      null,
      2
    )}`,
  });

  const report = await prisma.report.create({
    data: {
      attemptId,
      studentId: attempt.studentId,
      stage: attempt.stage,
      sourceData: sourceData as Prisma.InputJsonValue,
      promptVersion,
      content,
      model: llm.model,
      generatedById: actorId ?? null,
      status: "generated",
    },
  });
  return report;
}
