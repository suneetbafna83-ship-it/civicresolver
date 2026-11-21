import { createHash } from 'node:crypto';
import type {
  TriageEngine,
  TriageRequest,
  TriageResult,
} from '../../../shared/types/civic.js';

export const DEFAULT_CACHE_MAX_ENTRIES = 256;
export const DEFAULT_CACHE_TTL_MS = 15 * 60 * 1000;

interface CacheEntry {
  readonly result: TriageResult;
  readonly model: string;
  readonly expiresAtMs: number;
}

export interface TriageCacheHit {
  readonly result: TriageResult;
  readonly model: string;
}

export interface TriageCacheOptions {
  readonly maxEntries?: number;
  readonly ttlMs?: number;
  readonly now?: () => number;
}

function normalizeWhitespace(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

function extractCanonicalImageDigest(
  imageBase64: string | undefined,
  imageMimeType: string | undefined,
): { readonly mimeType: string | null; readonly sha256: string } | null {
  if (imageBase64 === undefined) {
    return null;
  }

  const trimmed = imageBase64.trim();
  let mime: string | null = imageMimeType ?? null;
  let body = trimmed;

  if (trimmed.slice(0, 5).toLowerCase() === 'data:') {
    const markerIndex = trimmed.slice(0, 80).toLowerCase().indexOf(';base64,');
    if (markerIndex !== -1) {
      mime = trimmed.slice(5, markerIndex).toLowerCase();
      body = trimmed.slice(markerIndex + ';base64,'.length);
    }
  }

  const digest = createHash('sha256').update(body).digest('hex');
  return { mimeType: mime, sha256: digest };
}

export function computeTriageCacheKey(
  request: TriageRequest,
  model: string,
): string {
  const canonicalNearby = request.nearbyIssues
    ? [...request.nearbyIssues]
        .map((issue) => ({
          id: issue.id.trim(),
          title: normalizeWhitespace(issue.title),
          description: normalizeWhitespace(issue.description),
          category: issue.category ?? null,
          lat: Number(issue.lat.toFixed(6)),
          lng: Number(issue.lng.toFixed(6)),
          status: issue.status ?? null,
        }))
        .sort((a, b) => a.id.localeCompare(b.id))
    : null;

  const canonicalPayload = {
    model: model.trim(),
    title: normalizeWhitespace(request.title),
    description: normalizeWhitespace(request.description),
    image: extractCanonicalImageDigest(
      request.imageBase64,
      request.imageMimeType,
    ),
    location: request.location
      ? {
          lat: Number(request.location.lat.toFixed(6)),
          lng: Number(request.location.lng.toFixed(6)),
          address: request.location.address
            ? normalizeWhitespace(request.location.address)
            : null,
        }
      : null,
    nearbyIssues: canonicalNearby,
  };

  const hash = createHash('sha256')
    .update(JSON.stringify(canonicalPayload))
    .digest('hex');
  return `sha256:${hash}`;
}

export class TriageCache {
  private readonly maxEntries: number;
  private readonly ttlMs: number;
  private readonly nowFn: () => number;
  private readonly entries = new Map<string, CacheEntry>();

  constructor(options?: TriageCacheOptions) {
    this.maxEntries = Math.max(1, options?.maxEntries ?? DEFAULT_CACHE_MAX_ENTRIES);
    this.ttlMs = Math.max(1, options?.ttlMs ?? DEFAULT_CACHE_TTL_MS);
    this.nowFn = options?.now ?? (() => Date.now());
  }

  get(key: string): TriageCacheHit | null {
    const entry = this.entries.get(key);
    if (entry === undefined) {
      return null;
    }

    if (this.nowFn() > entry.expiresAtMs) {
      this.entries.delete(key);
      return null;
    }

    this.entries.delete(key);
    this.entries.set(key, entry);

    return {
      result: structuredClone(entry.result),
      model: entry.model,
    };
  }

  setGeminiResult(
    key: string,
    model: string,
    result: TriageResult,
    engine: TriageEngine = 'gemini',
  ): void {
    if (engine !== 'gemini') {
      return;
    }

    if (this.entries.has(key)) {
      this.entries.delete(key);
    } else if (this.entries.size >= this.maxEntries) {
      const oldestKey = this.entries.keys().next().value;
      if (oldestKey !== undefined) {
        this.entries.delete(oldestKey);
      }
    }

    this.entries.set(key, {
      result: structuredClone(result),
      model,
      expiresAtMs: this.nowFn() + this.ttlMs,
    });
  }

  clear(): void {
    this.entries.clear();
  }

  size(): number {
    return this.entries.size;
  }
}

export function createTriageCache(options?: TriageCacheOptions): TriageCache {
  return new TriageCache(options);
}

export const defaultTriageCache = createTriageCache();
