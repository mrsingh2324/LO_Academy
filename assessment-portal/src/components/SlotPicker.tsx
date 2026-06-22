"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

type Slot = { iso: string; label: string };

export default function SlotPicker({ attemptId, slots }: { attemptId: string; slots: Slot[] }) {
  const router = useRouter();
  const [chosen, setChosen] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-2">
        {slots.map((s) => (
          <label
            key={s.iso}
            className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
              chosen === s.iso ? "border-violet-500 bg-violet-50" : "border-zinc-300 bg-white hover:bg-zinc-50"
            }`}
          >
            <input type="radio" name="slot" value={s.iso} checked={chosen === s.iso} onChange={() => setChosen(s.iso)} />
            {s.label}
          </label>
        ))}
      </div>
      <button
        disabled={busy || !chosen}
        onClick={async () => {
          setBusy(true);
          setErr(null);
          const r = await fetch("/api/availability", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ attemptId, chosenSlot: chosen }),
          });
          const data = await r.json();
          setBusy(false);
          if (!r.ok) setErr(data.error ?? "Failed");
          else router.refresh();
        }}
        className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-50"
      >
        {busy ? "Confirming…" : "Confirm slot"}
      </button>
      {err && <p className="text-sm text-rose-600">{err}</p>}
    </div>
  );
}
