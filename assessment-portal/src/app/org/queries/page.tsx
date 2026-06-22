import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { fmtDate } from "@/lib/ui";
import QueryReply from "@/components/QueryReply";

export const dynamic = "force-dynamic";

export default async function Queries() {
  const queries = await prisma.studentQuery.findMany({
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    include: { student: { include: { bucket: true } } },
  });
  const open = queries.filter((q) => q.status === "open");

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-zinc-900">Candidate Queries</h1>
        <p className="text-sm text-zinc-500">
          {open.length} open · {queries.length} total — questions raised by candidates from their portal.
        </p>
      </div>

      {queries.length === 0 ? (
        <div className="rounded-xl border border-zinc-200 bg-white p-10 text-center text-sm text-zinc-400">
          No candidate queries yet.
        </div>
      ) : (
        <div className="space-y-3">
          {queries.map((q) => (
            <div key={q.id} className="rounded-xl border border-zinc-200 bg-white p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Link href={`/org/students/${q.studentId}`} className="font-medium text-zinc-900 hover:text-violet-700">
                    {q.student.name}
                  </Link>
                  <span className="text-xs text-zinc-400">
                    {q.student.bucket ? `Bucket ${q.student.bucket.name} · ` : ""}
                    {q.student.currentStage}
                  </span>
                </div>
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${q.status === "answered" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>
                  {q.status === "answered" ? "Answered" : "Open"}
                </span>
              </div>
              {q.subject && <div className="mt-2 text-sm font-medium text-zinc-800">{q.subject}</div>}
              <p className="mt-1 text-sm text-zinc-700">{q.message}</p>
              <p className="mt-1 text-xs text-zinc-400">{fmtDate(q.createdAt)}</p>

              {q.response ? (
                <div className="mt-2 rounded-lg bg-violet-50 p-3 text-sm text-violet-900">
                  <span className="font-medium">Your reply:</span> {q.response}
                  <span className="ml-2 text-xs text-violet-500">{fmtDate(q.respondedAt)}</span>
                </div>
              ) : (
                <QueryReply queryId={q.id} />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
