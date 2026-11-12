// LLM brains. Plain `fetch`, zero SDK dependencies, one small adapter per provider.
// Each team gets one call every `policyEvery` ticks: the model reads a compact JSON
// observation of its team and the economy, and answers with a JSON strategy.

import { POLICY_SCHEMA_TEXT, type Observation } from '../engine/policy.js';
import type { Brain } from '../engine/plugins.js';

export const SYSTEM_PROMPT = `You are the strategist for one team of citizens in CivArena, a simulated economy.
Several teams, each run by a different AI model, compete in the same world. Citizens farm food, cut wood,
mine ore, forge tools (ore + wood) and craft luxury goods (wood + ore + tools). Everyone eats 1 food per tick
or loses health and eventually dies. Goods trade in call auctions; a foreign merchant caps import prices and
buys surplus at a low floor. There are taxes, welfare, a central bank with an interest rate, loans that can
end in bankruptcy, and price-fixing cartels that regulators may break up.

Your team is scored on: share of total wealth, share of GDP produced, survival of its members, and low
inequality inside the team. You set strategy for the whole team; your citizens execute it every tick.
Think about the market data you are given, then answer.

${POLICY_SCHEMA_TEXT}`;

export function userPrompt(obs: Observation): string {
  return `Current situation (JSON):\n${JSON.stringify(obs)}\n\nReturn your team's policy as a single JSON object.`;
}

/** Pull the first JSON object out of a model reply (handles code fences and chatter). */
export function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced ? fenced[1] : text;
  const start = body.indexOf('{');
  if (start < 0) throw new Error('no JSON object in reply');
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < body.length; i++) {
    const c = body[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return JSON.parse(body.slice(start, i + 1));
  }
  throw new Error('unterminated JSON object in reply');
}

interface LlmOptions {
  model: string;
  label?: string;
  apiKey?: string;
  baseUrl?: string;
  timeoutMs?: number;
}

abstract class LlmBrain implements Brain {
  abstract readonly provider: string;
  readonly model: string;
  readonly label: string;
  protected apiKey?: string;
  protected baseUrl?: string;
  protected timeoutMs: number;
  /** Total tokens spent, for the cost line in the CLI. */
  usage = { calls: 0, input: 0, output: 0, errors: 0 };

  constructor(o: LlmOptions) {
    this.model = o.model;
    this.label = o.label ?? prettyModel(o.model);
    this.apiKey = o.apiKey;
    this.baseUrl = o.baseUrl;
    this.timeoutMs = o.timeoutMs ?? 60_000;
  }

  protected abstract complete(system: string, user: string): Promise<string>;

  async decide(obs: Observation): Promise<unknown> {
    let lastErr: unknown;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const text = await this.complete(SYSTEM_PROMPT, userPrompt(obs));
        this.usage.calls++;
        return extractJson(text);
      } catch (err) {
        lastErr = err;
      }
    }
    this.usage.errors++;
    throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
  }

  protected async post(url: string, headers: Record<string, string>, body: unknown): Promise<any> {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`${this.provider} HTTP ${res.status}: ${text.slice(0, 300)}`);
    return JSON.parse(text);
  }
}

/** OpenAI Chat Completions, and anything OpenAI-compatible (Ollama, LM Studio, vLLM, OpenRouter...). */
export class OpenAIBrain extends LlmBrain {
  readonly provider: string;
  constructor(o: LlmOptions & { provider?: string; jsonMode?: boolean }) {
    super(o);
    this.provider = o.provider ?? 'openai';
    this.jsonMode = o.jsonMode ?? true;
  }
  private jsonMode: boolean;

  protected async complete(system: string, user: string): Promise<string> {
    const base = (this.baseUrl ?? 'https://api.openai.com/v1').replace(/\/$/, '');
    const headers: Record<string, string> = {};
    if (this.apiKey) headers.authorization = `Bearer ${this.apiKey}`;
    const body: Record<string, unknown> = {
      model: this.model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    };
    if (this.jsonMode) body.response_format = { type: 'json_object' };
    const json = await this.post(`${base}/chat/completions`, headers, body);
    this.usage.input += json.usage?.prompt_tokens ?? 0;
    this.usage.output += json.usage?.completion_tokens ?? 0;
    const text = json.choices?.[0]?.message?.content;
    if (typeof text !== 'string') throw new Error('openai: empty reply');
    return text;
  }
}

/** Anthropic Messages API (raw HTTP). */
export class AnthropicBrain extends LlmBrain {
  readonly provider = 'anthropic';

  protected async complete(system: string, user: string): Promise<string> {
    const base = (this.baseUrl ?? 'https://api.anthropic.com').replace(/\/$/, '');
    const json = await this.post(
      `${base}/v1/messages`,
      { 'x-api-key': this.apiKey ?? '', 'anthropic-version': '2026-10-21' },
      {
        model: this.model,
        max_tokens: 16000,
        system,
        output_config: { effort: 'low' },
        messages: [{ role: 'user', content: user }],
      },
    );
    this.usage.input += json.usage?.input_tokens ?? 0;
    this.usage.output += json.usage?.output_tokens ?? 0;
    if (json.stop_reason === 'refusal') throw new Error('anthropic: request declined');
    const text = (json.content ?? [])
      .filter((b: { type: string }) => b.type === 'text')
      .map((b: { text: string }) => b.text)
      .join('');
    if (!text) throw new Error('anthropic: empty reply');
    return text;
  }
}

/** Google Gemini generateContent API. */
export class GeminiBrain extends LlmBrain {
  readonly provider = 'gemini';

  protected async complete(system: string, user: string): Promise<string> {
    const base = (this.baseUrl ?? 'https://generativelanguage.googleapis.com/v1beta').replace(/\/$/, '');
    const json = await this.post(
      `${base}/models/${encodeURIComponent(this.model)}:generateContent`,
      { 'x-goog-api-key': this.apiKey ?? '' },
      {
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: user }] }],
        generationConfig: { responseMimeType: 'application/json' },
      },
    );
    this.usage.input += json.usageMetadata?.promptTokenCount ?? 0;
    this.usage.output += json.usageMetadata?.candidatesTokenCount ?? 0;
    const text = (json.candidates?.[0]?.content?.parts ?? []).map((p: { text?: string }) => p.text ?? '').join('');
    if (!text) throw new Error('gemini: empty reply');
    return text;
  }
}

export function prettyModel(model: string): string {
  const m = model.toLowerCase();
  const known: [RegExp, (x: RegExpMatchArray) => string][] = [
    [/^gpt-?([\w.]+?)(-mini|-nano)?$/, (x) => `GPT-${x[1].toUpperCase()}${x[2] ? ' ' + x[2].slice(1) : ''}`],
    [/^claude-(opus|sonnet|haiku|fable)-(\d+)(?:-(\d+))?/, (x) => `Claude ${cap(x[1])} ${x[2]}${x[3] ? '.' + x[3] : ''}`],
    [/^gemini-([\d.]+)-(\w+)/, (x) => `Gemini ${x[1]} ${cap(x[2])}`],
    [/^(llama|qwen|mistral|gemma|phi|deepseek)[-:]?([\w.:-]*)/, (x) => `${cap(x[1])} ${x[2]}`.trim()],
  ];
  for (const [re, f] of known) {
    const hit = m.match(re);
    if (hit) return f(hit);
  }
  return model;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
