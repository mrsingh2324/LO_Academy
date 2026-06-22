import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getActor } from "@/lib/auth";
import { StageBadge, StatusBadge, fmtDate } from "@/lib/ui";
import { STAGE_LABELS, isTestStage, isPanelStage } from "@/lib/enums";
import {
  AskAvailabilityButton,
  ScoreForm,
  FeedbackForm,
  GenerateReportButton,
} from "@/components/StudentActions";

export const dynamic = "force-dynamic";

const PRE_RESULT = ["availability_requested", "scheduled", "awaiting_result", "under_evaluation"];

const DETAIL_LABELS: Record<string, string> = {
  cycle: "Cycle",
  offlineDate: "Offline test date",
  accessStatus: "Access status",
  accessGivenDate: "Access given",
  attemptedStatus: "Attempted",
  score: "Score",
  reportLink: "Report",
  result: "Result",
  resultSharedStatus: "Result shared",
  interviewer: "Interviewer",
  boa: "BOA",
  recordingLink: "Recording",
  meetLink: "Meet link",
  finalStatus: "Final status",
  movedToNext: "Moved to next",
};

function isUrl(v: unknown): v is string {
  return typeof v === "string" && /^https?:\/\//.test(v);
}

// Renders an attempt's lossless `details` JSON as a clean key/value grid.
function AttemptDetails({ details }: { details: Record<string, unknown> }) {
  const entries = Object.entries(details).filter(([, v]) => v !== null && v !== undefined && v !== "");
  if (entries.length === 0) return null;
  return (
    <div className="mt-3 rounded-lg border border-zinc-200 bg-zinc-50 p-3">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">Round details</div>
      <dl className="grid grid-cols-1 gap-x-6 gap-y-1.5 text-sm md:grid-cols-2">
        {entries.map(([k, v]) => (
          <div key={k} className="flex gap-2">
            <dt className="shrink-0 text-zinc-500">{DETAIL_LABELS[k] ?? k}:</dt>
            <dd className="min-w-0 break-words text-zinc-800">
              {isUrl(v) ? (
                <a href={v} target="_blank" className="text-violet-600 hover:underline">
                  open ↗
                </a>
              ) : (
                String(v)
              )}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export default async function StudentDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [student, actor] = await Promise.all([
    prisma.student.findUnique({
      where: { id },
      include: {
        bucket: true,
        attempts: {
          orderBy: { createdAt: "asc" },
          include: {
            panelFeedback: { include: { panelist: true } },
            reports: true,
            prepArtifacts: true,
          },
        },
        reports: { orderBy: { createdAt: "desc" } },
        messages: { orderBy: { createdAt: "desc" }, take: 12 },
      },
    }),
    getActor(),
  ]);
  if (!student) notFound();

  const audit = await prisma.auditLog.findMany({
    where: { OR: [{ entityId: student.id }, { entityId: { in: student.attempts.map((a) => a.id) } }] },
    orderBy: { at: "desc" },
    take: 15,
  });

  const role = actor?.role ?? "ops";
  const canScore = ["ops", "admin", "evaluator"].includes(role);
  const canFeedback = ["ops", "admin", "panelist"].includes(role);
  const canAct = ["ops", "admin"].includes(role);

  return (
    <div className="space-y-6">
      <Link href="/org/roster" className="text-sm text-zinc-500 hover:underline">
        ← Back to roster
      </Link>

      {/* header */}
      <div className="rounded-xl border border-zinc-200 bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-zinc-900">{student.name}</h1>
            <p className="text-sm text-zinc-500">
              {student.email} · {student.phone ?? "no phone"}
              {student.yearOfGraduation ? ` · YOG ${student.yearOfGraduation}` : ""} · {student.externalRef}
            </p>
            {student.resumeUrl && (
              <a href={student.resumeUrl} target="_blank" className="mt-1 inline-block text-sm text-violet-600 hover:underline">
                View resume ↗
              </a>
            )}
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <StageBadge stage={student.currentStage} />
              <StatusBadge status={student.currentStatus} />
              {student.bucket && <span className="text-sm text-zinc-500">Bucket {student.bucket.name}</span>}
              {student.anomalousFlow && (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900 ring-1 ring-amber-300">
                  ⚠ Switched {student.switchedFromBucket} → A
                </span>
              )}
            </div>
            {student.anomalousFlow && student.flowNote && (
              <p className="mt-1 text-xs text-amber-700">{student.flowNote}</p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {canAct && <AskAvailabilityButton studentId={student.id} />}
            <Link
              href={`/student/${student.id}`}
              target="_blank"
              className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
            >
              Open student view ↗
            </Link>
          </div>
        </div>
        {student.finalPortalRedirectedAt && (
          <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            Handed off to the downstream portal on {fmtDate(student.finalPortalRedirectedAt)}.
          </p>
        )}
      </div>

      {/* timeline */}
      <div>
        <h2 className="mb-3 text-sm font-semibold text-zinc-700">Timeline</h2>
        <ol className="space-y-4">
          {student.attempts.map((a) => {
            const showScore = isTestStage(a.stage) && PRE_RESULT.includes(a.status) && canScore;
            const showFeedback = isPanelStage(a.stage) && PRE_RESULT.includes(a.status) && canFeedback;
            const showReport = ["evaluated", "result_shared", "passed", "failed"].includes(a.status) && canAct;
            return (
              <li key={a.id} className="rounded-xl border border-zinc-200 bg-white p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <StageBadge stage={a.stage} />
                    <span className="text-xs text-zinc-400">attempt #{a.attemptNumber}</span>
                    <StatusBadge status={a.status} />
                  </div>
                  <div className="text-sm text-zinc-600">
                    {a.outcome && (
                      <span className="mr-2 rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700">{a.outcome}</span>
                    )}
                    {a.score != null && (
                      <span className="font-medium text-zinc-900">
                        {a.score} {a.result !== "pending" && `· ${a.result}`}
                      </span>
                    )}
                  </div>
                </div>

                <dl className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 text-sm text-zinc-600 md:grid-cols-3">
                  <div>Scheduled: {fmtDate(a.scheduledAt)}</div>
                  {isTestStage(a.stage) ? <div>Submitted: {fmtDate(a.submittedAt)}</div> : <div>Attended: {fmtDate(a.attendedAt)}</div>}
                  {a.calendarEventId && <div className="truncate">Calendar: {a.calendarEventId}</div>}
                  {a.prepDueUntil && <div>Prep due: {fmtDate(a.prepDueUntil)}</div>}
                </dl>
                {a.remarks && <p className="mt-2 text-sm text-zinc-700">Remarks: {a.remarks}</p>}

                {a.details && <AttemptDetails details={a.details as Record<string, unknown>} />}

                {a.panelFeedback.length > 0 && (
                  <div className="mt-3 space-y-1 rounded-lg bg-zinc-50 p-3 text-sm">
                    <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Panel feedback</div>
                    {a.panelFeedback.map((f) => (
                      <div key={f.id} className="text-zinc-700">
                        <span className="font-medium">{f.panelist.name}</span> — {f.recommendation}. {f.strengths}
                      </div>
                    ))}
                  </div>
                )}

                {a.prepArtifacts.length > 0 && (
                  <div className="mt-2 text-xs text-zinc-500">
                    Prep docs: {a.prepArtifacts.map((p) => p.type).join(", ")}
                  </div>
                )}

                {a.reports.length > 0 && (
                  <div className="mt-2 text-xs text-violet-600">
                    {a.reports.length} report{a.reports.length === 1 ? "" : "s"} generated (see below)
                  </div>
                )}

                <div className="mt-3 space-y-3">
                  {showScore && <ScoreForm attemptId={a.id} />}
                  {showFeedback && <FeedbackForm attemptId={a.id} />}
                  {showReport && <GenerateReportButton attemptId={a.id} />}
                </div>
              </li>
            );
          })}
        </ol>
      </div>

      {/* reports */}
      {student.reports.length > 0 && (
        <div>
          <h2 className="mb-3 text-sm font-semibold text-zinc-700">Generated reports</h2>
          <div className="space-y-3">
            {student.reports.map((r) => (
              <details key={r.id} className="rounded-xl border border-zinc-200 bg-white p-4">
                <summary className="cursor-pointer text-sm font-medium text-zinc-800">
                  {STAGE_LABELS[r.stage]} report · {r.model} · {fmtDate(r.createdAt)}
                </summary>
                <pre className="mt-3 whitespace-pre-wrap text-sm text-zinc-700">{r.content}</pre>
              </details>
            ))}
          </div>
        </div>
      )}

      {/* comms + audit */}
      <div className="grid gap-6 md:grid-cols-2">
        <section className="rounded-xl border border-zinc-200 bg-white p-4">
          <h2 className="mb-2 text-sm font-semibold text-zinc-700">Messages</h2>
          <ul className="space-y-1 text-sm text-zinc-600">
            {student.messages.map((m) => (
              <li key={m.id} className="flex justify-between">
                <span>{m.templateKey}</span>
                <span className="text-xs text-zinc-400">{fmtDate(m.sentAt ?? m.createdAt)}</span>
              </li>
            ))}
            {student.messages.length === 0 && <li className="text-zinc-400">No messages.</li>}
          </ul>
        </section>
        <section className="rounded-xl border border-zinc-200 bg-white p-4">
          <h2 className="mb-2 text-sm font-semibold text-zinc-700">Audit log</h2>
          <ul className="space-y-1 text-sm text-zinc-600">
            {audit.map((a) => (
              <li key={a.id} className="flex justify-between gap-2">
                <span className="truncate">{a.action}</span>
                <span className="shrink-0 text-xs text-zinc-400">{fmtDate(a.at)}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
