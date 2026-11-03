// The one LLM gateway (Backend.md §9.1, D-X42): Meta Muse Spark through the
// Meta Model API (OpenAI-compatible chat completions, JSON mode). There is no
// other real provider; without `TIWA_MUSE_API` the app uses the Fakes.
// Every call is capped (tokens, time) and reports its usage so core can log
// it and enforce daily caps.

export const MUSE_BASE_URL = 'https://api.meta.ai/v1';
export const MUSE_DEFAULT_MODEL = 'muse-spark-1.3-contributor';

export interface Usage {
  feature: string;
  promptVersion: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
}

export type UsageHook = (usage: Usage) => void | Promise<void>;

export interface JsonRequest {
  feature: string;
  promptVersion: string;
  system: string;
  user: string;
  /** data: URLs for vision prompts (captions). */
  images?: string[];
  maxTokens: number;
}

/** Strip phone numbers and emails before anything leaves for the model (§9.1). */
export function stripContacts(text: string): string {
  return text
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[email]')
    .replace(/(?:\+?\d[\s.\-()]?){7,}\d/g, '[phone]');
}

export class MuseClient {
  constructor(
    private readonly apiKey: string,
    readonly model = MUSE_DEFAULT_MODEL,
    private readonly onUsage?: UsageHook,
    private readonly baseUrl = MUSE_BASE_URL,
  ) {}

  /** One JSON answer. Throws on HTTP errors; returns null when the reply isn't JSON. */
  async json(request: JsonRequest): Promise<unknown> {
    const user = stripContacts(request.user);
    const content =
      request.images && request.images.length > 0
        ? [{ type: 'text', text: user }, ...request.images.map((url) => ({ type: 'image_url', image_url: { url } }))]
        : user;
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.apiKey}` },
      signal: AbortSignal.timeout(60_000),
      body: JSON.stringify({
        model: this.model,
        reasoning_effort: 'low',
        max_tokens: request.maxTokens,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: request.system },
          { role: 'user', content },
        ],
      }),
    });
    if (!response.ok) throw new Error(`Muse request failed (${response.status})`);
    const body = (await response.json()) as {
      choices?: { message?: { content?: string | null } }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    const usage: Usage = {
      feature: request.feature,
      promptVersion: request.promptVersion,
      model: this.model,
      inputTokens: body.usage?.prompt_tokens ?? 0,
      outputTokens: body.usage?.completion_tokens ?? 0,
    };
    console.info(`[ai] ${usage.promptVersion} model=${usage.model} in=${usage.inputTokens} out=${usage.outputTokens}`);
    await this.onUsage?.(usage);
    const text = body.choices?.[0]?.message?.content;
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch {
      const match = /\{[\s\S]*\}/.exec(text);
      if (!match) return null;
      try {
        return JSON.parse(match[0]);
      } catch {
        return null;
      }
    }
  }
}
