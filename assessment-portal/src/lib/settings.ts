import { prisma } from "./prisma";

// §5.12 settings, with the §14 defaults baked in.
export const DEFAULT_SETTINGS = {
  fixed_assessment_days: ["Sat", "Sun"],
  fixed_slot_send_time: "09:00",
  reminder_offsets: ["T-1d", "T-2h"],
  react_prep_days: 14,
  tr2_fail_routing: "repeat_failed_round", // §14.1 default
  retry_cap: null as number | null, // §14.9: none; flag after 3
  retry_flag_after: 3,
  timezone: "Asia/Kolkata",
  ai_query_prompt_version: "nlq-v1",
  ai_report_prompt_version: "trreport-v1",
  external_final_portal_url: "https://final-portal.example.com/onboard",
  ai_report_template: `You are an assessment panel writing a concise, professional technical-round report.
Use these sections (markdown headings):
## Summary
## What Went Well
## What To Improve
## Recommended Topics & Resources
## Panel Recommendation
Base everything strictly on the provided data. Be specific and constructive.`,
};

export type SettingsShape = typeof DEFAULT_SETTINGS;

export async function getSetting<K extends keyof SettingsShape>(
  key: K
): Promise<SettingsShape[K]> {
  const row = await prisma.setting.findUnique({ where: { key } });
  if (!row) return DEFAULT_SETTINGS[key];
  return row.value as SettingsShape[K];
}

export async function getAllSettings(): Promise<SettingsShape> {
  const rows = await prisma.setting.findMany();
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  return { ...DEFAULT_SETTINGS, ...map } as SettingsShape;
}

export async function setSetting(key: string, value: unknown) {
  await prisma.setting.upsert({
    where: { key },
    create: { key, value: value as object },
    update: { value: value as object },
  });
}
