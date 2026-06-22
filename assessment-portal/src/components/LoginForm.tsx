"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

type U = { id: string; name: string; email: string; role: string };

export default function LoginForm({ users }: { users: U[] }) {
  const router = useRouter();
  const [tab, setTab] = useState<"staff" | "candidate">("staff");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [identifier, setIdentifier] = useState("");

  async function staffLogin(userId: string) {
    setBusy(true);
    setErr(null);
    const r = await fetch("/api/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    setBusy(false);
    if (r.ok) router.push("/org");
    else setErr("Login failed");
  }

  async function candidateLogin(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    const r = await fetch("/api/student-login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier }),
    });
    const data = await r.json();
    setBusy(false);
    if (r.ok) router.push(`/student/${data.studentId}`);
    else setErr(data.error ?? "Not found");
  }

  return (
    <div className="w-full max-w-sm rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
      <h1 className="text-lg font-semibold text-zinc-900">Assessment Portal</h1>
      <p className="mb-4 text-sm text-zinc-500">Sign in to continue</p>

      <div className="mb-4 flex rounded-lg bg-zinc-100 p-1 text-sm">
        <button
          onClick={() => setTab("staff")}
          className={`flex-1 rounded-md px-3 py-1.5 font-medium ${tab === "staff" ? "bg-white text-zinc-900 shadow" : "text-zinc-500"}`}
        >
          Staff
        </button>
        <button
          onClick={() => setTab("candidate")}
          className={`flex-1 rounded-md px-3 py-1.5 font-medium ${tab === "candidate" ? "bg-white text-zinc-900 shadow" : "text-zinc-500"}`}
        >
          Candidate
        </button>
      </div>

      {tab === "staff" ? (
        <div className="space-y-2">
          <p className="text-xs text-zinc-400">Demo login — pick a staff member (no password).</p>
          {users.map((u) => (
            <button
              key={u.id}
              disabled={busy}
              onClick={() => staffLogin(u.id)}
              className="flex w-full items-center justify-between rounded-lg border border-zinc-200 px-3 py-2 text-left text-sm hover:border-violet-300 hover:bg-violet-50 disabled:opacity-50"
            >
              <span className="font-medium text-zinc-800">{u.name}</span>
              <span className="text-xs text-zinc-500">{u.role}</span>
            </button>
          ))}
        </div>
      ) : (
        <form onSubmit={candidateLogin} className="space-y-2">
          <p className="text-xs text-zinc-400">Enter the email or candidate ID you registered with.</p>
          <input
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            placeholder="email or candidate ID"
            className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
          />
          <button
            disabled={busy || !identifier.trim()}
            className="w-full rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-50"
          >
            {busy ? "Checking…" : "Continue"}
          </button>
        </form>
      )}

      {err && <p className="mt-3 text-sm text-rose-600">{err}</p>}
      <p className="mt-4 text-center text-xs text-zinc-400">Login is demo-only — not wired to production auth.</p>
    </div>
  );
}
