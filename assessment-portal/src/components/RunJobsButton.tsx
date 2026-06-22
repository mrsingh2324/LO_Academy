"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function RunJobsButton({ pending }: { pending: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="flex items-center gap-3">
      <button
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          const r = await fetch("/api/jobs/run", { method: "POST" });
          const data = await r.json();
          setMsg(`Ran ${data.ran ?? 0} due job(s)`);
          router.refresh();
          setBusy(false);
        }}
        className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
      >
        {busy ? "Running…" : `Run due jobs (${pending} pending)`}
      </button>
      {msg && <span className="text-xs text-zinc-500">{msg}</span>}
    </div>
  );
}
