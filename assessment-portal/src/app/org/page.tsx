import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { STAGE_LABELS } from "@/lib/enums";
import { StageBadge } from "@/lib/ui";
import RunJobsButton from "@/components/RunJobsButton";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const pendingJobs = await prisma.scheduledJob.count({ where: { status: "pending", runAt: { lte: new Date() } } });
  const [byStage, byBucket, awaitingEval, panelPending, noResponse, total, reports] = await Promise.all([
    prisma.student.groupBy({ by: ["currentStage"], _count: true, where: { deletedAt: null } }),
    prisma.student.findMany({ where: { deletedAt: null }, select: { bucket: { select: { name: true } } } }),
    prisma.stageAttempt.count({ where: { stage: { in: ["nxtmock", "dev_test"] }, status: { in: ["awaiting_result", "under_evaluation"] } } }),
    prisma.stageAttempt.count({ where: { stage: { in: ["tr1", "tr2"] }, status: { in: ["awaiting_result", "under_evaluation"] } } }),
    prisma.stageAttempt.count({ where: { status: "availability_requested" } }),
    prisma.student.count({ where: { deletedAt: null } }),
    prisma.report.count(),
  ]);

  const stageOrder = ["nxtmock", "dev_test", "tr1", "tr2", "placement_pool", "rejected"];
  const stageCounts = Object.fromEntries(byStage.map((s) => [s.currentStage, s._count]));
  const bucketCounts: Record<string, number> = {};
  for (const s of byBucket) {
    const b = s.bucket?.name ?? "—";
    bucketCounts[b] = (bucketCounts[b] ?? 0) + 1;
  }

  const cards = [
    { label: "Total candidates", value: total, href: "/org/roster" },
    { label: "Tests to grade", value: awaitingEval, href: "/org/roster?stage=nxtmock" },
    { label: "Panel feedback pending", value: panelPending, href: "/org/roster?stage=tr1" },
    { label: "No-response flags", value: noResponse, href: "/org/roster" },
    { label: "Reports generated", value: reports, href: "/org/roster" },
  ];

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900">Dashboard</h1>
          <p className="text-sm text-zinc-500">Pipeline overview and actions due.</p>
        </div>
        <RunJobsButton pending={pendingJobs} />
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
        {cards.map((c) => (
          <Link
            key={c.label}
            href={c.href}
            className="rounded-xl border border-zinc-200 bg-white p-4 transition hover:border-zinc-300 hover:shadow-sm"
          >
            <div className="text-2xl font-semibold text-zinc-900">{c.value}</div>
            <div className="mt-1 text-xs font-medium text-zinc-500">{c.label}</div>
          </Link>
        ))}
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <section className="rounded-xl border border-zinc-200 bg-white p-5">
          <h2 className="mb-3 text-sm font-semibold text-zinc-700">By stage</h2>
          <div className="space-y-2">
            {stageOrder.map((s) => (
              <div key={s} className="flex items-center justify-between">
                <StageBadge stage={s} />
                <span className="text-sm font-medium text-zinc-900">{stageCounts[s] ?? 0}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-xl border border-zinc-200 bg-white p-5">
          <h2 className="mb-3 text-sm font-semibold text-zinc-700">By bucket</h2>
          <div className="space-y-2">
            {Object.entries(bucketCounts).map(([b, n]) => (
              <div key={b} className="flex items-center justify-between">
                <span className="text-sm text-zinc-700">Bucket {b}</span>
                <span className="text-sm font-medium text-zinc-900">{n}</span>
              </div>
            ))}
          </div>
        </section>
      </div>

      <p className="text-xs text-zinc-400">
        Stages: {stageOrder.map((s) => STAGE_LABELS[s]).join(" → ")}
      </p>
    </div>
  );
}
