import { prisma } from "../src/lib/prisma";

// Idempotent staff users so the login system works on a fresh database.
const USERS = [
  { name: "Admin User", email: "admin@portal.test", role: "admin" },
  { name: "Ops Coordinator", email: "ops@portal.test", role: "ops" },
  { name: "Eva Grader", email: "eval@portal.test", role: "evaluator" },
  { name: "Pat Panelist", email: "panel@portal.test", role: "panelist" },
];

async function main() {
  for (const u of USERS) {
    await prisma.user.upsert({ where: { email: u.email }, create: u, update: { name: u.name, role: u.role, active: true } });
  }
  console.log(`Seeded ${USERS.length} staff users.`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
