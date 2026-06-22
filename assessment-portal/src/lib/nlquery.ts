import { z } from "zod";
import { prisma } from "./prisma";
import { getLLM } from "./llm";
import { STUDENT_STAGES, STAGES, RESULTS, STATUSES } from "./enums";
import type { Prisma } from "@prisma/client";

/**
 * §8.1 — translate NL → a CONSTRAINED, read-only JSON filter (never SQL).
 * Every field/operator is validated against this allowlist before running a
 * parameterized Prisma query. Anything off-allowlist is rejected.
 */
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const FilterSchema = z
  .object({
    // attempt-level
    stage: z.enum(STAGES).optional(), // nxtmock|dev_test|tr1|tr2 (for attempt filtering)
    result: z.enum(RESULTS).optional(),
    status: z.enum(STATUSES).optional(),
    scoreGte: z.number().optional(),
    scoreLte: z.number().optional(),
    // attempt date window (the round was attended/interviewed within this range)
    attendedFrom: isoDate.optional(),
    attendedTo: isoDate.optional(),
    // student-level
    currentStage: z.enum(STUDENT_STAGES).optional(),
    bucket: z.string().max(64).optional(),
    yearOfGraduation: z.number().int().optional(),
    nameContains: z.string().max(80).optional(),
  })
  .strict();

export type Filter = z.infer<typeof FilterSchema>;

function systemPrompt(today: string): string {
  return `You translate a recruiter's natural-language question into a JSON filter for an assessment database.
Today's date is ${today} (ISO). Buckets define different journeys: A = Nxtmock→TR1→TR2, B = Dev test→TR1→TR2, C = TR1 only, D = Not Qualified.
Output ONLY JSON matching this shape (omit fields you don't need):
{
  "stage": "nxtmock|dev_test|tr1|tr2",  // the round being asked about / appeared for
  "result": "pass|fail|pending",
  "status": "availability_requested|scheduled|awaiting_result|under_evaluation|evaluated|result_shared|passed|failed",
  "scoreGte": number, "scoreLte": number,
  "attendedFrom": "YYYY-MM-DD",          // round attended/interviewed on or after this date
  "attendedTo": "YYYY-MM-DD",            // round attended/interviewed on or before this date
  "currentStage": "nxtmock|dev_test|tr1|tr2|placement_pool|rejected",
  "bucket": "string",                   // bucket name, e.g. "A"
  "yearOfGraduation": number,           // e.g. 2026
  "nameContains": "string"
}
Resolve RELATIVE DATES against today's date into concrete YYYY-MM-DD:
- "last week" = the 7 days before today (attendedFrom = today-7, attendedTo = today).
- "this month" = first day of current month .. today. "in April" = that month's range. "yesterday" = that single day (from=to).
"appeared/attended/interviewed for TR1 last week" => {"stage":"tr1","attendedFrom":"<today-7>","attendedTo":"<today>"}.
"failed TR1" => {"stage":"tr1","result":"fail"}. "bucket A" => {"bucket":"A"}. "2026 graduates" => {"yearOfGraduation":2026}.
"in the placement pool"/"placed" => {"currentStage":"placement_pool"}. "not qualified" => {"currentStage":"rejected"}.
Never invent fields outside the shape.`;
}

export async function translateToFilter(question: string, today?: string): Promise<Filter> {
  const llm = getLLM();
  const todayStr = today ?? new Date().toISOString().slice(0, 10);
  const raw = await llm.generateJson({ system: systemPrompt(todayStr), user: question });
  // Validate against the allowlist — rejects anything unexpected.
  return FilterSchema.parse(raw);
}

export function buildWhere(filter: Filter): Prisma.StudentWhereInput {
  const where: Prisma.StudentWhereInput = { deletedAt: null };
  if (filter.bucket) where.bucket = { name: { equals: filter.bucket } };
  if (filter.currentStage) where.currentStage = filter.currentStage;
  if (filter.yearOfGraduation !== undefined) where.yearOfGraduation = filter.yearOfGraduation;
  if (filter.nameContains) where.name = { contains: filter.nameContains };

  const attemptWhere: Prisma.StageAttemptWhereInput = {};
  if (filter.stage) attemptWhere.stage = filter.stage;
  if (filter.result) attemptWhere.result = filter.result;
  if (filter.status) attemptWhere.status = filter.status;
  if (filter.scoreGte !== undefined) attemptWhere.score = { gte: filter.scoreGte };
  if (filter.scoreLte !== undefined)
    attemptWhere.score = { ...(attemptWhere.score as object), lte: filter.scoreLte };
  if (filter.attendedFrom) attemptWhere.attendedAt = { gte: new Date(filter.attendedFrom) };
  if (filter.attendedTo)
    attemptWhere.attendedAt = { ...(attemptWhere.attendedAt as object), lte: new Date(filter.attendedTo + "T23:59:59") };

  if (Object.keys(attemptWhere).length > 0) where.attempts = { some: attemptWhere };
  return where;
}

export async function runNlQuery(question: string, actorId?: string | null) {
  let filter: Filter;
  try {
    filter = await translateToFilter(question);
  } catch {
    await prisma.aiQueryLog.create({
      data: { actorId: actorId ?? null, question, status: "rejected", resultCount: 0 },
    });
    return { status: "rejected" as const, filter: null, students: [] };
  }

  const where = buildWhere(filter);
  const students = await prisma.student.findMany({
    where,
    include: { bucket: true, attempts: { orderBy: { createdAt: "desc" } } },
    orderBy: { name: "asc" },
  });

  await prisma.aiQueryLog.create({
    data: {
      actorId: actorId ?? null,
      question,
      generatedFilter: filter as Prisma.InputJsonValue,
      resultCount: students.length,
      status: "ok",
    },
  });

  return { status: "ok" as const, filter, students };
}
