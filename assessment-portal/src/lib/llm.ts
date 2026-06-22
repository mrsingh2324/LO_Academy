import { GoogleGenAI } from "@google/genai";

/**
 * Provider-agnostic LLM adapter. Wired to Gemini today; swap the body to use
 * Claude/OpenAI later without touching call sites. Both AI features (§8) go
 * through generateJson / generateText.
 */
export interface LLMAdapter {
  generateJson(opts: { system: string; user: string; schema?: object }): Promise<unknown>;
  generateText(opts: { system: string; user: string }): Promise<string>;
  readonly model: string;
}

class GeminiAdapter implements LLMAdapter {
  private client: GoogleGenAI;
  readonly model: string;
  constructor(apiKey: string, model: string) {
    this.client = new GoogleGenAI({ apiKey });
    this.model = model;
  }
  async generateJson({ system, user, schema }: { system: string; user: string; schema?: object }) {
    const res = await this.client.models.generateContent({
      model: this.model,
      contents: `${user}`,
      config: {
        systemInstruction: system,
        responseMimeType: "application/json",
        ...(schema ? { responseSchema: schema } : {}),
        temperature: 0,
      },
    });
    const text = res.text ?? "{}";
    return JSON.parse(text);
  }
  async generateText({ system, user }: { system: string; user: string }) {
    const res = await this.client.models.generateContent({
      model: this.model,
      contents: user,
      config: { systemInstruction: system, temperature: 0.4 },
    });
    return res.text ?? "";
  }
}

// Stub used when no API key is configured, so the app still runs end-to-end.
class StubAdapter implements LLMAdapter {
  readonly model = "stub";
  async generateJson() {
    return {};
  }
  async generateText() {
    return "## Summary\n\n_(LLM not configured — set GEMINI_API_KEY in .env to generate real reports.)_";
  }
}

let cached: LLMAdapter | null = null;
export function getLLM(): LLMAdapter {
  if (cached) return cached;
  const key = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL || "gemini-2.0-flash";
  cached = key ? new GeminiAdapter(key, model) : new StubAdapter();
  return cached;
}

export function llmConfigured() {
  return Boolean(process.env.GEMINI_API_KEY);
}
