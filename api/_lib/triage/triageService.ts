import type {
  TriageRequest,
  TriageResponse,
} from '../../../shared/types/civic.js';
import { getServerEnv } from '../env.js';
import { sanitizeTriageResult } from '../middleware/sanitize.js';
import {
  DEFAULT_GEMINI_TIMEOUT_MS,
  runGeminiTriage,
  type GeminiClientLike,
} from './geminiTriage.js';
import {
  HEURISTIC_MODEL_ID,
  runHeuristicTriage,
} from './heuristicTriage.js';
import {
  computeTriageCacheKey,
  defaultTriageCache,
  type TriageCache,
} from './triageCache.js';

export interface TriageServiceOptions {
  readonly apiKey?: string | undefined;
  readonly model?: string | undefined;
  readonly timeoutMs?: number | undefined;
  readonly cache?: TriageCache | undefined;
  readonly geminiClient?: GeminiClientLike | undefined;
  readonly now?: (() => number) | undefined;
}

export type TriageServiceFn = (
  request: TriageRequest,
  overrideOptions?: TriageServiceOptions,
) => Promise<TriageResponse>;

function clampLatencyMs(rawMs: number): number {
  if (!Number.isFinite(rawMs) || rawMs < 0) {
    return 0;
  }
  return Math.min(120_000, Math.round(rawMs));
}

export function createTriageService(
  defaultOptions?: TriageServiceOptions,
): TriageServiceFn {
  return async function triageCivicIssue(
    request: TriageRequest,
    overrideOptions?: TriageServiceOptions,
  ): Promise<TriageResponse> {
    const merged: TriageServiceOptions = {
      ...defaultOptions,
      ...overrideOptions,
    };
    const nowFn = merged.now ?? (() => Date.now());
    const startedAt = nowFn();

    const env = getServerEnv();
    const hasExplicitApiKey =
      (overrideOptions !== undefined && 'apiKey' in overrideOptions) ||
      (defaultOptions !== undefined && 'apiKey' in defaultOptions);
    const apiKey = hasExplicitApiKey ? merged.apiKey : env.geminiApiKey;
    const model = merged.model?.trim() || env.geminiModel;
    const timeoutMs = merged.timeoutMs ?? DEFAULT_GEMINI_TIMEOUT_MS;
    const cache = merged.cache ?? defaultTriageCache;

    const cacheKey = computeTriageCacheKey(request, model);
    const cached = cache.get(cacheKey);
    if (cached !== null) {
      const sanitizedCached = sanitizeTriageResult(cached.result);
      const finishedAt = nowFn();
      return {
        triage: sanitizedCached,
        metadata: {
          engine: 'gemini',
          model: cached.model,
          cacheHit: true,
          cacheKey,
          latencyMs: clampLatencyMs(finishedAt - startedAt),
          timestamp: new Date(finishedAt).toISOString(),
        },
      };
    }

    if (!apiKey || apiKey.trim().length === 0) {
      const fallbackResult = sanitizeTriageResult(runHeuristicTriage(request));
      const finishedAt = nowFn();
      return {
        triage: fallbackResult,
        metadata: {
          engine: 'nlp-fallback',
          model: HEURISTIC_MODEL_ID,
          cacheHit: false,
          cacheKey,
          fallbackReason: 'missing_api_key',
          latencyMs: clampLatencyMs(finishedAt - startedAt),
          timestamp: new Date(finishedAt).toISOString(),
        },
      };
    }

    const geminiOutcome = await runGeminiTriage(request, {
      apiKey,
      model,
      timeoutMs,
      client: merged.geminiClient,
    });

    if (geminiOutcome.ok) {
      const sanitizedGemini = sanitizeTriageResult(geminiOutcome.result);
      cache.setGeminiResult(
        cacheKey,
        geminiOutcome.model,
        sanitizedGemini,
        'gemini',
      );
      const finishedAt = nowFn();
      return {
        triage: sanitizedGemini,
        metadata: {
          engine: 'gemini',
          model: geminiOutcome.model,
          cacheHit: false,
          cacheKey,
          latencyMs: clampLatencyMs(finishedAt - startedAt),
          timestamp: new Date(finishedAt).toISOString(),
        },
      };
    }

    const fallbackResult = sanitizeTriageResult(runHeuristicTriage(request));
    const finishedAt = nowFn();
    return {
      triage: fallbackResult,
      metadata: {
        engine: 'nlp-fallback',
        model: HEURISTIC_MODEL_ID,
        cacheHit: false,
        cacheKey,
        fallbackReason: geminiOutcome.fallbackReason,
        latencyMs: clampLatencyMs(finishedAt - startedAt),
        timestamp: new Date(finishedAt).toISOString(),
      },
    };
  };
}

export const triageCivicIssue = createTriageService();
