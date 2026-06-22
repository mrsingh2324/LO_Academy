"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function LogoutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await fetch("/api/session", { method: "DELETE" });
        router.push("/login");
      }}
      className="rounded-md border border-zinc-300 bg-white px-2.5 py-1 text-sm text-zinc-600 hover:bg-zinc-50"
    >
      Log out
    </button>
  );
}
