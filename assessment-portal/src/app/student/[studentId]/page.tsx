import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSetting } from "@/lib/settings";
import { StageBadge, StatusBadge, fmtDate, fmtDay } from "@/lib/ui";
import { STAGE_LABELS } from "@/lib/enums";
import SlotPicker from "@/components/SlotPicker";
import QueryForm from "@/components/QueryForm";

export const dynamic = "force-dynamic";

type Slot = { iso: string; label: string };

export default async function StudentPortal({ params }: { params: Promise<{ studentId: string }> }) {
  const { studentId } = await params;
  const student = await prisma.student.findUnique({
    where: { id: studentId },
    include: {
      attempts: { orderBy: { createdAt: "asc" }, include: { prepArtifacts: true } },
      reports: true,
      queries: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!student) notFound();

  const active = student.attempts.find((a) => a.id === student.currentAttemptId) ?? student.attempts.at(-1);
  const portalUrl = await getSetting("external_final_portal_url");
  const selected = student.currentStage === "placement_pool";

  return (
    <div className="mx-auto max-w-2xl px-6 py-10">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-zinc-900">Hi {student.name.split(" ")[0]} 👋</h1>
        <p className="text-sm text-zinc-500">Your assessment journey</p>
      </div>

      {/* current state card */}
      <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
        {selected ? (
          <div className="text-center">
            <div className="text-lg font-semibold text-emerald-700">🎉 You&apos;ve reached the Placement Pool!</div>
            <p className="mt-1 text-sm text-zinc-600">Continue to the next stage on our placement portal.</p>
            <a
              href={portalUrl}
              className="mt-4 inline-block rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-emerald-700"
            >
              Continue to placement ↗
            </a>
          </div>
        ) : active ? (
          <div>
            <div className="flex items-center gap-2">
              <StageBadge stage={active.stage} />
              <StatusBadge status={active.status} />
            </div>

            {active.status === "availability_requested" && (
              <div className="mt-4">
                <h2 className="text-sm font-semibold text-zinc-800">Pick your slot for {STAGE_LABELS[active.stage]}</h2>
                <p className="mb-3 text-xs text-zinc-500">Assessments run on fixed weekend slots.</p>
                <SlotPicker attemptId={active.id} slots={(active.availabilityOptions as Slot[]) ?? []} />
              </div>
            )}

            {active.status === "scheduled" && (
              <p className="mt-4 text-sm text-zinc-700">
                You&apos;re scheduled for <span className="font-medium">{fmtDate(active.scheduledAt)}</span>. We&apos;ll send
                joining details on the day.
              </p>
            )}

            {active.status === "awaiting_result" && (
              <p className="mt-4 text-sm text-zinc-700">
                Your {STAGE_LABELS[active.stage]} is in progress. Results will appear here once evaluated.
              </p>
            )}

            {["under_evaluation", "evaluated", "result_shared"].includes(active.status) && (
              <p className="mt-4 text-sm text-zinc-700">Your submission is being evaluated. Hang tight!</p>
            )}
          </div>
        ) : (
          <p className="text-sm text-zinc-500">No active stage.</p>
        )}
      </div>

      {/* results */}
      <h2 className="mb-3 mt-8 text-sm font-semibold text-zinc-700">Your results</h2>
      <div className="space-y-3">
        {student.attempts
          .filter((a) => a.result !== "pending")
          .map((a) => (
            <div key={a.id} className="rounded-xl border border-zinc-200 bg-white p-4">
              <div className="flex items-center justify-between">
                <StageBadge stage={a.stage} />
                <span className={`text-sm font-semibold ${a.result === "pass" ? "text-emerald-600" : "text-rose-600"}`}>
                  {a.result === "pass" ? "Passed" : "Did not clear"} · {a.score}
                </span>
              </div>
              {a.remarks && <p className="mt-2 text-sm text-zinc-600">{a.remarks}</p>}
              {a.prepArtifacts.length > 0 && (
                <div className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
                  <div className="font-medium">Preparation materials</div>
                  {a.prepArtifacts.map((p) => (
                    <p key={p.id} className="mt-1">
                      {p.body}
                      {p.reopenAt && <span className="text-xs"> (reattempt opens {fmtDay(p.reopenAt)})</span>}
                    </p>
                  ))}
                </div>
              )}
            </div>
          ))}
        {student.attempts.filter((a) => a.result !== "pending").length === 0 && (
          <p className="text-sm text-zinc-400">No results yet.</p>
        )}
      </div>

      {/* Ask the assessments team */}
      <h2 className="mb-3 mt-8 text-sm font-semibold text-zinc-700">Questions for the assessments team</h2>
      <div className="rounded-xl border border-zinc-200 bg-white p-4">
        <QueryForm studentId={student.id} />
      </div>

      {student.queries.length > 0 && (
        <div className="mt-4 space-y-3">
          {student.queries.map((q) => (
            <div key={q.id} className="rounded-xl border border-zinc-200 bg-white p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-zinc-800">{q.subject || "Query"}</span>
                <span className={`text-xs font-medium ${q.status === "answered" ? "text-emerald-600" : "text-amber-600"}`}>
                  {q.status === "answered" ? "Answered" : "Awaiting reply"}
                </span>
              </div>
              <p className="mt-1 text-sm text-zinc-600">{q.message}</p>
              <p className="mt-1 text-xs text-zinc-400">{fmtDate(q.createdAt)}</p>
              {q.response && (
                <div className="mt-2 rounded-lg bg-violet-50 p-3 text-sm text-violet-900">
                  <span className="font-medium">Team response:</span> {q.response}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
