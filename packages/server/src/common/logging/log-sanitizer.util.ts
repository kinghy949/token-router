const API_KEY_PATTERN = /\bsk-tr-[A-Za-z0-9_-]{12,}\b/g;
const PASSWORD_FIELD_PATTERN = /("password"\s*:\s*")[^"]*(")/gi;
const API_KEY_FIELD_PATTERN = /("x-api-key"\s*:\s*")[^"]*(")/gi;
const AUTH_HEADER_PATTERN = /("authorization"\s*:\s*")[^"]*(")/gi;

export function sanitizeTextForLog(text: string): string {
  return text
    .replace(API_KEY_PATTERN, 'sk-tr-***')
    .replace(PASSWORD_FIELD_PATTERN, '$1***$2')
    .replace(API_KEY_FIELD_PATTERN, '$1***$2')
    .replace(AUTH_HEADER_PATTERN, '$1***$2');
}

export function sanitizeObjectForLog(value: unknown): unknown {
  if (typeof value === 'string') {
    return sanitizeTextForLog(value);
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeObjectForLog(item));
  }

  if (!value || typeof value !== 'object') {
    return value;
  }

  const source = value as Record<string, unknown>;
  const output: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(source)) {
    if (isSensitiveKey(key)) {
      output[key] = '***';
      continue;
    }
    output[key] = sanitizeObjectForLog(raw);
  }
  return output;
}

function isSensitiveKey(key: string) {
  const normalized = key.toLowerCase();
  return (
    normalized.includes('password') ||
    normalized.includes('api_key') ||
    normalized.includes('apikey') ||
    normalized === 'authorization' ||
    normalized.includes('token')
  );
}
