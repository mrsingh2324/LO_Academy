import { prisma } from "@/lib/prisma";
import { fmtDate } from "@/lib/ui";

export const dynamic = "force-dynamic";

const KIND_LABEL: Record<string, string> = {
  unmatched_uid: "UID not in roster",
  cross_bucket: "Bucket mismatch",
  count_note: "Count note",
};
const KIND_COLOR: Record<string, string> = {
  unmatched_uid: "bg-rose-100 text-rose-800 ring-rose-200",
  cross_bucket: "bg-amber-100 text-amber-900 ring-amber-300",
  count_note: "bg-zinc-100 text-zinc-700 ring-zinc-200",
};

export default async function Reconciliation() {
  const items = await prisma.reconciliationItem.findMany({ orderBy: [{ source: "asc" }, { kind: "asc" }, { createdAt: "asc" }] });
  const open = items.filter((i) => !i.resolved);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-zinc-900">Reconciliation</h1>
        <p className="text-sm text-zinc-500">
          {open.length} open item{open.length === 1 ? "" : "s"} — data mismatches found while importing the round sheets.
        </p>
      </div>

      {items.length === 0 ? (
        <div className="rounded-xl border border-zinc-200 bg-white p-10 text-center text-sm text-zinc-400">
          No reconciliation items. Everything matched.
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-4 py-2.5">Source</th>
                <th className="px-4 py-2.5">Issue</th>
                <th className="px-4 py-2.5">Candidate</th>
                <th className="px-4 py-2.5">UID</th>
                <th className="px-4 py-2.5">Detail</th>
                <th className="px-4 py-2.5">Found</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {items.map((i) => {
                const detail = (i.detail ?? {}) as Record<string, unknown>;
                return (
                  <tr key={i.id} className="hover:bg-zinc-50">
                    <td className="px-4 py-2.5 font-medium text-zinc-700">
                      {i.source.toUpperCase()}
                      {i.bucket ? ` · ${i.bucket}` : ""}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${KIND_COLOR[i.kind] ?? KIND_COLOR.count_note}`}>
                        {KIND_LABEL[i.kind] ?? i.kind}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-zinc-700">{i.name ?? "—"}</td>
                    <td className="px-4 py-2.5 font-mono text-xs text-zinc-500">{i.uid ?? "—"}</td>
                    <td className="px-4 py-2.5 text-zinc-600">{String(detail.reason ?? "")}</td>
                    <td className="px-4 py-2.5 text-xs text-zinc-400">{fmtDate(i.createdAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
