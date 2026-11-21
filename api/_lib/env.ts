import { z } from 'zod';

export const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash';
export const DEFAULT_PORT = 3001;
export const DEFAULT_ALLOWED_ORIGINS = ['http://localhost:5173'] as const;
export const DEFAULT_RATE_LIMIT_WINDOW_MS = 60_000;
export const DEFAULT_RATE_LIMIT_MAX = 60;

export interface ServerEnv {
  readonly geminiApiKey: string | undefined;
  readonly geminiModel: string;
  readonly port: number;
  readonly allowedOrigins: readonly string[];
  readonly strictAuthLockdown: boolean;
  readonly apiAuthToken: string | undefined;
  readonly rateLimitWindowMs: number;
  readonly rateLimitMax: number;
}

export interface RawServerEnvInput {
  readonly GEMINI_API_KEY?: string | undefined;
  readonly GEMINI_MODEL?: string | undefined;
  readonly PORT?: string | undefined;
  readonly ALLOWED_ORIGINS?: string | undefined;
  readonly STRICT_AUTH_LOCKDOWN?: string | undefined;
  readonly API_AUTH_TOKEN?: string | undefined;
  readonly RATE_LIMIT_WINDOW_MS?: string | undefined;
  readonly RATE_LIMIT_MAX?: string | undefined;
}

function normalizeOptionalString(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function parseStrictBooleanFlag(
  value: string | undefined,
  defaultValue: boolean,
): boolean {
  const normalized = normalizeOptionalString(value)?.toLowerCase();
  if (normalized === undefined) {
    return defaultValue;
  }
  if (normalized === 'true' || normalized === '1') {
    return true;
  }
  if (normalized === 'false' || normalized === '0') {
    return false;
  }
  throw new Error(
    `Invalid boolean environment value: expected "true", "false", "1", or "0"`,
  );
}

function parsePositiveInt(
  value: string | undefined,
  defaultValue: number,
  min: number,
  max: number,
  name: string,
): number {
  const normalized = normalizeOptionalString(value);
  if (normalized === undefined) {
    return defaultValue;
  }
  if (!/^\d+$/.test(normalized)) {
    throw new Error(`${name} must be an integer between ${min} and ${max}`);
  }
  const parsed = Number.parseInt(normalized, 10);
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`${name} must be an integer between ${min} and ${max}`);
  }
  return parsed;
}

function parseAllowedOrigins(value: string | undefined): readonly string[] {
  const normalized = normalizeOptionalString(value);
  if (normalized === undefined) {
    return [...DEFAULT_ALLOWED_ORIGINS];
  }
  const origins = normalized
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
  return origins.length > 0 ? origins : [...DEFAULT_ALLOWED_ORIGINS];
}

const RawServerEnvSchema = z.object({
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().optional(),
  PORT: z.string().optional(),
  ALLOWED_ORIGINS: z.string().optional(),
  STRICT_AUTH_LOCKDOWN: z.string().optional(),
  API_AUTH_TOKEN: z.string().optional(),
  RATE_LIMIT_WINDOW_MS: z.string().optional(),
  RATE_LIMIT_MAX: z.string().optional(),
});

export function parseServerEnv(raw: RawServerEnvInput): ServerEnv {
  const validated = RawServerEnvSchema.parse(raw);

  const geminiApiKey = normalizeOptionalString(validated.GEMINI_API_KEY);
  const geminiModel =
    normalizeOptionalString(validated.GEMINI_MODEL) ?? DEFAULT_GEMINI_MODEL;
  const port = parsePositiveInt(validated.PORT, DEFAULT_PORT, 1, 65_535, 'PORT');
  const allowedOrigins = parseAllowedOrigins(validated.ALLOWED_ORIGINS);
  const strictAuthLockdown = parseStrictBooleanFlag(
    validated.STRICT_AUTH_LOCKDOWN,
    false,
  );
  const apiAuthToken = normalizeOptionalString(validated.API_AUTH_TOKEN);
  const rateLimitWindowMs = parsePositiveInt(
    validated.RATE_LIMIT_WINDOW_MS,
    DEFAULT_RATE_LIMIT_WINDOW_MS,
    1_000,
    3_600_000,
    'RATE_LIMIT_WINDOW_MS',
  );
  const rateLimitMax = parsePositiveInt(
    validated.RATE_LIMIT_MAX,
    DEFAULT_RATE_LIMIT_MAX,
    1,
    10_000,
    'RATE_LIMIT_MAX',
  );

  return {
    geminiApiKey,
    geminiModel,
    port,
    allowedOrigins,
    strictAuthLockdown,
    apiAuthToken,
    rateLimitWindowMs,
    rateLimitMax,
  };
}

export function getServerEnv(): ServerEnv {
  return parseServerEnv({
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    GEMINI_MODEL: process.env.GEMINI_MODEL,
    PORT: process.env.PORT,
    ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS,
    STRICT_AUTH_LOCKDOWN: process.env.STRICT_AUTH_LOCKDOWN,
    API_AUTH_TOKEN: process.env.API_AUTH_TOKEN,
    RATE_LIMIT_WINDOW_MS: process.env.RATE_LIMIT_WINDOW_MS,
    RATE_LIMIT_MAX: process.env.RATE_LIMIT_MAX,
  });
}
