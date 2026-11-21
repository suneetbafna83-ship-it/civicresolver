import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import {
  IssueCreateSchema,
  IssueUpdateSchema,
  StoredWebpDataUrlSchema,
} from '../../shared/schemas/issue.js';
import {
  TriageLocationInputSchema,
  TriageRequestSchema,
  TriageResponseSchema,
  TriageResultSchema,
} from '../../shared/schemas/triage.js';
import {
  AUTHENTICITY_STATUSES,
  DEPARTMENTS,
  ISSUE_CATEGORIES,
  ISSUE_STATUSES,
  MAX_STORED_WEBP_BYTES,
  MAX_STORED_WEBP_DATA_URL_LENGTH,
  PRIORITY_LEVELS,
  SUPPORTED_UPLOAD_IMAGE_MIMES,
  TRIAGE_ENGINES,
  TRIAGE_FALLBACK_REASONS,
  WEBP_DATA_URL_PREFIX,
  type TriageResult,
} from '../../shared/types/civic.js';
import {
  createSampleIssueInput,
  createSampleRawImageBase64,
  createSampleTriageResult,
  createSampleWebpDataUrl,
  isRecord,
  listWorkspaceFiles,
  readWorkspaceTextFile,
} from './helpers/e2eHarness.js';

interface PackageJsonShape {
  type?: string;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

interface TsConfigShape {
  compilerOptions?: Record<string, unknown>;
  include?: string[];
}

interface FirebaseJsonShape {
  firestore?: {
    rules?: string;
    indexes?: string;
  };
  storage?: unknown;
  functions?: unknown;
}

interface VercelJsonShape {
  functions?: Record<string, { maxDuration?: number }>;
  headers?: Array<{
    source: string;
    headers: Array<{ key: string; value: string }>;
  }>;
}

function findAnyKeywordsInSourceFile(sourceFile: ts.SourceFile): number[] {
  const lines: number[] = [];
  const visit = (node: ts.Node): void => {
    if (node.kind === ts.SyntaxKind.AnyKeyword) {
      const pos = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
      lines.push(pos.line + 1);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return lines;
}

describe('Tier 1 — F1: Project & Strict TypeScript Setup', () => {
  it('T1-F1-01: package.json uses ESM and has zero Blaze dependencies', () => {
    const raw = readFileSync('package.json', 'utf8');
    const pkg = JSON.parse(raw) as PackageJsonShape;

    expect(pkg.type).toBe('module');

    const allDeps = new Set([
      ...Object.keys(pkg.dependencies ?? {}),
      ...Object.keys(pkg.devDependencies ?? {}),
    ]);
    const forbiddenBlazeDeps = [
      'firebase-functions',
      'firebase-admin',
      '@google-cloud/storage',
      '@firebase/storage',
      '@firebase/functions',
    ];
    for (const dep of forbiddenBlazeDeps) {
      expect(allDeps.has(dep)).toBe(false);
    }
    expect(allDeps.has('@google/genai')).toBe(true);
    expect(allDeps.has('firebase')).toBe(true);
    expect(allDeps.has('zod')).toBe(true);
  });

  it('T1-F1-02: tsconfig.json enables strict, noImplicitAny, and noUncheckedIndexedAccess', () => {
    const raw = readFileSync('tsconfig.json', 'utf8');
    const tsconfig = JSON.parse(raw) as TsConfigShape;
    const opts = tsconfig.compilerOptions ?? {};

    expect(Reflect.get(opts, 'strict')).toBe(true);
    expect(Reflect.get(opts, 'noImplicitAny')).toBe(true);
    expect(Reflect.get(opts, 'noUncheckedIndexedAccess')).toBe(true);
    expect(Reflect.get(opts, 'strictNullChecks')).toBe(true);
    expect(Reflect.get(opts, 'noEmit')).toBe(true);
    expect(tsconfig.include).toContain('tests/**/*.ts');
    expect(tsconfig.include).toContain('shared/**/*.ts');
  });

  it('T1-F1-03: firebase.json and .firebaserc configure Spark Firestore only for civic-sense-43d74', () => {
    const firebaseJson = JSON.parse(
      readFileSync('firebase.json', 'utf8'),
    ) as FirebaseJsonShape;
    const firebaserc = JSON.parse(readFileSync('.firebaserc', 'utf8')) as {
      projects?: { default?: string };
    };

    expect(firebaserc.projects?.default).toBe('civic-sense-43d74');
    expect(firebaseJson.firestore?.rules).toBe('firestore.rules');
    expect(firebaseJson.firestore?.indexes).toBe('firestore.indexes.json');
    expect('storage' in firebaseJson).toBe(false);
    expect('functions' in firebaseJson).toBe(false);
  });

  it('T1-F1-04: vercel.json configures /api/* functions and security headers', () => {
    const vercelJson = JSON.parse(
      readFileSync('vercel.json', 'utf8'),
    ) as VercelJsonShape;

    const apiFnConfig = vercelJson.functions
      ? Reflect.get(vercelJson.functions, 'api/*.ts')
      : undefined;
    expect(isRecord(apiFnConfig)).toBe(true);
    expect(
      isRecord(apiFnConfig) ? Reflect.get(apiFnConfig, 'maxDuration') : undefined,
    ).toBeGreaterThan(0);

    const apiHeaderRule = (vercelJson.headers ?? []).find((entry) =>
      entry.source.startsWith('/api/'),
    );
    expect(apiHeaderRule).toBeDefined();

    const headerMap = new Map<string, string>();
    for (const h of apiHeaderRule?.headers ?? []) {
      headerMap.set(h.key.toLowerCase(), h.value);
    }

    expect(headerMap.get('x-content-type-options')).toBe('nosniff');
    expect(headerMap.get('x-frame-options')).toBe('DENY');
    expect(headerMap.get('referrer-policy')).toBe(
      'strict-origin-when-cross-origin',
    );
    expect(headerMap.get('permissions-policy')).toBeDefined();
    expect(headerMap.get('cache-control')).toBe('no-store');
  });

  it('T1-F1-05: .env.example and .gitignore enforce server-only GEMINI_API_KEY hygiene', () => {
    const envExample = readFileSync('.env.example', 'utf8');
    const gitignore = readFileSync('.gitignore', 'utf8');

    expect(envExample).toMatch(/^GEMINI_API_KEY=\s*$/m);
    expect(envExample).not.toMatch(/VITE_GEMINI/i);

    const gitignoreLines = gitignore
      .split(/\r?\n/)
      .map((line) => line.trim());
    expect(gitignoreLines).toContain('.env');
    expect(gitignoreLines).toContain('.env.*');
    expect(gitignoreLines).toContain('!.env.example');
    expect(gitignoreLines).toContain('node_modules/');
    expect(gitignoreLines).toContain('dist/');
  });
});

describe('Tier 1 — F2: Shared Types & Zod Contracts', () => {
  it('T1-F2-01: TriageRequestSchema accepts minimal text-only and multimodal payloads', () => {
    const minimal = TriageRequestSchema.safeParse({
      title: 'Deep pothole near school gate',
      description:
        'Large pothole filling with rainwater and forcing cyclists into oncoming traffic.',
    });
    expect(minimal.success).toBe(true);

    const multimodal = TriageRequestSchema.safeParse({
      title: 'Exposed electrical cable on streetlight pole',
      description:
        'Live wire dangling from pole #14 near pedestrian crossing after storm.',
      imageBase64: createSampleWebpDataUrl(512),
      imageMimeType: 'image/webp',
      location: {
        lat: 12.9716,
        lng: 77.5946,
        address: 'MG Road Junction',
      },
      nearbyIssues: [
        {
          id: 'issue-nearby-1',
          title: 'Flickering pole lamp',
          description: 'Pole #14 has been sparking intermittently at dusk.',
          category: 'Streetlight & Electrical',
          lat: 12.9717,
          lng: 77.5947,
          status: 'Reported',
        },
      ],
    });
    expect(multimodal.success).toBe(true);

    const rawPng = TriageRequestSchema.safeParse({
      title: 'Overflowing public trash bin',
      description: 'Garbage bags piling onto sidewalk outside community clinic.',
      imageBase64: createSampleRawImageBase64('image/png', 256),
      imageMimeType: 'image/png',
    });
    expect(rawPng.success).toBe(true);
  });

  it('T1-F2-02: TriageResponseSchema validates all departments, priorities, categories, and metadata', () => {
    for (const department of DEPARTMENTS) {
      for (const priority of PRIORITY_LEVELS) {
        const sample: TriageResult = createSampleTriageResult({
          recommendedDepartment: department,
          priorityLevel: priority,
          urgencyScore: priority === 'Critical' ? 10 : priority === 'High' ? 8 : priority === 'Medium' ? 5 : 2,
        });
        const response = TriageResponseSchema.safeParse({
          triage: sample,
          metadata: {
            engine: 'gemini',
            model: 'gemini-2.5-flash',
            cacheHit: false,
            cacheKey: 'a'.repeat(64),
            latencyMs: 142,
            timestamp: '2026-11-21T06:00:00.000Z',
          },
        });
        expect(response.success).toBe(true);
      }
    }

    for (const category of ISSUE_CATEGORIES) {
      for (const authStatus of AUTHENTICITY_STATUSES) {
        const fallbackResp = TriageResponseSchema.safeParse({
          triage: createSampleTriageResult({
            category,
            authenticityCheck: {
              isAuthentic: authStatus !== 'flagged_mismatch',
              status: authStatus,
              confidence: 0.75,
              reason: 'Evaluated civic submission consistency.',
            },
          }),
          metadata: {
            engine: 'nlp-fallback',
            model: 'civic-nlp-v1',
            cacheHit: false,
            cacheKey: 'b'.repeat(64),
            fallbackReason: 'missing_api_key',
            latencyMs: 4,
            timestamp: '2026-11-21T06:00:00.000Z',
          },
        });
        expect(fallbackResp.success).toBe(true);
      }
    }
  });

  it('T1-F2-03: IssueCreateSchema validates WebP data URL, null imageDataUrl, and location', () => {
    const withWebp = IssueCreateSchema.safeParse(createSampleIssueInput());
    expect(withWebp.success).toBe(true);

    const withNullImage = IssueCreateSchema.safeParse(
      createSampleIssueInput({ imageDataUrl: null }),
    );
    expect(withNullImage.success).toBe(true);

    const omittedImageInput = createSampleIssueInput();
    delete omittedImageInput.imageDataUrl;
    expect(IssueCreateSchema.safeParse(omittedImageInput).success).toBe(true);
  });

  it('T1-F2-04: IssueUpdateSchema validates admin status, department, and resolutionNotes updates', () => {
    expect(IssueUpdateSchema.safeParse({ status: 'Reported' }).success).toBe(
      true,
    );
    expect(IssueUpdateSchema.safeParse({ status: 'In Progress' }).success).toBe(
      true,
    );
    expect(
      IssueUpdateSchema.safeParse({
        status: 'Resolved',
        assignedDepartment: 'Roads & Infrastructure',
        resolutionNotes: 'Patched pothole with hot-mix asphalt.',
      }).success,
    ).toBe(true);
    expect(
      IssueUpdateSchema.safeParse({ resolutionNotes: null }).success,
    ).toBe(true);
  });

  it('T1-F2-05: Canonical union arrays match PROJECT.md specification exactly', () => {
    expect(DEPARTMENTS).toEqual([
      'Roads & Infrastructure',
      'Sanitation & Waste',
      'Electrical & Streetlights',
      'Water & Sewage',
      'Public Safety',
    ]);
    expect(PRIORITY_LEVELS).toEqual(['Low', 'Medium', 'High', 'Critical']);
    expect(ISSUE_STATUSES).toEqual(['Reported', 'In Progress', 'Resolved']);
    expect(ISSUE_CATEGORIES).toEqual([
      'Pothole & Road Damage',
      'Garbage & Illegal Dumping',
      'Streetlight & Electrical',
      'Water Leak & Sewage',
      'Traffic & Public Safety',
      'Other Civic Issue',
    ]);
    expect(TRIAGE_FALLBACK_REASONS).toEqual([
      'missing_api_key',
      'rate_limited',
      'quota_exceeded',
      'model_unavailable',
      'auth_error',
      'timeout',
      'invalid_response',
      'upstream_error',
    ]);
    expect(TRIAGE_ENGINES).toEqual(['gemini', 'nlp-fallback']);
    expect(SUPPORTED_UPLOAD_IMAGE_MIMES).toEqual([
      'image/webp',
      'image/jpeg',
      'image/png',
    ]);
  });
});

describe('Tier 2 — F1: Configuration & Repo Static Boundaries', () => {
  it('T2-F1-01: Strict tsc --noEmit across repo compiles with zero errors and zero explicit any', () => {
    const configFile = ts.readConfigFile('tsconfig.json', ts.sys.readFile);
    expect(configFile.error).toBeUndefined();

    const parsed = ts.parseJsonConfigFileContent(
      configFile.config,
      ts.sys,
      process.cwd(),
    );
    expect(parsed.errors).toHaveLength(0);

    const program = ts.createProgram({
      rootNames: parsed.fileNames,
      options: parsed.options,
    });
    const diagnostics = ts.getPreEmitDiagnostics(program);
    const formatted = diagnostics.map((diag) =>
      ts.flattenDiagnosticMessageText(diag.messageText, '\n'),
    );
    expect(formatted).toEqual([]);

    const anyViolations: Array<{ file: string; lines: number[] }> = [];
    for (const sourceFile of program.getSourceFiles()) {
      if (
        sourceFile.isDeclarationFile ||
        sourceFile.fileName.includes('node_modules')
      ) {
        continue;
      }
      const lines = findAnyKeywordsInSourceFile(sourceFile);
      if (lines.length > 0) {
        anyViolations.push({ file: sourceFile.fileName, lines });
      }
    }
    expect(anyViolations).toEqual([]);
  });

  it('T2-F1-02: Static scan confirms zero Blaze packages or imports in workspace', () => {
    const files = listWorkspaceFiles(['ts', 'tsx', 'mts', 'mjs', 'json']);
    const blazePatterns = [
      /from\s+['"]firebase\/(?:storage|functions)['"]/,
      /from\s+['"]@google-cloud\/storage['"]/,
      /from\s+['"]firebase-functions['"]/,
      /from\s+['"]firebase-admin(?:\/storage)?['"]/,
      /"(?:firebase-functions|@google-cloud\/storage|firebase-admin\/storage)"\s*:/,
    ];

    const hits: string[] = [];
    for (const filePath of files) {
      if (filePath.endsWith('package-lock.json')) {
        continue;
      }
      const text = readWorkspaceTextFile(filePath);
      for (const pattern of blazePatterns) {
        if (pattern.test(text)) {
          hits.push(`${filePath}: matched ${pattern.source}`);
        }
      }
    }
    expect(hits).toEqual([]);
  });

  it('T2-F1-03: .env.example contains zero live credentials or secret key prefixes', () => {
    const envExample = readFileSync('.env.example', 'utf8');
    expect(envExample).toMatch(/^GEMINI_API_KEY=\s*$/m);
    expect(envExample).toMatch(/^VITE_FIREBASE_API_KEY=\s*$/m);
    expect(envExample).not.toMatch(/AIza[0-9A-Za-z_-]{10,}/);
    expect(envExample).not.toMatch(/\bsk-[A-Za-z0-9]{10,}/);
    expect(envExample).not.toMatch(/\bghp_[A-Za-z0-9]{10,}/);
  });

  it('T2-F1-04: eslint.config.mjs enforces @typescript-eslint/no-explicit-any and eslint-plugin-security', () => {
    const eslintConfig = readFileSync('eslint.config.mjs', 'utf8');
    expect(eslintConfig).toContain('eslint-plugin-security');
    expect(eslintConfig).toContain('typescript-eslint');
    expect(eslintConfig).toContain('pluginSecurity.configs.recommended');
    expect(eslintConfig).toContain("'@typescript-eslint/no-explicit-any': 'error'");
  });

  it('T2-F1-05: package.json scripts fail fast without || true or swallowed exit codes', () => {
    const pkg = JSON.parse(
      readFileSync('package.json', 'utf8'),
    ) as PackageJsonShape;
    const scripts = pkg.scripts ?? {};
    const requiredScripts = [
      'dev:api',
      'start:api',
      'typecheck',
      'lint',
      'test',
      'test:e2e',
      'build',
    ];
    for (const name of requiredScripts) {
      const cmd = Reflect.get(scripts, name);
      expect(typeof cmd).toBe('string');
      expect((cmd as string).trim().length).toBeGreaterThan(0);
    }
    for (const [name, cmd] of Object.entries(scripts)) {
      expect(cmd, `Script ${name} must not swallow exit codes`).not.toMatch(
        /\|\|\s*true\b|;\s*true\b|2>\/dev\/null/,
      );
    }
  });
});

describe('Tier 2 — F2: Schema Boundary & Corner Cases', () => {
  it('T2-F2-01: TriageRequestSchema rejects empty/whitespace text, XSS, and disallowed MIME types', () => {
    const b64 = createSampleRawImageBase64('image/webp', 128);

    expect(
      TriageRequestSchema.safeParse({
        title: '',
        description: 'Valid description for pothole issue.',
      }).success,
    ).toBe(false);
    expect(
      TriageRequestSchema.safeParse({
        title: '     ',
        description: 'Valid description for pothole issue.',
      }).success,
    ).toBe(false);
    expect(
      TriageRequestSchema.safeParse({
        title: '  ab  ',
        description: 'Valid description for pothole issue.',
      }).success,
    ).toBe(false);
    expect(
      TriageRequestSchema.safeParse({
        title: '<script>alert(1)</script> Pothole',
        description: 'Valid description for pothole issue.',
      }).success,
    ).toBe(false);
    expect(
      TriageRequestSchema.safeParse({
        title: 'Valid pothole title',
        description: 'Valid description for pothole issue.',
        imageBase64: `data:image/svg+xml;base64,${b64}`,
      }).success,
    ).toBe(false);
    expect(
      TriageRequestSchema.safeParse({
        title: 'Valid pothole title',
        description: 'Valid description for pothole issue.',
        imageBase64: `data:application/pdf;base64,${b64}`,
      }).success,
    ).toBe(false);
    expect(
      TriageRequestSchema.safeParse({
        title: 'Valid pothole title',
        description: 'Valid description for pothole issue.',
        imageBase64: b64,
      }).success,
    ).toBe(false);
    expect(
      TriageRequestSchema.safeParse({
        title: 'Valid pothole title',
        description: 'Valid description for pothole issue.',
        imageBase64: `data:image/webp;base64,${b64}`,
        imageMimeType: 'image/png',
      }).success,
    ).toBe(false);
  });

  it('T2-F2-02: TriageResultSchema rejects out-of-range urgencyScore, confidence, similarity, and SLA', () => {
    const valid = createSampleTriageResult();
    expect(TriageResultSchema.safeParse(valid).success).toBe(true);

    for (const badUrgency of [0, 11, -1, 5.5]) {
      expect(
        TriageResultSchema.safeParse({ ...valid, urgencyScore: badUrgency })
          .success,
      ).toBe(false);
    }

    for (const badConfidence of [-0.01, 1.5, Number.NaN]) {
      expect(
        TriageResultSchema.safeParse({
          ...valid,
          authenticityCheck: {
            ...valid.authenticityCheck,
            confidence: badConfidence,
          },
        }).success,
      ).toBe(false);
    }

    for (const badSimilarity of [-0.1, 1.01]) {
      expect(
        TriageResultSchema.safeParse({
          ...valid,
          duplicateDetection: {
            ...valid.duplicateDetection,
            highestSimilarity: badSimilarity,
          },
        }).success,
      ).toBe(false);
    }

    for (const badSla of [0, -2, 721, Number.POSITIVE_INFINITY]) {
      expect(
        TriageResultSchema.safeParse({ ...valid, slaEstimateHours: badSla })
          .success,
      ).toBe(false);
    }
  });

  it('T2-F2-03: StoredWebpDataUrlSchema enforces exact 120 KB (122880 B) / 165000 char boundary and WebP-only prefix', () => {
    const maxValidWebp = createSampleWebpDataUrl(MAX_STORED_WEBP_BYTES);
    expect(maxValidWebp.length).toBe(163_863);
    expect(StoredWebpDataUrlSchema.safeParse(maxValidWebp).success).toBe(true);
    expect(
      IssueCreateSchema.safeParse(
        createSampleIssueInput({ imageDataUrl: maxValidWebp }),
      ).success,
    ).toBe(true);

    const overByteLimit = createSampleWebpDataUrl(MAX_STORED_WEBP_BYTES + 1);
    expect(StoredWebpDataUrlSchema.safeParse(overByteLimit).success).toBe(
      false,
    );

    const overCharLimit = `${WEBP_DATA_URL_PREFIX}${'A'.repeat(
      MAX_STORED_WEBP_DATA_URL_LENGTH + 1 - WEBP_DATA_URL_PREFIX.length,
    )}`;
    expect(overCharLimit.length).toBe(MAX_STORED_WEBP_DATA_URL_LENGTH + 1);
    expect(StoredWebpDataUrlSchema.safeParse(overCharLimit).success).toBe(
      false,
    );

    const nonWebpSamples = [
      `data:image/png;base64,${createSampleRawImageBase64('image/png', 128)}`,
      `data:image/jpeg;base64,${createSampleRawImageBase64('image/jpeg', 128)}`,
      `data:image/svg+xml;base64,${Buffer.from('<svg/>').toString('base64')}`,
      'https://example.com/photo.webp',
      WEBP_DATA_URL_PREFIX,
    ];
    for (const invalidUrl of nonWebpSamples) {
      expect(StoredWebpDataUrlSchema.safeParse(invalidUrl).success).toBe(false);
    }
  });

  it('T2-F2-04: Coordinate schemas accept [-90, 90] x [-180, 180] and reject out-of-range coordinates', () => {
    expect(
      TriageLocationInputSchema.safeParse({ lat: -90, lng: -180 }).success,
    ).toBe(true);
    expect(
      TriageLocationInputSchema.safeParse({ lat: 90, lng: 180 }).success,
    ).toBe(true);

    const invalidCoords = [
      { lat: 91, lng: 0 },
      { lat: -91, lng: 0 },
      { lat: 0, lng: 181 },
      { lat: 0, lng: -181 },
      { lat: Number.NaN, lng: 0 },
      { lat: 0, lng: Number.POSITIVE_INFINITY },
    ];
    for (const coord of invalidCoords) {
      expect(TriageLocationInputSchema.safeParse(coord).success).toBe(false);
    }
  });

  it('T2-F2-05: IssueUpdateSchema rejects invalid status/department, empty updates, and XSS notes', () => {
    expect(IssueUpdateSchema.safeParse({ status: 'Deleted' }).success).toBe(
      false,
    );
    expect(
      IssueUpdateSchema.safeParse({ assignedDepartment: 'Parks & Recreation' })
        .success,
    ).toBe(false);
    expect(IssueUpdateSchema.safeParse({}).success).toBe(false);
    expect(
      IssueUpdateSchema.safeParse({ unknownField: 'ignored' }).success,
    ).toBe(false);
    expect(
      IssueUpdateSchema.safeParse({
        resolutionNotes: '<script>alert(1)</script>',
      }).success,
    ).toBe(false);
  });
});
