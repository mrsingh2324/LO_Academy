import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Switch the active staff user (auth-lite). Sets the actorId cookie.
export async function POST(req: NextRequest) {
  const { userId } = await req.json();
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return NextResponse.json({ error: "Unknown user" }, { status: 400 });
  const res = NextResponse.json({ ok: true, role: user.role, name: user.name });
  res.cookies.set("actorId", user.id, { httpOnly: true, sameSite: "lax", path: "/" });
  return res;
}

// Logout — clear the session cookie.
export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set("actorId", "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 });
  return res;
}
