"use client";
import { useState } from "react";
import Link from "next/link";

type Row = {
  id: string;
  name: string;
  email: string;
  bucket: string | null;
  currentStage: string;
  currentStatus: string;
  latestScore: number | null;
};

const EXAMPLES = [
  "bucket A students who appeared for TR1 last week",
  "all students who failed TR1 from bucket A",
  "bucket A candidates with TR1 score above 80",
  "2026 graduates in the placement pool",
];

export default function AiQueryBox() {
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [res, setRes] = useState<null | { status: string; filter: unknown; count: number; students: Row[] }>(null);
  const [err, setErr] = useState<string | null>(null);

  async function run(question: string) {
    setLoading(true);
    setErr(null);
    setRes(null);
    try {
      const r = await fetch("/api/ai/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
      });
      const data = await r.json();
      if (!r.ok) setErr(data.error ?? "Query failed");
      else setRes(data);
    } catch {
      setErr("Network error");
    } finally {
      setLoading(false);
    }
  }

  function exportCsv() {
    if (!res?.students.length) return;
    const header = ["name", "email", "bucket", "stage", "status", "score"];
    const lines = res.students.map((s) =>
      [s.name, s.email, s.bucket ?? "", s.currentStage, s.currentStatus, s.latestScore ?? ""].join(",")
    );
    const blob = new Blob([[header.join(","), ...lines].join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "query-results.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4">
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-violet-600">AI Query</span>
        <span className="text-xs text-zinc-400">natural language → validated read-only filter</span>
      </div>
      <form
        className="mt-2 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (q.trim()) run(q.trim());
        }}
      >
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Ask about candidates…"
          className="flex-1 rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
        />
        <button
          type="submit"
          disabled={loading || !q.trim()}
          className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-50"
        >
          {loading ? "Asking…" : "Ask"}
        </button>
      </form>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {EXAMPLES.map((ex) => (
          <button
            key={ex}
            onClick={() => {
              setQ(ex);
              run(ex);
            }}
            className="rounded-full border border-zinc-200 px-2.5 py-0.5 text-xs text-zinc-600 hover:bg-zinc-50"
          >
            {ex}
          </button>
        ))}
      </div>

      {err && <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{err}</p>}

      {res && (
        <div className="mt-3">
          <div className="flex items-center justify-between">
            <p className="text-sm text-zinc-600">
              <span className="font-semibold text-zinc-900">{res.count}</span> result{res.count === 1 ? "" : "s"}
              {res.status === "rejected" && " — query rejected by guardrails"}
            </p>
            {res.count > 0 && (
              <button onClick={exportCsv} className="text-xs font-medium text-violet-600 hover:underline">
                Export CSV
              </button>
            )}
          </div>
          <pre className="mt-1 overflow-x-auto rounded-md bg-zinc-50 p-2 text-xs text-zinc-600">
            validated filter: {JSON.stringify(res.filter)}
          </pre>
          {res.students.length > 0 && (
            <div className="mt-2 overflow-hidden rounded-lg border border-zinc-200">
              <table className="w-full text-sm">
                <thead className="bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500">
                  <tr>
                    <th className="px-3 py-2">Name</th>
                    <th className="px-3 py-2">Bucket</th>
                    <th className="px-3 py-2">Stage</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Score</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {res.students.map((s) => (
                    <tr key={s.id} className="hover:bg-zinc-50">
                      <td className="px-3 py-2">
                        <Link href={`/org/students/${s.id}`} className="font-medium text-violet-700 hover:underline">
                          {s.name}
                        </Link>
                      </td>
                      <td className="px-3 py-2 text-zinc-600">{s.bucket ?? "—"}</td>
                      <td className="px-3 py-2 text-zinc-600">{s.currentStage}</td>
                      <td className="px-3 py-2 text-zinc-600">{s.currentStatus}</td>
                      <td className="px-3 py-2 text-zinc-600">{s.latestScore ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
