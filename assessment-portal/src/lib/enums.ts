// Application-level enums (SQLite has no native enum support).
// These are the source of truth; zod schemas validate against them.

// Assessment stages that produce a stage_attempt. The FIRST stage differs by
// bucket (see BUCKET_PIPELINES) — Nxtmock (A), Dev test (B), or TR1 (C).
export const STAGES = ["nxtmock", "dev_test", "tr1", "tr2"] as const;
export type Stage = (typeof STAGES)[number];

// Where a student currently sits. `placement_pool` is the terminal success
// state (the diagram's bottom node); `rejected` = not offline-qualified.
export const STUDENT_STAGES = ["nxtmock", "dev_test", "tr1", "tr2", "placement_pool", "rejected"] as const;
export type StudentStage = (typeof STUDENT_STAGES)[number];

// Per-bucket assessment journey (ordered). Source of truth for advancement.
export const BUCKET_PIPELINES: Record<string, Stage[]> = {
  A: ["nxtmock", "tr1", "tr2"],
  B: ["dev_test", "tr1", "tr2"],
  C: ["tr1"],
  D: [], // Offline Not Qualified — not in the assessment flow
};

export function firstStageForBucket(bucket: string | null | undefined): Stage | null {
  if (!bucket) return null;
  return BUCKET_PIPELINES[bucket]?.[0] ?? null;
}

// Next stage in the bucket's pipeline, or null if this was the last (→ placement_pool).
export function nextStageInPipeline(bucket: string | null | undefined, stage: Stage): Stage | null {
  const pipe = (bucket && BUCKET_PIPELINES[bucket]) || [];
  const idx = pipe.indexOf(stage);
  if (idx === -1) return null;
  return pipe[idx + 1] ?? null;
}

// Stage options to show in the roster filter for a given bucket selection.
// Bucket A → Nxtmock/TR1/TR2; B → Dev test/TR1/TR2; C → TR1; D → Not qualified.
export function stageOptionsForBucket(bucket?: string | null): StudentStage[] {
  if (bucket === "D") return ["rejected"];
  if (bucket && BUCKET_PIPELINES[bucket]) {
    return [...BUCKET_PIPELINES[bucket], "placement_pool"];
  }
  return ["nxtmock", "dev_test", "tr1", "tr2", "placement_pool", "rejected"];
}

// Test stages are scored (evaluator); panel stages get TR feedback (panelist).
export function isTestStage(stage: string): boolean {
  return stage === "nxtmock" || stage === "dev_test";
}
export function isPanelStage(stage: string): boolean {
  return stage === "tr1" || stage === "tr2";
}

// §6 state machine statuses
export const STATUSES = [
  "availability_requested",
  "scheduled",
  "awaiting_result",
  "under_evaluation",
  "evaluated",
  "result_shared",
  "passed",
  "failed",
] as const;
export type Status = (typeof STATUSES)[number];

export const RESULTS = ["pending", "pass", "fail"] as const;
export type Result = (typeof RESULTS)[number];

export const ROLES = ["admin", "ops", "evaluator", "panelist"] as const;
export type Role = (typeof ROLES)[number];

export const CHANNELS = ["email", "sms", "whatsapp"] as const;
export const RECOMMENDATIONS = ["advance", "reject", "borderline"] as const;
export const PREP_TYPES = ["react_guideline", "tr_prep", "pass_forward_prep"] as const;
export const REPORT_STATUSES = ["generated", "reviewed", "shared"] as const;

export const STAGE_LABELS: Record<string, string> = {
  nxtmock: "Nxtmock",
  dev_test: "Dev Test",
  tr1: "Technical Round 1",
  tr2: "Technical Round 2",
  placement_pool: "Placement Pool",
  rejected: "Not Qualified",
};

export const STATUS_LABELS: Record<string, string> = {
  availability_requested: "Availability Requested",
  scheduled: "Scheduled",
  awaiting_result: "Awaiting Result",
  under_evaluation: "Under Evaluation",
  evaluated: "Evaluated",
  result_shared: "Result Shared",
  passed: "Passed",
  failed: "Failed",
  not_qualified: "Not Qualified",
};
