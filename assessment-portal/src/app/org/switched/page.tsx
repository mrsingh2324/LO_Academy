import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { StageBadge } from "@/lib/ui";

export const dynamic = "force-dynamic";

export default async function SwitchedFlows() {
  const students = await prisma.student.findMany({
    where: { anomalousFlow: true, deletedAt: null },
    include: { bucket: true, attempts: { orderBy: [{ stage: "asc" }, { attemptNumber: "asc" }] } },
    orderBy: { name: "asc" },
  });

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-zinc-900">Switched / Anomalous Flows</h1>
        <p className="text-sm text-zinc-500">
          {students.length} student{students.length === 1 ? "" : "s"} who changed buckets mid-journey (e.g. switched into Bucket A
          and went straight to TR1, skipping the bucket&apos;s earlier stages).
        </p>
      </div>

      {students.length === 0 ? (
        <div className="rounded-xl border border-zinc-200 bg-white p-10 text-center text-sm text-zinc-400">
          No anomalous flows detected.
        </div>
      ) : (
        <div className="space-y-3">
          {students.map((s) => (
            <div key={s.id} className="rounded-xl border border-amber-200 bg-amber-50/40 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Link href={`/org/students/${s.id}`} className="font-medium text-zinc-900 hover:text-violet-700">
                    {s.name}
                  </Link>
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900">
                    {s.switchedFromBucket} → A
                  </span>
                  <StageBadge stage={s.currentStage} />
                </div>
                <span className="text-xs text-zinc-400">{s.email}</span>
              </div>
              {s.flowNote && <p className="mt-2 text-sm text-zinc-700">{s.flowNote}</p>}
              <div className="mt-2 flex flex-wrap gap-1.5 text-xs text-zinc-500">
                {s.attempts.map((a) => (
                  <span key={a.id} className="rounded bg-white px-2 py-0.5 ring-1 ring-zinc-200">
                    {a.stage} #{a.attemptNumber}: {a.outcome ?? a.result ?? a.status}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
