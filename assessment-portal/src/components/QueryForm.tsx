"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function QueryForm({ studentId }: { studentId: string }) {
  const router = useRouter();
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!message.trim()) return;
    setBusy(true);
    const r = await fetch("/api/queries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ studentId, subject, message }),
    });
    setBusy(false);
    if (r.ok) {
      setSubject("");
      setMessage("");
      setDone(true);
      router.refresh();
    }
  }

  return (
    <form onSubmit={submit} className="space-y-2">
      <input
        value={subject}
        onChange={(e) => setSubject(e.target.value)}
        placeholder="Subject (optional)"
        className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
      />
      <textarea
        value={message}
        onChange={(e) => {
          setMessage(e.target.value);
          setDone(false);
        }}
        placeholder="Ask the assessments team anything about your test or interview…"
        rows={3}
        className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
      />
      <div className="flex items-center gap-3">
        <button
          disabled={busy || !message.trim()}
          className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-50"
        >
          {busy ? "Sending…" : "Post query"}
        </button>
        {done && <span className="text-sm text-emerald-600">Sent to the assessments team ✓</span>}
      </div>
    </form>
  );
}
