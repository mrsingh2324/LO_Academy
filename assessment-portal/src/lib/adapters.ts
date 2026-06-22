import { prisma } from "./prisma";
import type { Prisma, PrismaClient } from "@prisma/client";

type Tx = PrismaClient | Prisma.TransactionClient;

/**
 * Integration adapters (PRD §9). For the one-day build these are MOCKED:
 * - Messaging: writes to the `messages` table instead of hitting email/SMS/WhatsApp.
 * - Calendar: returns a fake event id instead of booking Google/MS calendar.
 * - Sheets: ingest happens via an import endpoint (see /api/sheets/sync).
 * Swapping in real providers later means filling in the bodies below — the
 * call sites in the state machine do not change.
 */

// ---- Messaging adapter ----
export interface MessageInput {
  studentId: string;
  attemptId?: string | null;
  channel?: "email" | "sms" | "whatsapp";
  templateKey: string;
  payload?: Record<string, unknown>;
}

// Idempotent per (attempt, templateKey) — §11. On SQLite the unique constraint
// allows multiple rows with NULL attemptId, so we guard those manually.
export async function sendMessage(client: Tx, input: MessageInput) {
  if (input.attemptId) {
    const existing = await client.message.findFirst({
      where: { attemptId: input.attemptId, templateKey: input.templateKey },
    });
    if (existing) return existing; // already sent — idempotent no-op
  }
  // MOCK provider: pretend the send succeeded immediately.
  const providerMessageId = `mock-${input.templateKey}-${input.studentId.slice(0, 8)}`;
  return client.message.create({
    data: {
      studentId: input.studentId,
      attemptId: input.attemptId ?? null,
      channel: input.channel ?? "email",
      templateKey: input.templateKey,
      payload: (input.payload ?? {}) as Prisma.InputJsonValue,
      status: "sent",
      providerMessageId,
      sentAt: new Date(),
    },
  });
}

// ---- Calendar adapter ----
export async function bookCalendarEvent(opts: {
  title: string;
  start: Date;
  attendees: string[];
}): Promise<string> {
  // MOCK: real impl would call Google/MS Calendar and return the event id.
  const slug = opts.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 24);
  return `mock-cal-${slug}-${opts.start.getTime()}`;
}

export { prisma };
