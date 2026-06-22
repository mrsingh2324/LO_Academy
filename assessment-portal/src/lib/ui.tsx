import { STAGE_LABELS, STATUS_LABELS } from "./enums";

const STAGE_COLOR: Record<string, string> = {
  nxtmock: "bg-indigo-100 text-indigo-800 ring-indigo-200",
  dev_test: "bg-emerald-100 text-emerald-800 ring-emerald-200",
  tr1: "bg-violet-100 text-violet-800 ring-violet-200",
  tr2: "bg-fuchsia-100 text-fuchsia-800 ring-fuchsia-200",
  placement_pool: "bg-amber-100 text-amber-900 ring-amber-300",
  rejected: "bg-zinc-100 text-zinc-600 ring-zinc-200",
};

const STATUS_COLOR: Record<string, string> = {
  availability_requested: "bg-amber-100 text-amber-800 ring-amber-200",
  scheduled: "bg-blue-100 text-blue-800 ring-blue-200",
  awaiting_result: "bg-indigo-100 text-indigo-800 ring-indigo-200",
  under_evaluation: "bg-cyan-100 text-cyan-800 ring-cyan-200",
  evaluated: "bg-teal-100 text-teal-800 ring-teal-200",
  result_shared: "bg-zinc-100 text-zinc-700 ring-zinc-200",
  passed: "bg-emerald-100 text-emerald-800 ring-emerald-200",
  failed: "bg-rose-100 text-rose-800 ring-rose-200",
};

export function Badge({ children, color }: { children: React.ReactNode; color: string }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${color}`}>
      {children}
    </span>
  );
}

export function StageBadge({ stage }: { stage: string }) {
  return <Badge color={STAGE_COLOR[stage] ?? "bg-zinc-100 text-zinc-700 ring-zinc-200"}>{STAGE_LABELS[stage] ?? stage}</Badge>;
}

export function StatusBadge({ status }: { status: string }) {
  return <Badge color={STATUS_COLOR[status] ?? "bg-zinc-100 text-zinc-700 ring-zinc-200"}>{STATUS_LABELS[status] ?? status}</Badge>;
}

export function fmtDate(d: Date | string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function fmtDay(d: Date | string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}
