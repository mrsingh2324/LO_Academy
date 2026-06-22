import { getAllSettings } from "@/lib/settings";
import { llmConfigured } from "@/lib/llm";

export const dynamic = "force-dynamic";

export default async function Settings() {
  const s = await getAllSettings();
  const rows: [string, string][] = [
    ["Fixed assessment days", (s.fixed_assessment_days as string[]).join(", ")],
    ["Fixed-slot send time", s.fixed_slot_send_time],
    ["Reminder offsets", (s.reminder_offsets as string[]).join(", ")],
    ["React prep window (days)", String(s.react_prep_days)],
    ["TR2-fail routing", s.tr2_fail_routing],
    ["Retry cap", s.retry_cap == null ? "none (flag after 3)" : String(s.retry_cap)],
    ["Timezone", s.timezone],
    ["AI query prompt version", s.ai_query_prompt_version],
    ["AI report prompt version", s.ai_report_prompt_version],
    ["External final portal URL", s.external_final_portal_url],
    ["LLM provider", llmConfigured() ? `Gemini (${process.env.GEMINI_MODEL || "gemini-2.0-flash"})` : "Stub (no key set)"],
  ];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-zinc-900">Settings</h1>
        <p className="text-sm text-zinc-500">Process configuration (§5.12). Defaults from §14.</p>
      </div>
      <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
        <table className="w-full text-sm">
          <tbody className="divide-y divide-zinc-100">
            {rows.map(([k, v]) => (
              <tr key={k}>
                <td className="w-1/2 px-4 py-2.5 text-zinc-500">{k}</td>
                <td className="px-4 py-2.5 font-medium text-zinc-900">{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="rounded-xl border border-zinc-200 bg-white p-4">
        <h2 className="mb-2 text-sm font-semibold text-zinc-700">AI report template</h2>
        <pre className="whitespace-pre-wrap text-xs text-zinc-600">{s.ai_report_template}</pre>
      </div>
    </div>
  );
}
