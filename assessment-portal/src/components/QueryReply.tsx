"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function QueryReply({ queryId }: { queryId: string }) {
  const router = useRouter();
  const [response, setResponse] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!response.trim()) return;
    setBusy(true);
    const r = await fetch(`/api/queries/${queryId}/respond`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ response }),
    });
    setBusy(false);
    if (r.ok) {
      setResponse("");
      router.refresh();
    }
  }

  return (
    <form onSubmit={submit} className="mt-2 flex gap-2">
      <input
        value={response}
        onChange={(e) => setResponse(e.target.value)}
        placeholder="Reply to the candidate…"
        className="flex-1 rounded-lg border border-zinc-300 px-3 py-1.5 text-sm"
      />
      <button
        disabled={busy || !response.trim()}
        className="rounded-lg bg-violet-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-50"
      >
        {busy ? "Sending…" : "Reply"}
      </button>
    </form>
  );
}
