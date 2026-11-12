// Provider catalog for the setup wizard: detect what is available, validate keys with a cheap call,
// and fetch the live model list from each provider. No model names are hardcoded anywhere.

import { KEY_ENV, type KeyedProvider } from '../config.js';
import { redact } from './redact.js';

export type ProviderId = KeyedProvider | 'ollama' | 'offline';

export interface ProviderInfo {
  id: ProviderId;
  label: string;
  needsKey: boolean;
  envVar?: string;
  keyUrl?: string;
  keyPrefix?: string;
}

export const PROVIDERS: ProviderInfo[] = [
  { id: 'openai', label: 'OpenAI', needsKey: true, envVar: KEY_ENV.openai, keyUrl: 'https://platform.openai.com/api-keys', keyPrefix: 'sk-' },
  { id: 'anthropic', label: 'Anthropic', needsKey: true, envVar: KEY_ENV.anthropic, keyUrl: 'https://console.anthropic.com/settings/keys', keyPrefix: 'sk-ant-' },
  { id: 'gemini', label: 'Google Gemini', needsKey: true, envVar: KEY_ENV.gemini, keyUrl: 'https://aistudio.google.com/apikey', keyPrefix: 'AIza' },
  { id: 'openrouter', label: 'OpenRouter', needsKey: true, envVar: KEY_ENV.openrouter, keyUrl: 'https://openrouter.ai/keys', keyPrefix: 'sk-or-' },
  { id: 'ollama', label: 'Ollama (local)', needsKey: false },
  { id: 'offline', label: 'Offline / no key', needsKey: false },
];

export interface ModelInfo {
  id: string;
  label: string;
  /** USD per million input tokens, when the provider publishes it (OpenRouter). */
  usdPerMTokIn?: number;
  usdPerMTokOut?: number;
  context?: number;
}

export interface ProbeResult {
  ok: boolean;
  models: ModelInfo[];
  error?: string;
  /** milliseconds the check took */
  ms: number;
}

export const OLLAMA_DEFAULT = 'http://localhost:11434';

type Fetch = typeof fetch;

async function getJson(f: Fetch, url: string, headers: Record<string, string>, timeoutMs = 12_000): Promise<any> {
  const res = await f(url, { headers, signal: AbortSignal.timeout(timeoutMs) });
  const text = await res.text();
  if (!res.ok) {
    let msg = text.slice(0, 200);
    try {
      const j = JSON.parse(text);
      msg = j.error?.message ?? j.error ?? j.message ?? msg;
    } catch {
      /* not json */
    }
    throw new Error(`HTTP ${res.status}: ${typeof msg === 'string' ? msg : JSON.stringify(msg)}`);
  }
  return JSON.parse(text);
}

/** Chat-capable OpenAI models only: drop audio, image, embedding, moderation, realtime... */
export function isOpenAIChatModel(id: string): boolean {
  if (!/^(gpt-|o\d|chatgpt)/i.test(id)) return false;
  return !/(audio|realtime|tts|transcribe|image|embedding|search|instruct|moderation|dall-e|whisper|codex|computer-use|-\d{4}-\d{2}-\d{2}$)/i.test(id);
}

/** Validate a key (or a local server) and list its models. Listing models is free on every provider. */
export async function probe(provider: ProviderId, key: string | undefined, opts: { baseUrl?: string; fetch?: Fetch } = {}): Promise<ProbeResult> {
  const f = opts.fetch ?? fetch;
  const t0 = Date.now();
  const done = (models: ModelInfo[]): ProbeResult => ({ ok: true, models, ms: Date.now() - t0 });
  try {
    switch (provider) {
      case 'openai': {
        const base = (opts.baseUrl ?? 'https://api.openai.com/v1').replace(/\/$/, '');
        const j = await getJson(f, `${base}/models`, { authorization: `Bearer ${key ?? ''}` });
        const rows = (j.data ?? []) as { id: string; created?: number }[];
        return done(rows.filter((m) => isOpenAIChatModel(m.id)).sort((a, b) => (b.created ?? 0) - (a.created ?? 0)).map((m) => ({ id: m.id, label: m.id })));
      }
      case 'anthropic': {
        const j = await getJson(f, 'https://api.anthropic.com/v1/models?limit=100', { 'x-api-key': key ?? '', 'anthropic-version': '2026-10-21' });
        const rows = (j.data ?? []) as { id: string; display_name?: string; created_at?: string }[];
        return done(rows.sort((a, b) => String(b.created_at ?? '').localeCompare(String(a.created_at ?? ''))).map((m) => ({ id: m.id, label: m.display_name ?? m.id })));
      }
      case 'gemini': {
        const j = await getJson(f, 'https://generativelanguage.googleapis.com/v1beta/models?pageSize=200', { 'x-goog-api-key': key ?? '' });
        const rows = (j.models ?? []) as { name: string; displayName?: string; supportedGenerationMethods?: string[]; inputTokenLimit?: number }[];
        return done(rows
          .filter((m) => m.supportedGenerationMethods?.includes('generateContent') && !/embedding|aqa|imagen|veo|tts|image/i.test(m.name))
          .map((m) => ({ id: m.name.replace(/^models\//, ''), label: m.displayName ?? m.name, context: m.inputTokenLimit })));
      }
      case 'openrouter': {
        // the model list is public, so validate the key separately
        await getJson(f, 'https://openrouter.ai/api/v1/key', { authorization: `Bearer ${key ?? ''}` });
        const j = await getJson(f, 'https://openrouter.ai/api/v1/models', {});
        const rows = (j.data ?? []) as { id: string; name?: string; context_length?: number; pricing?: { prompt?: string; completion?: string } }[];
        return done(rows.map((m) => ({
          id: m.id,
          label: m.name ?? m.id,
          context: m.context_length,
          usdPerMTokIn: m.pricing?.prompt ? Number(m.pricing.prompt) * 1e6 : undefined,
          usdPerMTokOut: m.pricing?.completion ? Number(m.pricing.completion) * 1e6 : undefined,
        })));
      }
      case 'ollama': {
        const base = (opts.baseUrl ?? OLLAMA_DEFAULT).replace(/\/v1\/?$/, '').replace(/\/$/, '');
        const j = await getJson(f, `${base}/api/tags`, {}, 2500);
        const rows = (j.models ?? []) as { name: string; size?: number }[];
        return done(rows.map((m) => ({ id: m.name, label: m.name })));
      }
      case 'offline':
        return done(['tycoon', 'cooperative', 'prudent', 'gambler', 'adaptive'].map((p) => ({ id: p, label: p })));
    }
  } catch (err) {
    return { ok: false, models: [], error: redact((err as Error).message), ms: Date.now() - t0 };
  }
}

export interface Detection {
  id: ProviderId;
  label: string;
  /** A key is already set in the environment or .env (the value itself is never exposed). */
  envKey: boolean;
  /** Ollama answered on localhost. */
  reachable?: boolean;
  models?: number;
}

/** What is already available on this machine, without spending anything. */
export async function detect(env: NodeJS.ProcessEnv = process.env, f: Fetch = fetch): Promise<Detection[]> {
  const out: Detection[] = [];
  for (const p of PROVIDERS) {
    if (p.id === 'ollama') {
      const r = await probe('ollama', undefined, { baseUrl: env.OLLAMA_BASE_URL, fetch: f });
      out.push({ id: p.id, label: p.label, envKey: false, reachable: r.ok, models: r.models.length });
    } else {
      out.push({ id: p.id, label: p.label, envKey: !!(p.envVar && env[p.envVar] && (p.id !== 'gemini' || true)) || (p.id === 'gemini' && !!env.GOOGLE_API_KEY) });
    }
  }
  return out;
}
