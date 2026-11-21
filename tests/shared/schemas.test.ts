import { describe, expect, expectTypeOf, it } from 'vitest';
import type { z } from 'zod';
import {
  CivicIssueSchema,
  IssueCreateSchema,
  IssueFilterSchema,
  IssueUpdateSchema,
  StoredWebpDataUrlSchema,
  validateStoredWebpDataUrl,
} from '../../shared/schemas/issue.js';
import {
  IsoDatetimeSchema,
  TriageRequestSchema,
  TriageResponseSchema,
  TriageResultSchema,
  getBase64DecodedByteLength,
  hasDisallowedControlChars,
  hasUnsafeXssPattern,
  safeCivicText,
} from '../../shared/schemas/triage.js';
import {
  MAX_ISSUES_LIMIT,
  MAX_NEARBY_ISSUES_CONTEXT,
  MAX_RAW_UPLOAD_IMAGE_BYTES,
  MAX_STORED_WEBP_BYTES,
  MAX_STORED_WEBP_DATA_URL_LENGTH,
  WEBP_DATA_URL_PREFIX,
  type CivicIssue,
  type IssueAdminUpdateInput,
  type IssueCreateInput,
  type IssueFilterOptions,
  type TriageRequest,
  type TriageResponse,
  type TriageResult,
} from '../../shared/types/civic.js';

function makeValidTriageResult(): TriageResult {
  return {
    category: 'Streetlight & Electrical',
    urgencyScore: 8,
    priorityLevel: 'High',
    recommendedDepartment: 'Electrical & Streetlights',
    slaEstimateHours: 12,
    slaEstimateText: 'Within 12 hours',
    authenticityCheck: {
      isAuthentic: true,
      status: 'likely_authentic',
      confidence: 0.92,
      reason: 'Description and location context match a plausible civic lighting outage.',
    },
    duplicateDetection: {
      isLikelyDuplicate: false,
      matchedIssueIds: [],
      highestSimilarity: 0.14,
      reason: 'No matching active streetlight issues found nearby.',
    },
    summary: 'Outage on 5th Ave crossing reduces pedestrian visibility at night.',
    reasoning: 'High pedestrian traffic intersection with dark crossing warrants High priority.',
  };
}

function makeValidCreateInput(): IssueCreateInput {
  return {
    title: 'Broken streetlight & crossing at 5th Ave',
    description:
      'Lamp #14 at O\'Connor & Main "flickers" nightly; visibility < 2m.\nNeeds urgent inspection.',
    category: 'Streetlight & Electrical',
    location: {
      lat: 37.7749,
      lng: -122.4194,
      address: '5th Ave & Main St, District 3',
    },
    priorityLevel: 'High',
    urgencyScore: 8,
    recommendedDepartment: 'Electrical & Streetlights',
    assignedDepartment: 'Electrical & Streetlights',
    slaEstimateHours: 12,
    slaSummary: 'Within 12 hours',
    triageMeta: {
      engine: 'gemini',
      model: 'gemini-2.5-flash',
      cacheHit: false,
      authenticityStatus: 'likely_authentic',
      authenticityReason: 'Consistent civic report metadata.',
      potentialDuplicateIds: [],
      highestSimilarity: 0.1,
    },
    imageDataUrl: null,
  };
}

describe('Shared Contract Type Assignability', () => {
  it('ensures Zod inferred types align cleanly with TypeScript interfaces', () => {
    expectTypeOf<z.infer<typeof TriageRequestSchema>>().toExtend<TriageRequest>();
    expectTypeOf<TriageRequest>().toExtend<z.infer<typeof TriageRequestSchema>>();

    expectTypeOf<z.infer<typeof TriageResultSchema>>().toExtend<TriageResult>();
    expectTypeOf<TriageResult>().toExtend<z.infer<typeof TriageResultSchema>>();

    expectTypeOf<z.infer<typeof TriageResponseSchema>>().toExtend<TriageResponse>();
    expectTypeOf<TriageResponse>().toExtend<z.infer<typeof TriageResponseSchema>>();

    expectTypeOf<z.infer<typeof IssueCreateSchema>>().toExtend<IssueCreateInput>();
    expectTypeOf<IssueCreateInput>().toExtend<z.infer<typeof IssueCreateSchema>>();

    expectTypeOf<z.infer<typeof IssueUpdateSchema>>().toExtend<IssueAdminUpdateInput>();
    expectTypeOf<IssueAdminUpdateInput>().toExtend<z.infer<typeof IssueUpdateSchema>>();

    expectTypeOf<z.infer<typeof IssueFilterSchema>>().toExtend<IssueFilterOptions>();
    expectTypeOf<IssueFilterOptions>().toExtend<z.infer<typeof IssueFilterSchema>>();

    expectTypeOf<z.infer<typeof CivicIssueSchema>>().toExtend<CivicIssue>();
    expectTypeOf<CivicIssue>().toExtend<z.infer<typeof CivicIssueSchema>>();
  });
});

describe('TriageRequestSchema', () => {
  it('accepts valid minimal report with normal civic punctuation and newlines', () => {
    const result = TriageRequestSchema.safeParse({
      title: 'Broken streetlight & crossing at 5th Ave',
      description:
        'Lamp #14 at O\'Connor & Main "flickers" nightly; visibility < 2m.\nNeeds urgent inspection.\tPriority 100% needed (24/7).',
    });
    expect(result.success).toBe(true);
  });

  it('rejects whitespace-only or too-short trimmed strings', () => {
    expect(
      TriageRequestSchema.safeParse({
        title: '     ',
        description: 'Valid description with more than ten characters.',
      }).success,
    ).toBe(false);

    expect(
      TriageRequestSchema.safeParse({
        title: '  ab  ',
        description: 'Valid description with more than ten characters.',
      }).success,
    ).toBe(false);

    expect(
      TriageRequestSchema.safeParse({
        title: 'Valid title',
        description: '  short  ',
      }).success,
    ).toBe(false);
  });

  it('enforces exact title (120) and description (2000) max lengths', () => {
    expect(
      TriageRequestSchema.safeParse({
        title: 'A'.repeat(120),
        description: 'B'.repeat(2000),
      }).success,
    ).toBe(true);

    expect(
      TriageRequestSchema.safeParse({
        title: 'A'.repeat(121),
        description: 'B'.repeat(2000),
      }).success,
    ).toBe(false);

    expect(
      TriageRequestSchema.safeParse({
        title: 'A'.repeat(120),
        description: 'B'.repeat(2001),
      }).success,
    ).toBe(false);
  });

  it('rejects disallowed control characters while permitting \\n, \\r, and \\t', () => {
    expect(hasDisallowedControlChars('Line 1\nLine 2\r\n\tIndented')).toBe(false);

    const badChars = ['\x00', '\x07', '\x0B', '\x0C', '\x1B', '\x7F'];
    for (const ch of badChars) {
      expect(hasDisallowedControlChars(`test${ch}text`)).toBe(true);

      expect(
        TriageRequestSchema.safeParse({
          title: `Bad title ${ch} here`,
          description: 'Valid description text over ten chars.',
        }).success,
      ).toBe(false);

      expect(
        TriageRequestSchema.safeParse({
          title: 'Valid civic issue title',
          description: `Description with control char ${ch} inside`,
        }).success,
      ).toBe(false);

      expect(
        TriageRequestSchema.safeParse({
          title: 'Valid civic issue title',
          description: 'Valid description text over ten chars.',
          location: { lat: 10, lng: 20, address: `123 Main${ch}St` },
        }).success,
      ).toBe(false);
    }
  });

  it('rejects XSS vectors including generic handlers, obfuscated URIs, and unsafe data URIs', () => {
    const xssPayloads = [
      '<script>alert(1)</script>',
      '<ScRiPt src="evil.js">',
      '<iframe src="https://evil.example">',
      '<svg onload=alert(1)>',
      '<img src=x onerror=alert(1)>',
      '<img src=x onpointerover=alert(1)>',
      '<img src=x onmouseenter=alert(1)>',
      '<marquee onstart=alert(1)>hi</marquee>',
      '<body onpageshow=alert(1)>',
      '<input autofocus onfocusin=alert(1)>',
      '<video onloadeddata=alert(1)>',
      'Click javascript:alert(1) now',
      'Click java\tscript:alert(1) now',
      'Click j&#x61;vascript:alert(1) now',
      'Click javascript&#58;alert(1) now',
      'Click java&Tab;script:alert(1) now',
      'Click vbscript:msgbox(1) now',
      'Click vb&#x73;cript:msgbox(1) now',
      'Open data:text/html,<p>xss</p>',
      'Open data:image/svg+xml;base64,PHN2ZyBvbmxvYWQ9YWxlcnQoMSk+',
      'Open data:application/xhtml+xml,<html>xss</html>',
      '<a href="j&#x61;vascript:alert(1)">click</a>',
      '&#000000106;avascript:alert(1)',
      'j&#000000097;vascript:alert(1)',
      'javascript&#000000058;alert(1)',
      '&#x00000006a;avascript:alert(1)',
      '&#000000060;script>alert(1)',
      '&#x00000003c;iframe src=evil>',
      'on&#000000101;rror=alert(1)',
      'oncontentvisibilityautostatechange=alert(1)',
      'onerror&equals;alert(1)',
      '&#55296;javascript:alert(1)',
    ];

    for (const vector of xssPayloads) {
      expect(hasUnsafeXssPattern(vector)).toBe(true);

      expect(
        TriageRequestSchema.safeParse({
          title: `Issue ${vector}`,
          description: 'Valid civic description with enough detail.',
        }).success,
      ).toBe(false);

      expect(
        TriageRequestSchema.safeParse({
          title: 'Valid civic issue title',
          description: `Details about problem: ${vector}`,
        }).success,
      ).toBe(false);

      expect(
        TriageRequestSchema.safeParse({
          title: 'Valid civic issue title',
          description: 'Valid civic description with enough detail.',
          location: { lat: 12.9, lng: 77.5, address: `Addr ${vector}` },
        }).success,
      ).toBe(false);
    }
  });

  it('preserves realistic civic descriptions containing measurements, counts, and spaced "on <word>=" text', () => {
    const realisticCivicTexts = [
      "Water leak < 2m from O'Brien & Sons' hydrant; pressure ~80%.",
      "Drainage pipe <5cm wide blocked near St. Mary's school.",
      '<3 kids almost fell into the uncovered storm drain!',
      'Transformer blew on load = 90% capacity at 5th & Main.',
      'Streetlight relay trips on error=E04 after heavy rain.',
      'Pump shuts down on input = high pressure during peak hours.',
      'Traffic signal stuck on change = manual override mode.',
      'Gate mechanism jams on toggle = open near City Park.',
      'Voltage drop on load=high at substation #4.',
      'Flood water > 50cm & < 1m deep at underpass; pH <7 measured.',
    ];

    const realisticCivicFragments = [
      '< 2m',
      '<5cm',
      '<3 kids',
      "O'Brien & Sons",
      'on error=E04',
      'on load = 90%',
      'water > 50cm & < 1m',
      'pH <7',
    ];

    for (const fragment of realisticCivicFragments) {
      expect(hasUnsafeXssPattern(fragment)).toBe(false);
    }

    for (const text of realisticCivicTexts) {
      expect(hasUnsafeXssPattern(text)).toBe(false);
      expect(
        TriageRequestSchema.safeParse({
          title: 'Valid civic issue title',
          description: text,
        }).success,
      ).toBe(true);
    }
  });

  it('handles extreme leading-zero numeric entities and surrogate entities without crashing or hanging', () => {
    const startMs = performance.now();
    expect(hasUnsafeXssPattern('&#' + '0'.repeat(10_000))).toBe(false);
    expect(hasUnsafeXssPattern('&#x' + '0'.repeat(10_000))).toBe(false);
    expect(hasUnsafeXssPattern('&#55296;')).toBe(false);
    expect(hasUnsafeXssPattern('&#x' + '0'.repeat(100_000))).toBe(false);
    expect(hasUnsafeXssPattern('&#' + '0'.repeat(100_000))).toBe(false);
    const elapsedMs = performance.now() - startMs;
    expect(elapsedMs).toBeLessThan(100);
  });

  it('rejects huge whitespace-padded payloads before trimming in safeCivicText and TriageRequestSchema.imageBase64', () => {
    const titleSchema = safeCivicText({ min: 5, max: 120, fieldName: 'title' });
    expect(titleSchema.safeParse(' '.repeat(1_000_000) + 'Valid').success).toBe(
      false,
    );
    expect(titleSchema.safeParse(' '.repeat(100_000) + 'Valid title').success).toBe(
      false,
    );
    expect(titleSchema.safeParse('  Valid title  ').success).toBe(true);

    expect(
      TriageRequestSchema.safeParse({
        title: 'Valid civic issue title',
        description: 'Valid description text over ten chars.',
        imageBase64: ' '.repeat(1_000_000) + 'AAAA',
        imageMimeType: 'image/webp',
      }).success,
    ).toBe(false);

    expect(
      TriageRequestSchema.safeParse({
        title: 'Valid civic issue title',
        description: 'Valid description text over ten chars.',
        imageBase64: ' '.repeat(65) + 'AAAA',
        imageMimeType: 'image/webp',
      }).success,
    ).toBe(false);

    expect(
      TriageRequestSchema.safeParse({
        title: 'Valid civic issue title',
        description: 'Valid description text over ten chars.',
        imageBase64: ' '.repeat(64) + 'AAAA',
        imageMimeType: 'image/webp',
      }).success,
    ).toBe(true);
  });

  it('validates coordinate boundaries and rejects non-finite values', () => {
    expect(
      TriageRequestSchema.safeParse({
        title: 'Boundary valid coordinates',
        description: 'Testing exact min and max coordinate bounds.',
        location: { lat: -90, lng: -180 },
      }).success,
    ).toBe(true);

    expect(
      TriageRequestSchema.safeParse({
        title: 'Boundary valid coordinates',
        description: 'Testing exact max coordinate bounds.',
        location: { lat: 90, lng: 180 },
      }).success,
    ).toBe(true);

    const invalidCoords = [
      { lat: 90.1, lng: 0 },
      { lat: -90.1, lng: 0 },
      { lat: 0, lng: 180.1 },
      { lat: 0, lng: -180.1 },
      { lat: Number.NaN, lng: 0 },
      { lat: 0, lng: Number.POSITIVE_INFINITY },
      { lat: Number.NEGATIVE_INFINITY, lng: 0 },
    ];

    for (const loc of invalidCoords) {
      expect(
        TriageRequestSchema.safeParse({
          title: 'Invalid coordinate test',
          description: 'Testing invalid coordinate rejection.',
          location: loc,
        }).success,
      ).toBe(false);
    }
  });

  it('validates image MIME types, data URIs, base64 structure, and matching imageMimeType', () => {
    const sampleBase64 = Buffer.from('fake-image-bytes').toString('base64');

    // Valid raw base64 + imageMimeType
    expect(
      TriageRequestSchema.safeParse({
        title: 'Pothole on Elm Street',
        description: 'Deep pothole near Elm and 4th intersection.',
        imageBase64: sampleBase64,
        imageMimeType: 'image/png',
      }).success,
    ).toBe(true);

    // Valid data URI without explicit imageMimeType
    expect(
      TriageRequestSchema.safeParse({
        title: 'Pothole on Elm Street',
        description: 'Deep pothole near Elm and 4th intersection.',
        imageBase64: `data:image/jpeg;base64,${sampleBase64}`,
      }).success,
    ).toBe(true);

    // Valid data URI with uppercase MIME and ;BASE64, marker
    expect(
      TriageRequestSchema.safeParse({
        title: 'Pothole on Elm Street',
        description: 'Deep pothole near Elm and 4th intersection.',
        imageBase64: `DATA:IMAGE/JPEG;BASE64,${sampleBase64}`,
      }).success,
    ).toBe(true);

    expect(
      TriageRequestSchema.safeParse({
        title: 'Pothole on Elm Street',
        description: 'Deep pothole near Elm and 4th intersection.',
        imageBase64: `data:image/webp;BASE64,${sampleBase64}`,
        imageMimeType: 'image/webp',
      }).success,
    ).toBe(true);

    // Valid data URI with matching imageMimeType
    expect(
      TriageRequestSchema.safeParse({
        title: 'Pothole on Elm Street',
        description: 'Deep pothole near Elm and 4th intersection.',
        imageBase64: `data:image/webp;base64,${sampleBase64}`,
        imageMimeType: 'image/webp',
      }).success,
    ).toBe(true);

    // Mismatched imageMimeType vs data URI
    expect(
      TriageRequestSchema.safeParse({
        title: 'Pothole on Elm Street',
        description: 'Deep pothole near Elm and 4th intersection.',
        imageBase64: `data:image/jpeg;base64,${sampleBase64}`,
        imageMimeType: 'image/png',
      }).success,
    ).toBe(false);

    // Unsupported MIME type (SVG)
    expect(
      TriageRequestSchema.safeParse({
        title: 'Pothole on Elm Street',
        description: 'Deep pothole near Elm and 4th intersection.',
        imageBase64: `data:image/svg+xml;base64,${sampleBase64}`,
      }).success,
    ).toBe(false);

    // Raw base64 missing imageMimeType
    expect(
      TriageRequestSchema.safeParse({
        title: 'Pothole on Elm Street',
        description: 'Deep pothole near Elm and 4th intersection.',
        imageBase64: sampleBase64,
      }).success,
    ).toBe(false);

    // Orphan imageMimeType without imageBase64
    expect(
      TriageRequestSchema.safeParse({
        title: 'Pothole on Elm Street',
        description: 'Deep pothole near Elm and 4th intersection.',
        imageMimeType: 'image/png',
      }).success,
    ).toBe(false);

    // Malformed base64
    expect(
      TriageRequestSchema.safeParse({
        title: 'Pothole on Elm Street',
        description: 'Deep pothole near Elm and 4th intersection.',
        imageBase64: 'not!valid!base64',
        imageMimeType: 'image/webp',
      }).success,
    ).toBe(false);
  });

  it('enforces exact 5 MB upload byte boundary', () => {
    const exactMaxBase64 = Buffer.alloc(MAX_RAW_UPLOAD_IMAGE_BYTES, 0x41).toString(
      'base64',
    );
    expect(getBase64DecodedByteLength(exactMaxBase64)).toBe(
      MAX_RAW_UPLOAD_IMAGE_BYTES,
    );

    expect(
      TriageRequestSchema.safeParse({
        title: 'Exact 5MB upload test',
        description: 'Testing exact maximum raw upload image byte limit.',
        imageBase64: exactMaxBase64,
        imageMimeType: 'image/jpeg',
      }).success,
    ).toBe(true);

    const overMaxBase64 = Buffer.alloc(
      MAX_RAW_UPLOAD_IMAGE_BYTES + 1,
      0x41,
    ).toString('base64');
    expect(
      TriageRequestSchema.safeParse({
        title: 'Over 5MB upload test',
        description: 'Testing 1 byte over raw upload image limit.',
        imageBase64: overMaxBase64,
        imageMimeType: 'image/jpeg',
      }).success,
    ).toBe(false);
  });

  it('enforces nearbyIssues max count of 50', () => {
    const makeNearby = (count: number) =>
      Array.from({ length: count }, (_, idx) => ({
        id: `issue-${idx}`,
        title: `Nearby issue #${idx}`,
        description: 'Nearby civic issue description for duplicate matching.',
        lat: 37.77 + idx * 0.0001,
        lng: -122.41,
      }));

    expect(
      TriageRequestSchema.safeParse({
        title: 'Nearby cap exact 50',
        description: 'Testing maximum nearby issues array length.',
        nearbyIssues: makeNearby(MAX_NEARBY_ISSUES_CONTEXT),
      }).success,
    ).toBe(true);

    expect(
      TriageRequestSchema.safeParse({
        title: 'Nearby cap 51 rejected',
        description: 'Testing rejection when nearbyIssues exceeds 50.',
        nearbyIssues: makeNearby(MAX_NEARBY_ISSUES_CONTEXT + 1),
      }).success,
    ).toBe(false);
  });
});

describe('TriageResultSchema and TriageResponseSchema', () => {
  it('enforces urgencyScore, confidence, similarity, and slaEstimateHours bounds', () => {
    const base = makeValidTriageResult();
    expect(TriageResultSchema.safeParse(base).success).toBe(true);

    // urgencyScore 1 and 10 pass; 0, 11, 5.5 fail
    expect(
      TriageResultSchema.safeParse({ ...base, urgencyScore: 1 }).success,
    ).toBe(true);
    expect(
      TriageResultSchema.safeParse({ ...base, urgencyScore: 10 }).success,
    ).toBe(true);
    expect(
      TriageResultSchema.safeParse({ ...base, urgencyScore: 0 }).success,
    ).toBe(false);
    expect(
      TriageResultSchema.safeParse({ ...base, urgencyScore: 11 }).success,
    ).toBe(false);
    expect(
      TriageResultSchema.safeParse({ ...base, urgencyScore: 5.5 }).success,
    ).toBe(false);

    // confidence & highestSimilarity bounds [0, 1]
    expect(
      TriageResultSchema.safeParse({
        ...base,
        authenticityCheck: { ...base.authenticityCheck, confidence: 0 },
        duplicateDetection: { ...base.duplicateDetection, highestSimilarity: 1 },
      }).success,
    ).toBe(true);
    expect(
      TriageResultSchema.safeParse({
        ...base,
        authenticityCheck: { ...base.authenticityCheck, confidence: -0.01 },
      }).success,
    ).toBe(false);
    expect(
      TriageResultSchema.safeParse({
        ...base,
        duplicateDetection: { ...base.duplicateDetection, highestSimilarity: 1.01 },
      }).success,
    ).toBe(false);

    // slaEstimateHours bounds (0, 720]
    expect(
      TriageResultSchema.safeParse({ ...base, slaEstimateHours: 0.5 }).success,
    ).toBe(true);
    expect(
      TriageResultSchema.safeParse({ ...base, slaEstimateHours: 720 }).success,
    ).toBe(true);
    expect(
      TriageResultSchema.safeParse({ ...base, slaEstimateHours: 0 }).success,
    ).toBe(false);
    expect(
      TriageResultSchema.safeParse({ ...base, slaEstimateHours: -1 }).success,
    ).toBe(false);
    expect(
      TriageResultSchema.safeParse({ ...base, slaEstimateHours: 721 }).success,
    ).toBe(false);
    expect(
      TriageResultSchema.safeParse({
        ...base,
        slaEstimateHours: Number.POSITIVE_INFINITY,
      }).success,
    ).toBe(false);
  });

  it('validates TriageResponse engines and ISO-8601 timestamps', () => {
    const triage = makeValidTriageResult();

    expect(
      TriageResponseSchema.safeParse({
        triage,
        metadata: {
          engine: 'gemini',
          model: 'gemini-2.5-flash',
          cacheHit: false,
          cacheKey: 'sha256:abc123',
          latencyMs: 310,
          timestamp: '2026-11-21T05:48:00.000Z',
        },
      }).success,
    ).toBe(true);

    expect(
      TriageResponseSchema.safeParse({
        triage,
        metadata: {
          engine: 'nlp-fallback',
          model: 'deterministic-civic-nlp-v1',
          cacheHit: false,
          cacheKey: 'sha256:def456',
          fallbackReason: 'rate_limited',
          latencyMs: 4,
          timestamp: '2026-11-21T05:48:00+05:30',
        },
      }).success,
    ).toBe(true);

    expect(
      TriageResponseSchema.safeParse({
        triage,
        metadata: {
          engine: 'gemini',
          model: 'gemini-2.5-flash',
          cacheHit: true,
          cacheKey: 'sha256:abc123',
          latencyMs: 0,
          timestamp: '2026-11-21T05:48:00Z',
        },
      }).success,
    ).toBe(true);

    for (const goodTimestamp of [
      '2024-02-29T12:00:00Z',
      '2000-02-29T12:00:00Z',
      '2026-11-21T05:48:00.123456789Z',
      '2026-11-21T05:48:00-04:00',
    ]) {
      expect(IsoDatetimeSchema.safeParse(goodTimestamp).success).toBe(true);
    }

    for (const badTimestamp of [
      'not-a-date',
      '2026-11-21T05:48:00',
      '2026-11-21T05:48:00.Z',
      '2023-02-29T12:00:00Z',
      '1900-02-29T12:00:00Z',
      '2026-02-30T00:00:00Z',
      '2026-04-31T12:00:00Z',
      '2026-11-21T24:00:00Z',
      '2026-11-21T12:60:00Z',
      '2026-11-21T12:00:60Z',
      '2026-13-01T00:00:00Z',
      '2026-00-01T00:00:00Z',
      '2026-11-21T12:00:00+24:00',
      '2026-11-21T12:00:00+05:60',
    ]) {
      expect(IsoDatetimeSchema.safeParse(badTimestamp).success).toBe(false);
      expect(
        TriageResponseSchema.safeParse({
          triage,
          metadata: {
            engine: 'gemini',
            model: 'gemini-2.5-flash',
            cacheHit: false,
            cacheKey: 'sha256:abc123',
            latencyMs: 310,
            timestamp: badTimestamp,
          },
        }).success,
      ).toBe(false);
    }
  });
});

describe('IssueCreateSchema & WebP Storage Guard', () => {
  it('enforces exact 122,880-byte WebP payload cap', () => {
    const exactWebp =
      WEBP_DATA_URL_PREFIX +
      Buffer.alloc(MAX_STORED_WEBP_BYTES, 0x41).toString('base64');
    expect(exactWebp.length).toBeLessThanOrEqual(MAX_STORED_WEBP_DATA_URL_LENGTH);

    const exactCheck = validateStoredWebpDataUrl(exactWebp);
    expect(exactCheck.valid).toBe(true);
    expect(
      IssueCreateSchema.safeParse({
        ...makeValidCreateInput(),
        imageDataUrl: exactWebp,
      }).success,
    ).toBe(true);

    const overBytesWebp =
      WEBP_DATA_URL_PREFIX +
      Buffer.alloc(MAX_STORED_WEBP_BYTES + 1, 0x41).toString('base64');
    expect(overBytesWebp.length).toBeLessThanOrEqual(
      MAX_STORED_WEBP_DATA_URL_LENGTH,
    );
    expect(validateStoredWebpDataUrl(overBytesWebp).valid).toBe(false);
    expect(
      IssueCreateSchema.safeParse({
        ...makeValidCreateInput(),
        imageDataUrl: overBytesWebp,
      }).success,
    ).toBe(false);
  });

  it('enforces exact 165,000-character data URL cap', () => {
    const overLengthWebp =
      WEBP_DATA_URL_PREFIX +
      'A'.repeat(
        MAX_STORED_WEBP_DATA_URL_LENGTH - WEBP_DATA_URL_PREFIX.length + 1,
      );
    expect(overLengthWebp.length).toBe(MAX_STORED_WEBP_DATA_URL_LENGTH + 1);
    expect(StoredWebpDataUrlSchema.safeParse(overLengthWebp).success).toBe(
      false,
    );
  });

  it('rejects non-WebP, HTTP URLs, and empty WebP payloads while allowing null/undefined', () => {
    const sampleBase64 = Buffer.from('img').toString('base64');
    const invalidUrls = [
      `data:image/jpeg;base64,${sampleBase64}`,
      `data:image/png;base64,${sampleBase64}`,
      `data:image/svg+xml;base64,${sampleBase64}`,
      'https://example.com/photo.webp',
      WEBP_DATA_URL_PREFIX,
    ];

    for (const url of invalidUrls) {
      expect(
        IssueCreateSchema.safeParse({
          ...makeValidCreateInput(),
          imageDataUrl: url,
        }).success,
      ).toBe(false);
    }

    expect(
      IssueCreateSchema.safeParse({
        ...makeValidCreateInput(),
        imageDataUrl: null,
      }).success,
    ).toBe(true);

    const omitted = makeValidCreateInput();
    delete omitted.imageDataUrl;
    expect(IssueCreateSchema.safeParse(omitted).success).toBe(true);
  });
});

describe('IssueUpdateSchema, IssueFilterSchema & CivicIssueSchema', () => {
  it('validates partial admin updates and rejects empty patches or XSS in notes', () => {
    expect(IssueUpdateSchema.safeParse({ status: 'In Progress' }).success).toBe(
      true,
    );
    expect(
      IssueUpdateSchema.safeParse({ assignedDepartment: 'Public Safety' }).success,
    ).toBe(true);
    expect(
      IssueUpdateSchema.safeParse({
        resolutionNotes: 'Crew replaced faulty ballast & tested.',
      }).success,
    ).toBe(true);
    expect(
      IssueUpdateSchema.safeParse({
        status: 'Resolved',
        resolutionNotes: null,
      }).success,
    ).toBe(true);

    expect(IssueUpdateSchema.safeParse({}).success).toBe(false);
    expect(
      IssueUpdateSchema.safeParse({
        resolutionNotes: '<script>alert(1)</script>',
      }).success,
    ).toBe(false);
  });

  it('enforces limit(50) in IssueFilterSchema and validates full CivicIssue records', () => {
    expect(
      IssueFilterSchema.safeParse({ limitCount: MAX_ISSUES_LIMIT }).success,
    ).toBe(true);
    expect(IssueFilterSchema.safeParse({ limitCount: 0 }).success).toBe(false);
    expect(
      IssueFilterSchema.safeParse({ limitCount: MAX_ISSUES_LIMIT + 1 }).success,
    ).toBe(false);

    const fullIssue: CivicIssue = {
      id: 'issue-001',
      ...makeValidCreateInput(),
      assignedDepartment: 'Electrical & Streetlights',
      imageDataUrl: null,
      status: 'Reported',
      reporterUid: 'guest-uid-123',
      reporterDisplayName: 'Citizen Reporter',
      isGuest: true,
      upvoteCount: 1,
      resolutionNotes: null,
      createdAt: '2026-11-21T05:48:00.000Z',
      updatedAt: '2026-11-21T05:48:00.000Z',
      resolvedAt: null,
    };

    expect(CivicIssueSchema.safeParse(fullIssue).success).toBe(true);
    expect(
      CivicIssueSchema.safeParse({ ...fullIssue, upvoteCount: 0 }).success,
    ).toBe(false);
    expect(
      CivicIssueSchema.safeParse({ ...fullIssue, createdAt: 'invalid-date' })
        .success,
    ).toBe(false);
  });
});
