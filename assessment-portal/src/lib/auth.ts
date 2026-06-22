import { cookies } from "next/headers";
import { prisma } from "./prisma";
import type { Role } from "./enums";

// Auth-lite for the one-day build: a cookie holds the active staff user id.
// Real SSO/magic-links are the §13 phase-13 hardening item. RBAC checks below
// are real and enforced server-side.

export async function getActor() {
  const jar = await cookies();
  const id = jar.get("actorId")?.value;
  if (id) {
    const u = await prisma.user.findUnique({ where: { id } });
    if (u && u.active) return u;
  }
  // no valid session — caller (org layout) redirects to /login
  return null;
}

export async function requireRole(...roles: Role[]) {
  const actor = await getActor();
  if (!actor || !roles.includes(actor.role as Role)) {
    throw new Response("Forbidden", { status: 403 });
  }
  return actor;
}

export function can(role: string | undefined, ...allowed: Role[]) {
  return !!role && allowed.includes(role as Role);
}
