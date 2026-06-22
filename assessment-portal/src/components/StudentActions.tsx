"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

function useRefresh() {
  const router = useRouter();
  return () => router.refresh();
}

export function AskAvailabilityButton({ studentId }: { studentId: string }) {
  const refresh = useRefresh();
  const [busy, setBusy] = useState(false);
  return (
    <button
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await fetch(`/api/students/${studentId}/ask-availability`, { method: "POST" });
        refresh();
        setBusy(false);
      }}
      className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
    >
      {busy ? "Sending…" : "Ask availability"}
    </button>
  );
}

export function ScoreForm({ attemptId }: { attemptId: string }) {
  const refresh = useRefresh();
  const [score, setScore] = useState("");
  const [remarks, setRemarks] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(result: "pass" | "fail") {
    setBusy(true);
    setErr(null);
    const r = await fetch(`/api/attempts/${attemptId}/score`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ score: Number(score), result, remarks }),
    });
    const data = await r.json();
    setBusy(false);
    if (!r.ok) setErr(data.error ?? "Failed");
    else refresh();
  }

  return (
    <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
      <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Enter React score</div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <input
          type="number"
          value={score}
          onChange={(e) => setScore(e.target.value)}
          placeholder="Score /100"
          className="w-28 rounded-md border border-zinc-300 px-2 py-1 text-sm"
        />
        <input
          value={remarks}
          onChange={(e) => setRemarks(e.target.value)}
          placeholder="Remarks"
          className="flex-1 rounded-md border border-zinc-300 px-2 py-1 text-sm"
        />
        <button
          disabled={busy || !score}
          onClick={() => submit("pass")}
          className="rounded-md bg-emerald-600 px-3 py-1 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          Pass
        </button>
        <button
          disabled={busy || !score}
          onClick={() => submit("fail")}
          className="rounded-md bg-rose-600 px-3 py-1 text-sm font-medium text-white hover:bg-rose-700 disabled:opacity-50"
        >
          Fail
        </button>
      </div>
      {err && <p className="mt-2 text-xs text-rose-600">{err}</p>}
    </div>
  );
}

export function FeedbackForm({ attemptId }: { attemptId: string }) {
  const refresh = useRefresh();
  const [strengths, setStrengths] = useState("");
  const [weaknesses, setWeaknesses] = useState("");
  const [rec, setRec] = useState("advance");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setErr(null);
    const r = await fetch(`/api/attempts/${attemptId}/feedback`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        recommendation: rec,
        strengths,
        weaknesses,
        scores: { problem_solving: 4, coding: 4, communication: 3, system_design: 3 },
      }),
    });
    const data = await r.json();
    setBusy(false);
    if (!r.ok) setErr(data.error ?? "Failed");
    else refresh();
  }

  return (
    <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
      <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Submit panel feedback</div>
      <div className="mt-2 space-y-2">
        <textarea
          value={strengths}
          onChange={(e) => setStrengths(e.target.value)}
          placeholder="Strengths"
          className="w-full rounded-md border border-zinc-300 px-2 py-1 text-sm"
          rows={2}
        />
        <textarea
          value={weaknesses}
          onChange={(e) => setWeaknesses(e.target.value)}
          placeholder="Weaknesses"
          className="w-full rounded-md border border-zinc-300 px-2 py-1 text-sm"
          rows={2}
        />
        <div className="flex items-center gap-2">
          <select value={rec} onChange={(e) => setRec(e.target.value)} className="rounded-md border border-zinc-300 px-2 py-1 text-sm">
            <option value="advance">Advance</option>
            <option value="borderline">Borderline</option>
            <option value="reject">Reject</option>
          </select>
          <button
            disabled={busy}
            onClick={submit}
            className="rounded-md bg-violet-600 px-3 py-1 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-50"
          >
            {busy ? "Saving…" : "Submit feedback"}
          </button>
        </div>
      </div>
      {err && <p className="mt-2 text-xs text-rose-600">{err}</p>}
    </div>
  );
}

export function GenerateReportButton({ attemptId }: { attemptId: string }) {
  const refresh = useRefresh();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <div>
      <button
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setErr(null);
          const r = await fetch("/api/ai/report", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ attemptId }),
          });
          const data = await r.json();
          setBusy(false);
          if (!r.ok) setErr(data.error ?? "Failed");
          else refresh();
        }}
        className="rounded-md bg-violet-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-50"
      >
        {busy ? "Generating…" : "Generate report"}
      </button>
      {err && <p className="mt-1 text-xs text-rose-600">{err}</p>}
    </div>
  );
}
