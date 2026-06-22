import { prisma } from "@/lib/prisma";
import LoginForm from "@/components/LoginForm";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const users = await prisma.user.findMany({ where: { active: true }, orderBy: { role: "asc" } });
  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-6">
      <LoginForm users={users.map((u) => ({ id: u.id, name: u.name, email: u.email, role: u.role }))} />
    </div>
  );
}
