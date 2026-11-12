// Keep secrets out of logs, errors, headlines and replays.

const PATTERNS: RegExp[] = [
  /sk-ant-[A-Za-z0-9_-]{10,}/g, // Anthropic
  /sk-or-[A-Za-z0-9_-]{10,}/g, // OpenRouter
  /sk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{16,}/g, // OpenAI
  /AIza[0-9A-Za-z_-]{20,}/g, // Google
  /(?:bearer|x-api-key|api[_-]?key|authorization)["':=\s]+[A-Za-z0-9._-]{12,}/gi,
];

const known = new Set<string>();

/** Register a secret value so it is masked wherever it appears. */
export function registerSecret(value: string | undefined) {
  if (value && value.length >= 8) known.add(value);
}

export function registerEnvSecrets(env: NodeJS.ProcessEnv = process.env) {
  for (const [k, v] of Object.entries(env)) if (/(_API_KEY|_TOKEN|_SECRET)$/.test(k)) registerSecret(v);
}

export function redact(text: string): string {
  let out = String(text);
  for (const s of known) out = out.split(s).join('***');
  for (const re of PATTERNS) out = out.replace(re, (m) => (m.length > 12 ? m.slice(0, 4) + '***' : '***'));
  return out;
}

/** Show that a key exists without revealing it: "sk-…a1b2". */
export function maskKey(key: string): string {
  if (!key) return '';
  return key.length <= 8 ? '***' : `${key.slice(0, 3)}…${key.slice(-4)}`;
}
