import http from 'node:http';
import path from 'node:path';
import { Readable } from 'node:stream';
import ts from 'typescript';
import { vi } from 'vitest';
import type {
  CivicIssue,
  CivicSession,
  Department,
  IssueAdminUpdateInput,
  IssueCreateInput,
  IssueFilterOptions,
  IssueStatus,
  TriageResult,
  UploadImageMimeType,
} from '../../../shared/types/civic.js';
import { WEBP_DATA_URL_PREFIX } from '../../../shared/types/civic.js';
import type { StoredWebpValidationResult } from '../../../shared/schemas/issue.js';

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function requireAt<T>(
  items: readonly T[],
  index: number,
  label: string,
): T {
  const item = items.at(index);
  if (item === undefined) {
    throw new Error(`Expected element at index ${index} for ${label}`);
  }
  return item;
}

export function readStringProp(
  obj: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = Reflect.get(obj, key);
  return typeof value === 'string' ? value : undefined;
}

export function readBooleanProp(
  obj: Record<string, unknown>,
  key: string,
): boolean | undefined {
  const value = Reflect.get(obj, key);
  return typeof value === 'boolean' ? value : undefined;
}

export async function importWorkspaceModule(
  relativeFromRoot: string,
): Promise<Record<string, unknown>> {
  const absoluteTarget = path.resolve(process.cwd(), relativeFromRoot);
  if (!ts.sys.fileExists(absoluteTarget)) {
    throw new Error(
      `Workspace module "${relativeFromRoot}" not found at "${absoluteTarget}"`,
    );
  }
  const specifier = `../../../${relativeFromRoot}`;
  const mod: unknown = await import(specifier);
  if (!isRecord(mod)) {
    throw new Error(
      `Module "${relativeFromRoot}" did not resolve to an object namespace`,
    );
  }
  return mod;
}

export function listWorkspaceFiles(
  extensions: readonly string[],
  excludes: readonly string[] = [
    'node_modules',
    'dist',
    'coverage',
    '.vercel',
    '.git',
  ],
): string[] {
  return ts.sys.readDirectory(process.cwd(), extensions, excludes, undefined);
}

export function readWorkspaceTextFile(absolutePath: string): string {
  const content = ts.sys.readFile(absolutePath, 'utf8');
  if (content === undefined) {
    throw new Error(`Unable to read workspace file "${absolutePath}"`);
  }
  return content;
}

export interface TestEnvOverrides {
  GEMINI_API_KEY?: string | undefined;
  GEMINI_MODEL?: string | undefined;
  PORT?: string | undefined;
  ALLOWED_ORIGINS?: string | undefined;
  STRICT_AUTH_LOCKDOWN?: string | undefined;
  RATE_LIMIT_MAX?: string | undefined;
  RATE_LIMIT_WINDOW_MS?: string | undefined;
  VITE_FIREBASE_API_KEY?: string | undefined;
  VITE_FIREBASE_AUTH_DOMAIN?: string | undefined;
  VITE_FIREBASE_PROJECT_ID?: string | undefined;
  VITE_FIREBASE_APP_ID?: string | undefined;
  NODE_ENV?: string | undefined;
  VITEST?: string | undefined;
}

export function applyTestEnv(overrides: TestEnvOverrides): () => void {
  const previous = new Map<string, string | undefined>();
  for (const [key, nextVal] of Object.entries(overrides)) {
    const prevRaw = Reflect.get(process.env, key);
    previous.set(key, typeof prevRaw === 'string' ? prevRaw : undefined);
    if (nextVal === undefined) {
      Reflect.deleteProperty(process.env, key);
    } else {
      Reflect.set(process.env, key, nextVal);
    }
  }

  return () => {
    for (const [key, prevVal] of previous.entries()) {
      if (prevVal === undefined) {
        Reflect.deleteProperty(process.env, key);
      } else {
        Reflect.set(process.env, key, prevVal);
      }
    }
  };
}

export async function withTestEnv<T>(
  overrides: TestEnvOverrides,
  fn: () => Promise<T> | T,
): Promise<T> {
  const restore = applyTestEnv(overrides);
  try {
    return await fn();
  } finally {
    restore();
  }
}

export interface LocalStorageShimController {
  storage: Storage;
  clear: () => void;
  failNextWrite: (error?: Error) => void;
  failAllOps: (error?: Error) => void;
  restore: () => void;
}

export function installLocalStorageShim(): LocalStorageShimController {
  const hadOwn = Object.prototype.hasOwnProperty.call(
    globalThis,
    'localStorage',
  );
  const previousValue: unknown = Reflect.get(globalThis, 'localStorage');
  const store = new Map<string, string>();
  let nextWriteFailure: Error | null = null;
  let allOpsFailure: Error | null = null;

  const storage: Storage = {
    get length(): number {
      if (allOpsFailure !== null) {
        throw allOpsFailure;
      }
      return store.size;
    },
    clear(): void {
      if (allOpsFailure !== null) {
        throw allOpsFailure;
      }
      store.clear();
    },
    getItem(key: string): string | null {
      if (allOpsFailure !== null) {
        throw allOpsFailure;
      }
      const value = store.get(key);
      return value === undefined ? null : value;
    },
    key(index: number): string | null {
      if (allOpsFailure !== null) {
        throw allOpsFailure;
      }
      const keys = Array.from(store.keys());
      const entry = keys.at(index);
      return entry === undefined ? null : entry;
    },
    removeItem(key: string): void {
      if (allOpsFailure !== null) {
        throw allOpsFailure;
      }
      store.delete(key);
    },
    setItem(key: string, value: string): void {
      if (allOpsFailure !== null) {
        throw allOpsFailure;
      }
      if (nextWriteFailure !== null) {
        const err = nextWriteFailure;
        nextWriteFailure = null;
        throw err;
      }
      store.set(key, String(value));
    },
  };

  Reflect.set(globalThis, 'localStorage', storage);

  return {
    storage,
    clear: () => {
      nextWriteFailure = null;
      allOpsFailure = null;
      store.clear();
    },
    failNextWrite: (error?: Error) => {
      nextWriteFailure =
        error ?? new Error('QuotaExceededError: Simulated storage quota full');
    },
    failAllOps: (error?: Error) => {
      allOpsFailure =
        error ?? new Error('SecurityError: Simulated storage unavailable');
    },
    restore: () => {
      if (hadOwn) {
        Reflect.set(globalThis, 'localStorage', previousValue);
      } else {
        Reflect.deleteProperty(globalThis, 'localStorage');
      }
    },
  };
}

export async function withoutLocalStorage<T>(
  fn: () => Promise<T> | T,
): Promise<T> {
  const hadOwn = Object.prototype.hasOwnProperty.call(
    globalThis,
    'localStorage',
  );
  const previousValue: unknown = Reflect.get(globalThis, 'localStorage');
  Reflect.deleteProperty(globalThis, 'localStorage');
  try {
    return await fn();
  } finally {
    if (hadOwn) {
      Reflect.set(globalThis, 'localStorage', previousValue);
    } else {
      Reflect.deleteProperty(globalThis, 'localStorage');
    }
  }
}

export interface VercelInvokeOptions {
  method: string;
  url?: string;
  headers?: Record<string, string>;
  query?: Record<string, string>;
  body?: unknown;
  rawBody?: string | Buffer;
  remoteAddress?: string;
}

export interface VercelInvokeResult {
  status: number;
  headers: Map<string, string>;
  text: string;
  json: unknown;
}

export type VercelHandlerFn = (req: unknown, res: unknown) => unknown;

function normalizeHeaders(
  input: Record<string, string> | undefined,
  defaultContentType: string | null,
): Record<string, string> {
  const out: Record<string, string> = {};
  if (input !== undefined) {
    for (const [k, v] of Object.entries(input)) {
      Reflect.set(out, k.toLowerCase(), v);
    }
  }
  if (
    defaultContentType !== null &&
    Reflect.get(out, 'content-type') === undefined
  ) {
    Reflect.set(out, 'content-type', defaultContentType);
  }
  return out;
}

export async function loadVercelHandler(
  relativePath: 'api/health.ts' | 'api/triage.ts',
): Promise<VercelHandlerFn> {
  const mod = await importWorkspaceModule(relativePath);
  const defaultExport = Reflect.get(mod, 'default');
  if (typeof defaultExport === 'function') {
    return defaultExport as VercelHandlerFn;
  }
  const namedHandler = Reflect.get(mod, 'handler');
  if (typeof namedHandler === 'function') {
    return namedHandler as VercelHandlerFn;
  }
  throw new Error(
    `Module "${relativePath}" must export a default or named handler function`,
  );
}

export async function invokeVercelHandler(
  handler: VercelHandlerFn,
  options: VercelInvokeOptions,
): Promise<VercelInvokeResult> {
  const hasJsonBody = options.body !== undefined && options.rawBody === undefined;
  const normalizedHeaders = normalizeHeaders(
    options.headers,
    hasJsonBody ? 'application/json' : null,
  );
  const remoteAddress = options.remoteAddress ?? '127.0.0.1';

  const stream = new Readable({
    read(): void {
      if (options.rawBody !== undefined) {
        this.push(options.rawBody);
      } else if (options.body !== undefined) {
        this.push(JSON.stringify(options.body));
      }
      this.push(null);
    },
  });

  Reflect.set(stream, 'method', options.method.toUpperCase());
  Reflect.set(stream, 'url', options.url ?? '/');
  Reflect.set(stream, 'headers', normalizedHeaders);
  Reflect.set(stream, 'query', options.query ?? {});
  Reflect.set(stream, 'ip', remoteAddress);
  Reflect.set(stream, 'socket', { remoteAddress });
  if (hasJsonBody) {
    Reflect.set(stream, 'body', options.body);
  }

  const responseHeaders = new Map<string, string>();
  let statusCode = 200;
  let headersSent = false;
  let rawText = '';
  let jsonPayload: unknown = undefined;
  let ended = false;
  let resolveEnd: (() => void) | null = null;
  const endPromise = new Promise<void>((resolve) => {
    resolveEnd = resolve;
  });

  const markEnded = (chunk?: unknown): void => {
    if (chunk !== undefined) {
      if (typeof chunk === 'string') {
        rawText = chunk;
      } else if (Buffer.isBuffer(chunk)) {
        rawText = chunk.toString('utf8');
      } else {
        rawText = JSON.stringify(chunk);
        jsonPayload = chunk;
      }
    }
    if (jsonPayload === undefined && rawText.length > 0) {
      try {
        jsonPayload = JSON.parse(rawText);
      } catch {
        jsonPayload = undefined;
      }
    }
    headersSent = true;
    ended = true;
    if (resolveEnd !== null) {
      resolveEnd();
    }
  };

  const res = {
    get statusCode(): number {
      return statusCode;
    },
    set statusCode(code: number) {
      statusCode = code;
    },
    get headersSent(): boolean {
      return headersSent;
    },
    status(code: number) {
      statusCode = code;
      return res;
    },
    setHeader(name: string, value: string | number | readonly string[]) {
      const normalized = Array.isArray(value)
        ? value.join(', ')
        : String(value);
      responseHeaders.set(name.toLowerCase(), normalized);
      return res;
    },
    header(name: string, value: string | number | readonly string[]) {
      return res.setHeader(name, value);
    },
    getHeader(name: string): string | undefined {
      return responseHeaders.get(name.toLowerCase());
    },
    removeHeader(name: string): void {
      responseHeaders.delete(name.toLowerCase());
    },
    writeHead(
      code: number,
      headersObj?: Record<string, string | number | readonly string[]>,
    ) {
      statusCode = code;
      if (headersObj !== undefined) {
        for (const [k, v] of Object.entries(headersObj)) {
          res.setHeader(k, v);
        }
      }
      headersSent = true;
      return res;
    },
    json(payload: unknown) {
      if (!responseHeaders.has('content-type')) {
        responseHeaders.set('content-type', 'application/json; charset=utf-8');
      }
      jsonPayload = payload;
      rawText = JSON.stringify(payload);
      markEnded();
      return res;
    },
    send(payload: unknown) {
      if (typeof payload === 'string' || Buffer.isBuffer(payload)) {
        markEnded(payload);
      } else {
        return res.json(payload);
      }
      return res;
    },
    end(chunk?: unknown) {
      markEnded(chunk);
      return res;
    },
  };

  await Promise.resolve(handler(stream, res));
  if (!ended) {
    await Promise.race([
      endPromise,
      new Promise<void>((resolve) => {
        setTimeout(resolve, 250);
      }),
    ]);
  }

  return {
    status: statusCode,
    headers: responseHeaders,
    text: rawText,
    json: jsonPayload,
  };
}

function isRequestListenerLike(value: unknown): value is http.RequestListener {
  return (
    typeof value === 'function' &&
    ('use' in value || 'listen' in value || 'handle' in value)
  );
}

export async function loadExpressApp(
  relativePath = 'server/devServer.ts',
): Promise<http.RequestListener> {
  const mod = await importWorkspaceModule(relativePath);
  const candidateNames = [
    'createApp',
    'createDevServer',
    'createServer',
    'app',
    'default',
  ];
  for (const name of candidateNames) {
    const candidate = Reflect.get(mod, name);
    if (isRequestListenerLike(candidate)) {
      return candidate;
    }
    if (typeof candidate === 'function') {
      const produced: unknown = (candidate as () => unknown)();
      if (typeof produced === 'function') {
        return produced as http.RequestListener;
      }
      if (isRecord(produced)) {
        const innerApp = Reflect.get(produced, 'app');
        if (typeof innerApp === 'function') {
          return innerApp as http.RequestListener;
        }
      }
    }
  }
  throw new Error(
    `Module "${relativePath}" must export createApp(), createDevServer(), app, or default Express app`,
  );
}

export interface EphemeralServerHandle {
  baseUrl: string;
  port: number;
  fetchJson: (
    pathname: string,
    init?: RequestInit,
  ) => Promise<{
    status: number;
    headers: Headers;
    text: string;
    json: unknown;
  }>;
  fetchRaw: (pathname: string, init?: RequestInit) => Promise<Response>;
  close: () => Promise<void>;
}

export async function startEphemeralServer(
  envOverrides: TestEnvOverrides = {},
  options: { resetModules?: boolean } = {},
): Promise<EphemeralServerHandle> {
  const mergedOverrides: TestEnvOverrides = {
    NODE_ENV: 'test',
    VITEST: 'true',
    ...envOverrides,
  };
  const restoreEnv = applyTestEnv(mergedOverrides);
  let server: http.Server | null = null;

  try {
    if (options.resetModules !== false) {
      vi.resetModules();
    }
    const app = await loadExpressApp('server/devServer.ts');
    server = http.createServer(app);

    await new Promise<void>((resolve, reject) => {
      if (server === null) {
        reject(new Error('HTTP server failed to initialize'));
        return;
      }
      server.once('error', reject);
      server.listen(0, '127.0.0.1', () => {
        resolve();
      });
    });

    const address = server.address();
    if (address === null || typeof address === 'string') {
      throw new Error('Failed to bind ephemeral port on 127.0.0.1');
    }
    const baseUrl = `http://127.0.0.1:${address.port}`;

    const fetchRaw = async (
      pathname: string,
      init?: RequestInit,
    ): Promise<Response> => {
      const normalizedPath = pathname.startsWith('/')
        ? pathname
        : `/${pathname}`;
      return fetch(`${baseUrl}${normalizedPath}`, init);
    };

    const fetchJson = async (pathname: string, init?: RequestInit) => {
      const response = await fetchRaw(pathname, init);
      const text = await response.text();
      let parsed: unknown = undefined;
      if (text.length > 0) {
        try {
          parsed = JSON.parse(text);
        } catch {
          parsed = undefined;
        }
      }
      return {
        status: response.status,
        headers: response.headers,
        text,
        json: parsed,
      };
    };

    const close = async (): Promise<void> => {
      try {
        if (server !== null && server.listening) {
          await new Promise<void>((resolve, reject) => {
            if (server === null) {
              resolve();
              return;
            }
            if (typeof server.closeAllConnections === 'function') {
              server.closeAllConnections();
            }
            server.close((err) => {
              if (err !== undefined) {
                reject(err);
              } else {
                resolve();
              }
            });
          });
        }
      } finally {
        restoreEnv();
      }
    };

    return {
      baseUrl,
      port: address.port,
      fetchJson,
      fetchRaw,
      close,
    };
  } catch (err: unknown) {
    if (server !== null && server.listening) {
      server.close();
    }
    restoreEnv();
    throw new Error('Failed to start ephemeral Express server', { cause: err });
  }
}

export interface GenAIMockCall {
  apiKey: string | undefined;
  model: string;
  contents: unknown;
  config: unknown;
}

export type GenAIMockOutcome =
  | { kind: 'triage'; result: TriageResult }
  | { kind: 'raw-text'; text: string }
  | {
      kind: 'error';
      status?: number;
      name?: string;
      message: string;
      code?: string;
    }
  | { kind: 'timeout'; message?: string };

export interface GenAIMockState {
  calls: GenAIMockCall[];
  queue: GenAIMockOutcome[];
  defaultResult: TriageResult;
  handler:
    | ((call: GenAIMockCall) => Promise<GenAIMockOutcome> | GenAIMockOutcome)
    | null;
}

export function createSampleTriageResult(
  overrides: Partial<TriageResult> = {},
): TriageResult {
  return {
    category: 'Pothole & Road Damage',
    urgencyScore: 8,
    priorityLevel: 'High',
    recommendedDepartment: 'Roads & Infrastructure',
    slaEstimateHours: 24,
    slaEstimateText: 'Within 24 hours',
    authenticityCheck: {
      isAuthentic: true,
      status: 'likely_authentic',
      confidence: 0.94,
      reason: 'Uploaded street photograph shows visible asphalt collapse matching report.',
    },
    duplicateDetection: {
      isLikelyDuplicate: false,
      matchedIssueIds: [],
      highestSimilarity: 0.12,
      reason: 'No matching open pothole reports within 250 meters.',
    },
    summary: 'Deep pothole near school crosswalk requires urgent asphalt patching.',
    reasoning: 'High vehicular and pedestrian risk near school entrance warrants High priority.',
    ...overrides,
  };
}

export function createGenAIMockState(
  defaultResult: TriageResult = createSampleTriageResult(),
): GenAIMockState {
  return {
    calls: [],
    queue: [],
    defaultResult,
    handler: null,
  };
}

export function resetGenAIMockState(
  state: GenAIMockState,
  defaultResult: TriageResult = createSampleTriageResult(),
): void {
  state.calls.length = 0;
  state.queue.length = 0;
  state.defaultResult = defaultResult;
  state.handler = null;
}

function buildMockError(outcome: Extract<GenAIMockOutcome, { kind: 'error' }>): Error {
  const err = new Error(outcome.message);
  if (outcome.name !== undefined) {
    err.name = outcome.name;
  }
  if (outcome.status !== undefined) {
    Reflect.set(err, 'status', outcome.status);
  }
  if (outcome.code !== undefined) {
    Reflect.set(err, 'code', outcome.code);
  }
  return err;
}

export function createGenAIMockModule(state: GenAIMockState) {
  class GoogleGenAI {
    private readonly apiKey: string | undefined;

    public readonly models = {
      generateContent: async (params: {
        model: string;
        contents: unknown;
        config?: unknown;
      }): Promise<{ text: string }> => {
        const call: GenAIMockCall = {
          apiKey: this.apiKey,
          model: params.model,
          contents: params.contents,
          config: params.config,
        };
        state.calls.push(call);

        const nextOutcome: GenAIMockOutcome =
          state.handler !== null
            ? await state.handler(call)
            : (state.queue.shift() ?? {
                kind: 'triage',
                result: state.defaultResult,
              });

        switch (nextOutcome.kind) {
          case 'triage':
            return { text: JSON.stringify(nextOutcome.result) };
          case 'raw-text':
            return { text: nextOutcome.text };
          case 'error':
            throw buildMockError(nextOutcome);
          case 'timeout': {
            const abortErr = new Error(
              nextOutcome.message ?? 'The operation was aborted due to timeout',
            );
            abortErr.name = 'AbortError';
            Reflect.set(abortErr, 'code', 'ABORT_ERR');
            throw abortErr;
          }
        }
      },
    };

    constructor(options?: { apiKey?: string }) {
      this.apiKey = options?.apiKey;
    }
  }

  return {
    GoogleGenAI,
    Type: {
      OBJECT: 'OBJECT',
      STRING: 'STRING',
      NUMBER: 'NUMBER',
      INTEGER: 'INTEGER',
      BOOLEAN: 'BOOLEAN',
      ARRAY: 'ARRAY',
    },
  };
}

export function createSampleWebpBuffer(targetByteLength = 512): Buffer {
  const safeSize = Math.max(24, targetByteLength);
  const buf = Buffer.alloc(safeSize, 0x2a);
  buf.write('RIFF', 0, 'ascii');
  buf.writeUInt32LE(safeSize - 8, 4);
  buf.write('WEBP', 8, 'ascii');
  buf.write('VP8L', 12, 'ascii');
  buf.writeUInt32LE(safeSize - 20, 16);
  buf.writeUInt8(0x2f, 20);
  return buf;
}

export function createSampleWebpDataUrl(targetByteLength = 512): string {
  return `${WEBP_DATA_URL_PREFIX}${createSampleWebpBuffer(targetByteLength).toString('base64')}`;
}

export function createSampleJpegBuffer(targetByteLength = 512): Buffer {
  const safeSize = Math.max(16, targetByteLength);
  const buf = Buffer.alloc(safeSize, 0x33);
  buf.writeUInt8(0xff, 0);
  buf.writeUInt8(0xd8, 1);
  buf.writeUInt8(0xff, 2);
  buf.writeUInt8(0xe0, 3);
  buf.writeUInt8(0xff, safeSize - 2);
  buf.writeUInt8(0xd9, safeSize - 1);
  return buf;
}

export function createSamplePngBuffer(targetByteLength = 512): Buffer {
  const safeSize = Math.max(16, targetByteLength);
  const buf = Buffer.alloc(safeSize, 0x44);
  const pngMagic = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  for (let i = 0; i < pngMagic.length; i += 1) {
    const byte = pngMagic.at(i);
    if (byte !== undefined) {
      buf.writeUInt8(byte, i);
    }
  }
  return buf;
}

export function createSampleRawImageBase64(
  mime: UploadImageMimeType,
  targetByteLength = 512,
): string {
  switch (mime) {
    case 'image/webp':
      return createSampleWebpBuffer(targetByteLength).toString('base64');
    case 'image/jpeg':
      return createSampleJpegBuffer(targetByteLength).toString('base64');
    case 'image/png':
      return createSamplePngBuffer(targetByteLength).toString('base64');
  }
}

export function createDisguisedSvgBase64(): string {
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><script>alert("xss")</script></svg>';
  return Buffer.from(svg, 'utf8').toString('base64');
}

export function createSampleIssueInput(
  overrides: Partial<IssueCreateInput> = {},
): IssueCreateInput {
  return {
    title: 'Deep pothole near Elm Street school crosswalk',
    description:
      'Water-filled asphalt crater spans half the northbound lane and forces cyclists into traffic.',
    category: 'Pothole & Road Damage',
    location: {
      lat: 12.9716,
      lng: 77.5946,
      address: 'Elm Street & 4th Cross',
    },
    priorityLevel: 'High',
    urgencyScore: 8,
    recommendedDepartment: 'Roads & Infrastructure',
    assignedDepartment: 'Roads & Infrastructure',
    slaEstimateHours: 24,
    slaSummary: 'Within 24 hours',
    triageMeta: {
      engine: 'gemini',
      model: 'gemini-2.5-flash',
      cacheHit: false,
      authenticityStatus: 'likely_authentic',
      authenticityReason: 'Consistent road damage context.',
      potentialDuplicateIds: [],
      highestSimilarity: 0.1,
    },
    imageDataUrl: createSampleWebpDataUrl(512),
    ...overrides,
  };
}

export function makeSession(overrides: Partial<CivicSession> = {}): CivicSession {
  return {
    uid: 'guest-test-user-1',
    displayName: 'Citizen Reporter',
    email: null,
    role: 'citizen',
    provider: 'local-guest',
    isAnonymous: true,
    isPreviewAdmin: false,
    isVerifiedFirebaseAdmin: false,
    getIdToken: async () => null,
    ...overrides,
  };
}

export interface IssueRepositoryContract {
  getStorageMode: () => 'firestore' | 'local';
  listIssues: (options?: IssueFilterOptions) => Promise<CivicIssue[]>;
  getIssueById: (id: string) => Promise<CivicIssue | null>;
  createIssue: (
    input: IssueCreateInput,
    session: CivicSession,
  ) => Promise<CivicIssue>;
  upvoteIssue: (issueId: string, session: CivicSession) => Promise<CivicIssue>;
  updateIssue: (
    issueId: string,
    patch: IssueAdminUpdateInput,
    session: CivicSession,
  ) => Promise<CivicIssue>;
}

function assertRepositoryContract(instance: unknown): IssueRepositoryContract {
  if (!isRecord(instance)) {
    throw new Error('Repository instance must be an object');
  }
  const requiredMethods = [
    'getStorageMode',
    'listIssues',
    'getIssueById',
    'createIssue',
    'upvoteIssue',
    'updateIssue',
  ];
  for (const methodName of requiredMethods) {
    if (typeof Reflect.get(instance, methodName) !== 'function') {
      throw new Error(`Repository missing required method "${methodName}"`);
    }
  }
  return instance as unknown as IssueRepositoryContract;
}

export async function loadHybridRepository(): Promise<IssueRepositoryContract> {
  const mod = await importWorkspaceModule(
    'src/lib/repositories/hybridIssueRepository.ts',
  );
  const RepoCtor = Reflect.get(mod, 'HybridIssueRepository');
  if (typeof RepoCtor === 'function') {
    const instance = new (RepoCtor as new () => unknown)();
    return assertRepositoryContract(instance);
  }
  const factory = Reflect.get(mod, 'createHybridIssueRepository');
  if (typeof factory === 'function') {
    const instance = (factory as () => unknown)();
    return assertRepositoryContract(instance);
  }
  throw new Error(
    'src/lib/repositories/hybridIssueRepository.ts must export HybridIssueRepository or createHybridIssueRepository',
  );
}

export async function loadLocalRepository(): Promise<IssueRepositoryContract> {
  const mod = await importWorkspaceModule(
    'src/lib/repositories/localIssueRepository.ts',
  );
  const RepoCtor = Reflect.get(mod, 'LocalIssueRepository');
  if (typeof RepoCtor === 'function') {
    const instance = new (RepoCtor as new () => unknown)();
    return assertRepositoryContract(instance);
  }
  throw new Error(
    'src/lib/repositories/localIssueRepository.ts must export LocalIssueRepository',
  );
}

export interface ImageValidationContract {
  validateRawUploadImage: (file: {
    name?: string;
    type: string;
    size: number;
    arrayBuffer: () => Promise<ArrayBuffer>;
    slice?: (start?: number, end?: number) => Blob;
  }) => Promise<{ valid: boolean; reason?: string }>;
  validateStoredWebpDataUrl: (dataUrl: string) => StoredWebpValidationResult;
}

export async function loadImageValidation(): Promise<ImageValidationContract> {
  const mod = await importWorkspaceModule('src/lib/media/imageValidation.ts');
  const rawNames = [
    'validateUploadImageFile',
    'validateRawUploadImage',
    'validateImageFile',
    'validateUploadImage',
    'validatePreCompressionImage',
  ];
  let rawFn:
    | ((file: {
        name?: string;
        type: string;
        size: number;
        arrayBuffer: () => Promise<ArrayBuffer>;
        slice?: (start?: number, end?: number) => Blob;
      }) => unknown)
    | null = null;
  for (const name of rawNames) {
    const candidate = Reflect.get(mod, name);
    if (typeof candidate === 'function') {
      rawFn = candidate as (file: {
        name?: string;
        type: string;
        size: number;
        arrayBuffer: () => Promise<ArrayBuffer>;
        slice?: (start?: number, end?: number) => Blob;
      }) => unknown;
      break;
    }
  }
  if (rawFn === null) {
    throw new Error(
      'src/lib/media/imageValidation.ts must export validateUploadImageFile / validateRawUploadImage',
    );
  }

  const storedCandidate =
    Reflect.get(mod, 'validateStoredWebpDataUrl') ??
    Reflect.get(mod, 'validateStoredWebpImage');
  if (typeof storedCandidate !== 'function') {
    throw new Error(
      'src/lib/media/imageValidation.ts must export validateStoredWebpDataUrl or validateStoredWebpImage',
    );
  }

  const resolvedRaw = rawFn;
  return {
    validateRawUploadImage: async (file) => {
      try {
        const result: unknown = await Promise.resolve(resolvedRaw(file));
        if (typeof result === 'boolean') {
          return { valid: result };
        }
        if (isRecord(result)) {
          const validVal = Reflect.get(result, 'valid');
          const okVal = Reflect.get(result, 'ok');
          const reasonVal = Reflect.get(result, 'reason');
          const errorVal = Reflect.get(result, 'error');
          const isValid =
            typeof validVal === 'boolean'
              ? validVal
              : typeof okVal === 'boolean'
                ? okVal
                : true;
          const reason =
            typeof reasonVal === 'string'
              ? reasonVal
              : typeof errorVal === 'string'
                ? errorVal
                : undefined;
          return reason !== undefined ? { valid: isValid, reason } : { valid: isValid };
        }
        return { valid: true };
      } catch (err: unknown) {
        return {
          valid: false,
          reason: err instanceof Error ? err.message : String(err),
        };
      }
    },
    validateStoredWebpDataUrl:
      storedCandidate as (dataUrl: string) => StoredWebpValidationResult,
  };
}

export interface AuthServiceContract {
  signInAsGuest: () => Promise<CivicSession>;
  signInAsPreviewAdmin: () => Promise<CivicSession>;
  signInWithEmail: (email: string, password: string) => Promise<CivicSession>;
  registerWithEmail: (
    email: string,
    password: string,
    displayName?: string,
  ) => Promise<CivicSession>;
  signInWithGoogle: () => Promise<CivicSession | null>;
  signOut: () => Promise<void>;
  getCurrentSession: () => Promise<CivicSession | null>;
  subscribeAuthSession: (
    listener: (session: CivicSession | null) => void,
  ) => () => void;
}

function resolveRequiredFn<T>(
  mod: Record<string, unknown>,
  names: readonly string[],
  moduleLabel: string,
): T {
  for (const name of names) {
    const candidate = Reflect.get(mod, name);
    if (typeof candidate === 'function') {
      return candidate as T;
    }
  }
  throw new Error(
    `${moduleLabel} missing expected function (${names.join(' | ')})`,
  );
}

export async function loadAuthService(): Promise<AuthServiceContract> {
  const mod = await importWorkspaceModule('src/lib/auth/authService.ts');
  const rawGetCurrentSession = resolveRequiredFn<
    () => Promise<CivicSession | null> | CivicSession | null
  >(mod, ['getCurrentSession', 'getActiveSession'], 'authService');
  return {
    signInAsGuest: resolveRequiredFn(
      mod,
      ['signInAsGuest', 'signInGuest'],
      'authService',
    ),
    signInAsPreviewAdmin: resolveRequiredFn(
      mod,
      ['signInAsPreviewAdmin', 'signInPreviewAdmin', 'enterPreviewAdminMode'],
      'authService',
    ),
    signInWithEmail: resolveRequiredFn(
      mod,
      ['signInWithEmail', 'signInWithEmailPassword'],
      'authService',
    ),
    registerWithEmail: resolveRequiredFn(
      mod,
      ['registerWithEmail', 'signUpWithEmail', 'registerWithEmailPassword'],
      'authService',
    ),
    signInWithGoogle: resolveRequiredFn(
      mod,
      ['signInWithGoogle'],
      'authService',
    ),
    signOut: resolveRequiredFn(mod, ['signOut', 'logout'], 'authService'),
    getCurrentSession: async () => Promise.resolve(rawGetCurrentSession()),
    subscribeAuthSession: resolveRequiredFn(
      mod,
      [
        'subscribeAuthSession',
        'onAuthSessionChange',
        'onAuthStateChange',
        'subscribeAuthState',
      ],
      'authService',
    ),
  };
}

export interface FirebaseAuthMockUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  isAnonymous: boolean;
  getIdToken: () => Promise<string>;
}

export interface FirebaseAuthMockState {
  emailSignInCalls: Array<{ email: string; password: string }>;
  emailCreateCalls: Array<{ email: string; password: string }>;
  googlePopupCalls: number;
  googleRedirectCalls: number;
  anonymousCalls: number;
  signOutCalls: number;
  nextPopupError: { code: string; message: string } | null;
  nextEmailError: { code: string; message: string } | null;
  currentUser: FirebaseAuthMockUser | null;
  listeners: Array<(user: FirebaseAuthMockUser | null) => void>;
}

export function createFirebaseAuthMockState(): FirebaseAuthMockState {
  return {
    emailSignInCalls: [],
    emailCreateCalls: [],
    googlePopupCalls: 0,
    googleRedirectCalls: 0,
    anonymousCalls: 0,
    signOutCalls: 0,
    nextPopupError: null,
    nextEmailError: null,
    currentUser: null,
    listeners: [],
  };
}

export function resetFirebaseAuthMockState(state: FirebaseAuthMockState): void {
  state.emailSignInCalls.length = 0;
  state.emailCreateCalls.length = 0;
  state.googlePopupCalls = 0;
  state.googleRedirectCalls = 0;
  state.anonymousCalls = 0;
  state.signOutCalls = 0;
  state.nextPopupError = null;
  state.nextEmailError = null;
  state.currentUser = null;
  state.listeners.length = 0;
}

export function createFirebaseAppMockModule() {
  const apps: Array<{ name: string; options: Record<string, unknown> }> = [];
  return {
    initializeApp: (options: Record<string, unknown>, name = '[DEFAULT]') => {
      const app = { name, options };
      apps.push(app);
      return app;
    },
    getApps: () => apps,
    getApp: () => {
      const first = apps.at(0);
      if (first === undefined) {
        throw new Error('No Firebase App has been initialized');
      }
      return first;
    },
  };
}

export function createFirebaseAuthMockModule(state: FirebaseAuthMockState) {
  const notify = (user: FirebaseAuthMockUser | null): void => {
    state.currentUser = user;
    for (const listener of state.listeners) {
      listener(user);
    }
  };

  class GoogleAuthProvider {
    public setCustomParameters(_params: Record<string, string>): this {
      return this;
    }
  }

  return {
    GoogleAuthProvider,
    getAuth: () => ({
      get currentUser() {
        return state.currentUser;
      },
    }),
    onAuthStateChanged: (
      _auth: unknown,
      callback: (user: FirebaseAuthMockUser | null) => void,
    ) => {
      state.listeners.push(callback);
      callback(state.currentUser);
      return () => {
        const idx = state.listeners.indexOf(callback);
        if (idx >= 0) {
          state.listeners.splice(idx, 1);
        }
      };
    },
    signInAnonymously: async () => {
      state.anonymousCalls += 1;
      const user: FirebaseAuthMockUser = {
        uid: `anon-${state.anonymousCalls}`,
        email: null,
        displayName: 'Anonymous Citizen',
        isAnonymous: true,
        getIdToken: async () => 'mock-anon-jwt-token',
      };
      notify(user);
      return { user };
    },
    signInWithEmailAndPassword: async (
      _auth: unknown,
      email: string,
      password: string,
    ) => {
      state.emailSignInCalls.push({ email, password });
      if (state.nextEmailError !== null) {
        const err = new Error(state.nextEmailError.message);
        Reflect.set(err, 'code', state.nextEmailError.code);
        state.nextEmailError = null;
        throw err;
      }
      const user: FirebaseAuthMockUser = {
        uid: 'email-user-1',
        email,
        displayName: email.split('@').at(0) ?? 'Citizen',
        isAnonymous: false,
        getIdToken: async () => 'mock-email-jwt-token',
      };
      notify(user);
      return { user };
    },
    createUserWithEmailAndPassword: async (
      _auth: unknown,
      email: string,
      password: string,
    ) => {
      state.emailCreateCalls.push({ email, password });
      if (state.nextEmailError !== null) {
        const err = new Error(state.nextEmailError.message);
        Reflect.set(err, 'code', state.nextEmailError.code);
        state.nextEmailError = null;
        throw err;
      }
      const user: FirebaseAuthMockUser = {
        uid: 'email-registered-1',
        email,
        displayName: email.split('@').at(0) ?? 'Citizen',
        isAnonymous: false,
        getIdToken: async () => 'mock-registered-jwt-token',
      };
      notify(user);
      return { user };
    },
    updateProfile: async (
      user: FirebaseAuthMockUser,
      profile: { displayName?: string },
    ) => {
      if (profile.displayName !== undefined) {
        user.displayName = profile.displayName;
      }
    },
    signInWithPopup: async () => {
      state.googlePopupCalls += 1;
      if (state.nextPopupError !== null) {
        const err = new Error(state.nextPopupError.message);
        Reflect.set(err, 'code', state.nextPopupError.code);
        state.nextPopupError = null;
        throw err;
      }
      const user: FirebaseAuthMockUser = {
        uid: 'google-user-1',
        email: 'google.citizen@civic.test',
        displayName: 'Google Citizen',
        isAnonymous: false,
        getIdToken: async () => 'mock-google-jwt-token',
      };
      notify(user);
      return { user };
    },
    signInWithRedirect: async () => {
      state.googleRedirectCalls += 1;
    },
    getRedirectResult: async () => null,
    signOut: async () => {
      state.signOutCalls += 1;
      notify(null);
    },
  };
}

export function createFirebaseFirestoreMockModule() {
  return {
    getFirestore: () => ({}),
    collection: () => ({}),
    doc: () => ({}),
    query: () => ({}),
    where: () => ({}),
    orderBy: () => ({}),
    limit: () => ({}),
    getDoc: async () => ({ exists: () => false, data: () => undefined }),
    getDocs: async () => ({ docs: [] }),
    setDoc: async () => undefined,
    updateDoc: async () => undefined,
    runTransaction: async () => undefined,
    writeBatch: () => ({
      set: () => undefined,
      update: () => undefined,
      commit: async () => undefined,
    }),
  };
}

export function filterAllowedDepartments(
  issues: readonly CivicIssue[],
  department: Department,
): CivicIssue[] {
  return issues.filter((item) => item.assignedDepartment === department);
}

export function filterAllowedStatuses(
  issues: readonly CivicIssue[],
  status: IssueStatus,
): CivicIssue[] {
  return issues.filter((item) => item.status === status);
}
