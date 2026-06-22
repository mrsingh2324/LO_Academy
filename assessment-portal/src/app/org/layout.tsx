import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getActor } from "@/lib/auth";
import RoleSwitcher from "@/components/RoleSwitcher";
import LogoutButton from "@/components/LogoutButton";

export default async function OrgLayout({ children }: { children: React.ReactNode }) {
  const actor = await getActor();
  if (!actor) redirect("/login");

  const [users, reconCount, openQueries, switchedCount] = await Promise.all([
    prisma.user.findMany({ where: { active: true }, orderBy: { role: "asc" } }),
    prisma.reconciliationItem.count({ where: { resolved: false } }),
    prisma.studentQuery.count({ where: { status: "open" } }),
    prisma.student.count({ where: { anomalousFlow: true } }),
  ]);

  const nav = [
    { href: "/org", label: "Dashboard", badge: 0 },
    { href: "/org/roster", label: "Roster", badge: 0 },
    { href: "/org/queries", label: "Queries", badge: openQueries },
    { href: "/org/switched", label: "Switched", badge: switchedCount },
    { href: "/org/reconciliation", label: "Reconciliation", badge: reconCount },
    { href: "/org/settings", label: "Settings", badge: 0 },
  ];

  return (
    <div className="min-h-screen">
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3">
          <div className="flex items-center gap-6">
            <Link href="/org" className="text-base font-semibold text-zinc-900">
              Assessment Portal
            </Link>
            <nav className="flex items-center gap-1">
              {nav.map((n) => (
                <Link
                  key={n.href}
                  href={n.href}
                  className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
                >
                  {n.label}
                  {n.badge > 0 && (
                    <span className="rounded-full bg-rose-100 px-1.5 text-xs font-semibold text-rose-700">{n.badge}</span>
                  )}
                </Link>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-zinc-500">Acting as</span>
            <RoleSwitcher users={users} currentId={actor?.id} />
            <LogoutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-6 py-6">{children}</main>
    </div>
  );
}
