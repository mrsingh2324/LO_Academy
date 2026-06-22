"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

type U = { id: string; name: string; role: string };

export default function RoleSwitcher({ users, currentId }: { users: U[]; currentId?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <select
      className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm"
      value={currentId}
      disabled={busy}
      onChange={async (e) => {
        setBusy(true);
        await fetch("/api/session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: e.target.value }),
        });
        router.refresh();
        setBusy(false);
      }}
    >
      {users.map((u) => (
        <option key={u.id} value={u.id}>
          {u.name} ({u.role})
        </option>
      ))}
    </select>
  );
}
