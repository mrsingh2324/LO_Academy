import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { StageBadge, StatusBadge } from "@/lib/ui";
import AiQueryBox from "@/components/AiQueryBox";
import RosterFilters from "@/components/RosterFilters";
import { isTestStage } from "@/lib/enums";
import type { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

// "next step" tag (§10 screen 3): who acts next.
function nextStep(stage: string, status: string): { label: string; tone: string } {
  if (["passed", "failed", "result_shared", "evaluated"].includes(status)) return { label: "Auto", tone: "text-emerald-600" };
  if (status === "not_qualified") return { label: "—", tone: "text-zinc-400" };
  if (status === "availability_requested") return { label: "Manual", tone: "text-amber-600" };
  if (status === "under_evaluation") return { label: isTestStage(stage) ? "Evaluator" : "Panel", tone: "text-cyan-600" };
  if (status === "awaiting_result") return { label: isTestStage(stage) ? "Evaluator" : "Panel", tone: "text-cyan-600" };
  return { label: "Auto", tone: "text-emerald-600" };
}

export default async function Roster({
  searchParams,
}: {
  searchParams: Promise<{ stage?: string; bucket?: string; q?: string; yog?: string; page?: string; size?: string }>;
}) {
  const sp = await searchParams;
  const where: Prisma.StudentWhereInput = { deletedAt: null };
  if (sp.stage) where.currentStage = sp.stage;
  if (sp.bucket) where.bucket = { name: sp.bucket };
  if (sp.yog && /^\d{4}$/.test(sp.yog)) where.yearOfGraduation = Number(sp.yog);
  if (sp.q) where.OR = [{ name: { contains: sp.q } }, { email: { contains: sp.q } }, { externalRef: { contains: sp.q } }];

  const PAGE_SIZES = [20, 50, 100, 200];
  const PAGE_SIZE = PAGE_SIZES.includes(Number(sp.size)) ? Number(sp.size) : 20;
  const page = Math.max(1, Number(sp.page ?? "1") || 1);

  const [students, buckets, total, yogRows] = await Promise.all([
    prisma.student.findMany({
      where,
      include: { bucket: true, attempts: { orderBy: { createdAt: "desc" }, take: 1 } },
      orderBy: { updatedAt: "desc" },
      take: PAGE_SIZE,
      skip: (page - 1) * PAGE_SIZE,
    }),
    prisma.bucket.findMany({ orderBy: { name: "asc" } }),
    prisma.student.count({ where }),
    prisma.student.findMany({
      where: { deletedAt: null, yearOfGraduation: { not: null } },
      distinct: ["yearOfGraduation"],
      select: { yearOfGraduation: true },
      orderBy: { yearOfGraduation: "asc" },
    }),
  ]);
  const yogs = yogRows.map((y) => y.yearOfGraduation!).filter(Boolean);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const qs = (p: number) => {
    const u = new URLSearchParams();
    if (sp.q) u.set("q", sp.q);
    if (sp.stage) u.set("stage", sp.stage);
    if (sp.bucket) u.set("bucket", sp.bucket);
    if (sp.yog) u.set("yog", sp.yog);
    if (sp.size) u.set("size", sp.size);
    u.set("page", String(p));
    return `/org/roster?${u.toString()}`;
  };

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900">Roster</h1>
          <p className="text-sm text-zinc-500">
            {total.toLocaleString()} candidates{total > PAGE_SIZE ? ` · page ${page} of ${totalPages}` : ""}
          </p>
        </div>
      </div>

      <AiQueryBox />

      <RosterFilters buckets={buckets.map((b) => ({ name: b.name }))} yogs={yogs} sizes={PAGE_SIZES} q={sp.q} stage={sp.stage} bucket={sp.bucket} yog={sp.yog} size={String(PAGE_SIZE)} />

      <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="px-4 py-2.5">Candidate</th>
              <th className="px-4 py-2.5">Bucket</th>
              <th className="px-4 py-2.5">YOG</th>
              <th className="px-4 py-2.5">Stage</th>
              <th className="px-4 py-2.5">Status</th>
              <th className="px-4 py-2.5">Score</th>
              <th className="px-4 py-2.5">Next step</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {students.map((s) => {
              const a = s.attempts[0];
              const ns = nextStep(s.currentStage, s.currentStatus);
              return (
                <tr key={s.id} className="hover:bg-zinc-50">
                  <td className="px-4 py-2.5">
                    <Link href={`/org/students/${s.id}`} className="font-medium text-zinc-900 hover:text-violet-700">
                      {s.name}
                    </Link>
                    <div className="text-xs text-zinc-400">{s.externalRef}</div>
                  </td>
                  <td className="px-4 py-2.5 text-zinc-600">{s.bucket?.name ?? "—"}</td>
                  <td className="px-4 py-2.5 text-zinc-600">{s.yearOfGraduation ?? "—"}</td>
                  <td className="px-4 py-2.5">
                    <StageBadge stage={s.currentStage} />
                  </td>
                  <td className="px-4 py-2.5">
                    <StatusBadge status={s.currentStatus} />
                  </td>
                  <td className="px-4 py-2.5 text-zinc-700">{a?.score ?? "—"}</td>
                  <td className={`px-4 py-2.5 text-xs font-semibold ${ns.tone}`}>{ns.label}</td>
                </tr>
              );
            })}
            {students.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-sm text-zinc-400">
                  No candidates match.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-zinc-500">
            Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total.toLocaleString()}
          </span>
          <div className="flex gap-2">
            {page > 1 && (
              <Link href={qs(page - 1)} className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 hover:bg-zinc-50">
                ← Prev
              </Link>
            )}
            {page < totalPages && (
              <Link href={qs(page + 1)} className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 hover:bg-zinc-50">
                Next →
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
