import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TriageResponseSchema } from '../../shared/schemas/triage.js';
import type { TriageResponse } from '../../shared/types/civic.js';
import {
  applyTestEnv,
  createSampleTriageResult,
  createSampleWebpDataUrl,
  invokeVercelHandler,
  isRecord,
  loadVercelHandler,
  requireAt,
  resetGenAIMockState,
  type GenAIMockState,
} from './helpers/e2eHarness.js';

const genaiMockState = vi.hoisted(
  (): GenAIMockState => ({
    calls: [],
    queue: [],
    defaultResult: {
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
        reason: 'Road surface damage matches civic report description.',
      },
      duplicateDetection: {
        isLikelyDuplicate: false,
        matchedIssueIds: [],
        highestSimilarity: 0.1,
        reason: 'No matching nearby open issues.',
      },
      summary: 'Deep pothole near school crosswalk requires urgent repair.',
      reasoning: 'Vehicular hazard near pedestrian crossing.',
    },
    handler: null,
  }),
);

vi.mock('@google/genai', async () => {
  const harness = await import('./helpers/e2eHarness.js');
  return harness.createGenAIMockModule(genaiMockState);
});

async function postTriage(body: Record<string, unknown>): Promise<{
  status: number;
  data: TriageResponse;
}> {
  const handler = await loadVercelHandler('api/triage.ts');
  const res = await invokeVercelHandler(handler, {
    method: 'POST',
    url: '/api/triage',
    body,
  });
  expect(res.status).toBe(200);
  const parsed = TriageResponseSchema.parse(res.json);
  return { status: res.status, data: parsed };
}

describe('Tier 1 — F4: Multimodal Gemini AI Triage', () => {
  let restoreEnv: (() => void) | null = null;

  beforeEach(() => {
    vi.resetModules();
    resetGenAIMockState(genaiMockState);
    restoreEnv = applyTestEnv({
      GEMINI_API_KEY: 'test-server-gemini-key',
      GEMINI_MODEL: 'gemini-2.5-flash',
      STRICT_AUTH_LOCKDOWN: 'false',
    });
  });

  afterEach(() => {
    if (restoreEnv !== null) {
      restoreEnv();
      restoreEnv = null;
    }
  });

  it('T1-F4-01: Text-only Gemini triage uses gemini-2.5-flash and responseSchema', async () => {
    const { data } = await postTriage({
      title: 'Deep pothole blocking bicycle lane',
      description:
        'Asphalt collapsed along Oak Avenue creating a sharp 15cm drop for cyclists.',
    });

    expect(data.metadata.engine).toBe('gemini');
    expect(data.metadata.model).toBe('gemini-2.5-flash');
    expect(genaiMockState.calls).toHaveLength(1);

    const call = requireAt(genaiMockState.calls, 0, 'genai calls');
    expect(call.model).toBe('gemini-2.5-flash');
    expect(call.apiKey).toBe('test-server-gemini-key');
    expect(isRecord(call.config)).toBe(true);
    if (isRecord(call.config)) {
      expect(Reflect.get(call.config, 'responseSchema')).toBeDefined();
      expect(Reflect.get(call.config, 'responseMimeType')).toBe(
        'application/json',
      );
    }
  });

  it('T1-F4-02: Multimodal WebP image + text triage sends inline image data and populates authenticityCheck', async () => {
    genaiMockState.queue.push({
      kind: 'triage',
      result: createSampleTriageResult({
        authenticityCheck: {
          isAuthentic: true,
          status: 'likely_authentic',
          confidence: 0.96,
          reason: 'Image depicts active asphalt crater matching description.',
        },
      }),
    });

    const { data } = await postTriage({
      title: 'Collapsed road shoulder near transit stop',
      description:
        'Attached photo shows crumbled curb and deep rut collecting standing water.',
      imageBase64: createSampleWebpDataUrl(600),
      imageMimeType: 'image/webp',
    });

    expect(data.metadata.engine).toBe('gemini');
    expect(data.triage.authenticityCheck.isAuthentic).toBe(true);
    expect(data.triage.authenticityCheck.status).toBe('likely_authentic');
    expect(data.triage.authenticityCheck.confidence).toBeGreaterThan(0.8);

    const call = requireAt(genaiMockState.calls, 0, 'multimodal call');
    const serializedContents = JSON.stringify(call.contents);
    expect(serializedContents).toContain('image/webp');
  });

  it('T1-F4-03: Nearby duplicate detection evaluates nearbyIssues and populates duplicateDetection', async () => {
    genaiMockState.queue.push({
      kind: 'triage',
      result: createSampleTriageResult({
        duplicateDetection: {
          isLikelyDuplicate: true,
          matchedIssueIds: ['issue-existing-101'],
          highestSimilarity: 0.91,
          reason: 'Matches open pothole report 25m away on 5th Ave.',
        },
      }),
    });

    const { data } = await postTriage({
      title: 'Pothole outside 5th Ave bakery',
      description:
        'Deep circular pothole outside 5th Ave bakery splashing pedestrians.',
      location: { lat: 12.9716, lng: 77.5946, address: '5th Ave' },
      nearbyIssues: [
        {
          id: 'issue-existing-101',
          title: 'Deep pothole near 5th Ave bakery',
          description:
            'Deep circular pothole outside 5th Ave bakery causing traffic swerves.',
          category: 'Pothole & Road Damage',
          lat: 12.97165,
          lng: 77.59462,
          status: 'Reported',
        },
      ],
    });

    expect(data.triage.duplicateDetection.isLikelyDuplicate).toBe(true);
    expect(data.triage.duplicateDetection.matchedIssueIds).toContain(
      'issue-existing-101',
    );
    expect(data.triage.duplicateDetection.highestSimilarity).toBeGreaterThan(
      0.5,
    );
  });

  it('T1-F4-04: GEMINI_MODEL environment override is passed to SDK and reported in metadata', async () => {
    if (restoreEnv !== null) {
      restoreEnv();
    }
    restoreEnv = applyTestEnv({
      GEMINI_API_KEY: 'test-server-gemini-key',
      GEMINI_MODEL: 'gemini-2.5-flash-lite',
      STRICT_AUTH_LOCKDOWN: 'false',
    });
    vi.resetModules();

    const { data } = await postTriage({
      title: 'Broken park bench railing',
      description:
        'Wooden bench along lakeside promenade has sharp exposed bolts.',
    });

    expect(data.metadata.engine).toBe('gemini');
    expect(data.metadata.model).toBe('gemini-2.5-flash-lite');
    const call = requireAt(genaiMockState.calls, 0, 'override model call');
    expect(call.model).toBe('gemini-2.5-flash-lite');
  });

  it('T1-F4-05: Triage metadata includes 64-hex cacheKey, cacheHit, latencyMs, and ISO timestamp', async () => {
    const { data } = await postTriage({
      title: 'Blocked storm drain on Cedar Street',
      description:
        'Leaves and silt completely cover storm grate before evening rain.',
    });

    expect(data.metadata.cacheHit).toBe(false);
    expect(data.metadata.cacheKey).toMatch(/^(?:sha256:)?[a-f0-9]{64}$/);
    expect(data.metadata.latencyMs).toBeGreaterThanOrEqual(0);
    expect(Number.isNaN(Date.parse(data.metadata.timestamp))).toBe(false);
  });
});

describe('Tier 1 — F5: SHA-256 Hash Cache', () => {
  let restoreEnv: (() => void) | null = null;

  beforeEach(() => {
    vi.resetModules();
    resetGenAIMockState(genaiMockState);
    restoreEnv = applyTestEnv({
      GEMINI_API_KEY: 'test-server-gemini-key',
      GEMINI_MODEL: 'gemini-2.5-flash',
      STRICT_AUTH_LOCKDOWN: 'false',
    });
  });

  afterEach(() => {
    if (restoreEnv !== null) {
      restoreEnv();
      restoreEnv = null;
    }
  });

  it('T1-F5-01: Identical POST /api/triage triggers SHA-256 cache hit with zero extra SDK calls', async () => {
    const payload = {
      title: 'Flickering crosswalk beacon on Pine St',
      description:
        'Pedestrian flashing beacon stays dark when push-button is pressed.',
      location: { lat: 37.7749, lng: -122.4194, address: 'Pine & 3rd' },
    };

    const first = await postTriage(payload);
    const second = await postTriage(payload);

    expect(first.data.metadata.cacheHit).toBe(false);
    expect(second.data.metadata.cacheHit).toBe(true);
    expect(second.data.metadata.cacheKey).toBe(first.data.metadata.cacheKey);
    expect(genaiMockState.calls).toHaveLength(1);
  });

  it('T1-F5-02: Canonical key normalization yields identical cacheKey for equivalent inputs', async () => {
    const first = await postTriage({
      title: 'Overflowing recycling dumpster',
      description: 'Plastic bottles spilling across Maple Alley sidewalk.',
      location: { lat: 37.775, lng: -122.418, address: 'Maple Alley' },
    });
    const second = await postTriage({
      location: { address: 'Maple Alley', lng: -122.418, lat: 37.775 },
      description: '  Plastic bottles spilling across Maple Alley sidewalk.  ',
      title: '  Overflowing recycling dumpster  ',
    });

    expect(second.data.metadata.cacheKey).toBe(first.data.metadata.cacheKey);
    expect(second.data.metadata.cacheHit).toBe(true);
    expect(genaiMockState.calls).toHaveLength(1);
  });

  it('T1-F5-03: Different title or description misses cache and calls SDK again', async () => {
    const first = await postTriage({
      title: 'Broken street lamp on 1st Ave',
      description: 'Lamp pole 4 is out near bus shelter.',
    });
    const second = await postTriage({
      title: 'Broken street lamp on 2nd Ave',
      description: 'Lamp pole 9 is out near library entrance.',
    });

    expect(second.data.metadata.cacheHit).toBe(false);
    expect(second.data.metadata.cacheKey).not.toBe(
      first.data.metadata.cacheKey,
    );
    expect(genaiMockState.calls).toHaveLength(2);
  });

  it('T1-F5-04: Different imageBase64 misses cache', async () => {
    const base = {
      title: 'Damaged manhole cover on West Blvd',
      description: 'Metal cover is cracked and rattles loudly when cars pass.',
    };
    const first = await postTriage({
      ...base,
      imageBase64: createSampleWebpDataUrl(256),
      imageMimeType: 'image/webp',
    });
    const second = await postTriage({
      ...base,
      imageBase64: createSampleWebpDataUrl(384),
      imageMimeType: 'image/webp',
    });

    expect(second.data.metadata.cacheHit).toBe(false);
    expect(second.data.metadata.cacheKey).not.toBe(
      first.data.metadata.cacheKey,
    );
    expect(genaiMockState.calls).toHaveLength(2);
  });

  it('T1-F5-05: Different location or nearbyIssues misses cache', async () => {
    const base = {
      title: 'Leaking fire hydrant valve',
      description: 'Steady water stream flowing from hydrant base onto road.',
    };
    const first = await postTriage({
      ...base,
      location: { lat: 12.9716, lng: 77.5946 },
      nearbyIssues: [],
    });
    const second = await postTriage({
      ...base,
      location: { lat: 12.982, lng: 77.605 },
      nearbyIssues: [
        {
          id: 'nearby-hydrant-1',
          title: 'Hydrant leak nearby',
          description: 'Water pooling at intersection.',
          lat: 12.982,
          lng: 77.605,
        },
      ],
    });

    expect(second.data.metadata.cacheHit).toBe(false);
    expect(second.data.metadata.cacheKey).not.toBe(
      first.data.metadata.cacheKey,
    );
    expect(genaiMockState.calls).toHaveLength(2);
  });
});

describe('Tier 1 — F6: Deterministic Civic NLP Failover', () => {
  let restoreEnv: (() => void) | null = null;

  beforeEach(() => {
    vi.resetModules();
    resetGenAIMockState(genaiMockState);
    restoreEnv = applyTestEnv({
      GEMINI_API_KEY: undefined,
      STRICT_AUTH_LOCKDOWN: 'false',
    });
  });

  afterEach(() => {
    if (restoreEnv !== null) {
      restoreEnv();
      restoreEnv = null;
    }
  });

  it('T1-F6-01: Missing GEMINI_API_KEY fails over cleanly with missing_api_key tag', async () => {
    const { data } = await postTriage({
      title: 'Large pothole near civic hospital',
      description:
        'Vehicles swerving around deep asphalt pothole on main hospital approach road.',
    });

    expect(data.metadata.engine).toBe('nlp-fallback');
    expect(data.metadata.fallbackReason).toBe('missing_api_key');
    expect(genaiMockState.calls).toHaveLength(0);
  });

  it('T1-F6-02: Upstream 429 rate-limit / quota error fails over cleanly', async () => {
    if (restoreEnv !== null) {
      restoreEnv();
    }
    restoreEnv = applyTestEnv({
      GEMINI_API_KEY: 'test-server-gemini-key',
      STRICT_AUTH_LOCKDOWN: 'false',
    });
    vi.resetModules();

    genaiMockState.queue.push({
      kind: 'error',
      status: 429,
      message: '429 Too Many Requests: Quota exceeded',
    });

    const { data } = await postTriage({
      title: 'Streetlight outage at metro underpass',
      description:
        'Three consecutive streetlights are dead causing dark pedestrian tunnel.',
    });

    expect(data.metadata.engine).toBe('nlp-fallback');
    expect(['rate_limited', 'quota_exceeded']).toContain(
      data.metadata.fallbackReason,
    );
  });

  it('T1-F6-03: NLP classifies road/pothole reports to Roads & Infrastructure and garbage to Sanitation & Waste', async () => {
    const roadRes = await postTriage({
      title: 'Cracked asphalt pothole on highway ramp',
      description:
        'Deep pothole and broken road pavement damaging commuter tires.',
    });
    expect(roadRes.data.metadata.engine).toBe('nlp-fallback');
    expect(roadRes.data.triage.recommendedDepartment).toBe(
      'Roads & Infrastructure',
    );
    expect(roadRes.data.triage.category).toBe('Pothole & Road Damage');

    const wasteRes = await postTriage({
      title: 'Illegal garbage dumping behind market',
      description:
        'Rotting trash bags, litter, and overflowing dumpster creating foul odor.',
    });
    expect(wasteRes.data.metadata.engine).toBe('nlp-fallback');
    expect(wasteRes.data.triage.recommendedDepartment).toBe(
      'Sanitation & Waste',
    );
    expect(wasteRes.data.triage.category).toBe('Garbage & Illegal Dumping');
  });

  it('T1-F6-04: NLP classifies streetlight/electrical and water/sewage reports accurately', async () => {
    const electricalRes = await postTriage({
      title: 'Dark streetlight pole with sparking wire',
      description:
        'Streetlight lamp outage and exposed electrical transformer cable.',
    });
    expect(electricalRes.data.metadata.engine).toBe('nlp-fallback');
    expect(electricalRes.data.triage.recommendedDepartment).toBe(
      'Electrical & Streetlights',
    );
    expect(electricalRes.data.triage.category).toBe('Streetlight & Electrical');

    const waterRes = await postTriage({
      title: 'Burst water main flooding intersection',
      description:
        'Broken water pipe and overflowing sewage drain flooding sidewalk.',
    });
    expect(waterRes.data.metadata.engine).toBe('nlp-fallback');
    expect(waterRes.data.triage.recommendedDepartment).toBe('Water & Sewage');
    expect(waterRes.data.triage.category).toBe('Water Leak & Sewage');
  });

  it('T1-F6-05: NLP scores emergency public safety hazards with High/Critical urgency >= 7', async () => {
    const safetyRes = await postTriage({
      title: 'Emergency traffic signal failure at school crosswalk',
      description:
        'Dangerous collision hazard: traffic signal dead and live downed hazard blocking children crossing.',
    });

    expect(safetyRes.data.metadata.engine).toBe('nlp-fallback');
    expect(safetyRes.data.triage.recommendedDepartment).toBe('Public Safety');
    expect(safetyRes.data.triage.urgencyScore).toBeGreaterThanOrEqual(7);
    expect(['High', 'Critical']).toContain(
      safetyRes.data.triage.priorityLevel,
    );
  });
});

describe('Tier 2 — F4: Gemini Triage Boundary & Error Cases', () => {
  let restoreEnv: (() => void) | null = null;

  beforeEach(() => {
    vi.resetModules();
    resetGenAIMockState(genaiMockState);
    restoreEnv = applyTestEnv({
      GEMINI_API_KEY: 'test-server-gemini-key',
      GEMINI_MODEL: 'gemini-2.5-flash',
      STRICT_AUTH_LOCKDOWN: 'false',
    });
  });

  afterEach(() => {
    if (restoreEnv !== null) {
      restoreEnv();
      restoreEnv = null;
    }
  });

  it('T2-F4-01: Mismatched image/text authenticity signal validates cleanly within TriageResponseSchema', async () => {
    genaiMockState.queue.push({
      kind: 'triage',
      result: createSampleTriageResult({
        authenticityCheck: {
          isAuthentic: false,
          status: 'flagged_mismatch',
          confidence: 0.89,
          reason:
            'Image appears unrelated to reported water leak; flagged for review.',
        },
      }),
    });

    const { data } = await postTriage({
      title: 'Water pipe leak on Elm Street',
      description: 'Major leak flooding pedestrian walkway near corner.',
      imageBase64: createSampleWebpDataUrl(400),
      imageMimeType: 'image/webp',
    });

    expect(data.triage.authenticityCheck.isAuthentic).toBe(false);
    expect(data.triage.authenticityCheck.status).toBe('flagged_mismatch');
  });

  it('T2-F4-02: Empty nearbyIssues or distant coordinates return non-duplicate result', async () => {
    genaiMockState.queue.push({
      kind: 'triage',
      result: createSampleTriageResult({
        duplicateDetection: {
          isLikelyDuplicate: false,
          matchedIssueIds: [],
          highestSimilarity: 0.05,
          reason: 'No nearby issues within duplicate radius.',
        },
      }),
    });

    const { data } = await postTriage({
      title: 'Fallen tree branch blocking bike path',
      description:
        'Large oak branch blocking paved greenway trail near river bridge.',
      location: { lat: 12.9716, lng: 77.5946 },
      nearbyIssues: [
        {
          id: 'distant-issue-1',
          title: 'Fallen branch 20km north',
          description: 'Fallen tree branch on north trail.',
          lat: 13.15,
          lng: 77.75,
        },
      ],
    });

    expect(data.triage.duplicateDetection.isLikelyDuplicate).toBe(false);
    expect(data.triage.duplicateDetection.matchedIssueIds).toEqual([]);
  });

  it('T2-F4-03: Near-identical nearby issue within close radius detects duplicate', async () => {
    genaiMockState.queue.push({
      kind: 'triage',
      result: createSampleTriageResult({
        duplicateDetection: {
          isLikelyDuplicate: true,
          matchedIssueIds: ['close-issue-77'],
          highestSimilarity: 0.95,
          reason: 'Nearly identical pothole report within 15 meters.',
        },
      }),
    });

    const { data } = await postTriage({
      title: 'Deep pothole outside City Library',
      description:
        'Deep pothole outside City Library main steps trapping rainwater.',
      location: { lat: 12.9716, lng: 77.5946 },
      nearbyIssues: [
        {
          id: 'close-issue-77',
          title: 'Deep pothole outside City Library',
          description:
            'Deep pothole outside City Library main steps filling with water.',
          lat: 12.97161,
          lng: 77.59461,
        },
      ],
    });

    expect(data.triage.duplicateDetection.isLikelyDuplicate).toBe(true);
    expect(data.triage.duplicateDetection.matchedIssueIds).toContain(
      'close-issue-77',
    );
  });

  it('T2-F4-04: Corrupt non-JSON response from Gemini SDK falls back safely with invalid_response', async () => {
    genaiMockState.queue.push({
      kind: 'raw-text',
      text: 'Sorry, I cannot process this request as JSON right now {{{',
    });

    const { data } = await postTriage({
      title: 'Clogged rainwater culvert on 9th Road',
      description:
        'Storm culvert blocked by construction debris causing street pooling.',
    });

    expect(data.metadata.engine).toBe('nlp-fallback');
    expect(data.metadata.fallbackReason).toBe('invalid_response');
  });

  it('T2-F4-05: Gemini SDK AbortError timeout fails fast and falls back with timeout', async () => {
    genaiMockState.queue.push({
      kind: 'timeout',
      message: 'Request timed out after 8000ms',
    });

    const { data } = await postTriage({
      title: 'Broken guardrail on bridge ramp',
      description:
        'Steel highway guardrail bent inward into right lane after impact.',
    });

    expect(data.metadata.engine).toBe('nlp-fallback');
    expect(data.metadata.fallbackReason).toBe('timeout');
  });
});

describe('Tier 2 — F5: Cache Invalidation, Isolation & Capacity Cases', () => {
  let restoreEnv: (() => void) | null = null;

  beforeEach(() => {
    vi.resetModules();
    resetGenAIMockState(genaiMockState);
    restoreEnv = applyTestEnv({
      GEMINI_API_KEY: 'test-server-gemini-key',
      GEMINI_MODEL: 'gemini-2.5-flash',
      STRICT_AUTH_LOCKDOWN: 'false',
    });
  });

  afterEach(() => {
    if (restoreEnv !== null) {
      restoreEnv();
      restoreEnv = null;
    }
  });

  it('T2-F5-01: Fallback responses are never cached as Gemini hits; recovery retries Gemini', async () => {
    const payload = {
      title: 'Damaged traffic bollard on Civic Plaza',
      description:
        'Reflective pedestrian bollard knocked flat at plaza entrance.',
    };

    genaiMockState.queue.push({
      kind: 'error',
      status: 429,
      message: 'Rate limit exceeded',
    });

    const fallbackRes = await postTriage(payload);
    expect(fallbackRes.data.metadata.engine).toBe('nlp-fallback');
    expect(fallbackRes.data.metadata.cacheHit).toBe(false);

    const recoveredRes = await postTriage(payload);
    expect(recoveredRes.data.metadata.engine).toBe('gemini');
    expect(recoveredRes.data.metadata.cacheHit).toBe(false);
    expect(genaiMockState.calls).toHaveLength(2);
  });

  it('T2-F5-02: Repeated cache hits preserve exact deep-equal triage payload', async () => {
    const payload = {
      title: 'Sinkhole forming near bus bay',
      description:
        'Pavement depression widening beside municipal bus shelter B2.',
    };

    const first = await postTriage(payload);
    const second = await postTriage(payload);
    const third = await postTriage(payload);

    expect(first.data.metadata.cacheHit).toBe(false);
    expect(second.data.metadata.cacheHit).toBe(true);
    expect(third.data.metadata.cacheHit).toBe(true);
    expect(second.data.triage).toEqual(first.data.triage);
    expect(third.data.triage).toEqual(first.data.triage);
    expect(genaiMockState.calls).toHaveLength(1);
  });

  it('T2-F5-03: cacheKey is a valid 64-char lowercase SHA-256 hex digest', async () => {
    const { data } = await postTriage({
      title: 'Loose manhole lid on Broadway',
      description:
        'Heavy cast-iron lid shifts whenever buses cross intersection.',
    });

    expect(data.metadata.cacheKey).toMatch(/^(?:sha256:)?[a-f0-9]{64}$/);
  });

  it('T2-F5-04: Optional fields omitted vs explicit undefined canonicalize identically without throwing', async () => {
    const omitted = await postTriage({
      title: 'Missing stop sign at Grove & 8th',
      description: 'Stop sign post sheared off at base creating blind corner.',
    });
    const withUndefined = await postTriage({
      title: 'Missing stop sign at Grove & 8th',
      description: 'Stop sign post sheared off at base creating blind corner.',
      imageBase64: undefined,
      imageMimeType: undefined,
      location: undefined,
      nearbyIssues: undefined,
    });

    expect(withUndefined.data.metadata.cacheKey).toBe(
      omitted.data.metadata.cacheKey,
    );
    expect(withUndefined.data.metadata.cacheHit).toBe(true);
  });

  it('T2-F5-05: Cache handles burst of 25 distinct requests cleanly without error', async () => {
    for (let i = 0; i < 25; i += 1) {
      const { data } = await postTriage({
        title: `Distinct civic report number ${i}`,
        description: `Automated burst verification report for street segment #${i}.`,
      });
      expect(data.metadata.engine).toBe('gemini');
      expect(data.metadata.cacheHit).toBe(false);
    }
    expect(genaiMockState.calls).toHaveLength(25);
  });
});

describe('Tier 2 — F6: Failover Reason Mapping & Offline NLP Boundaries', () => {
  let restoreEnv: (() => void) | null = null;

  beforeEach(() => {
    vi.resetModules();
    resetGenAIMockState(genaiMockState);
    restoreEnv = applyTestEnv({
      GEMINI_API_KEY: 'test-server-gemini-key',
      GEMINI_MODEL: 'gemini-2.5-flash',
      STRICT_AUTH_LOCKDOWN: 'false',
    });
  });

  afterEach(() => {
    if (restoreEnv !== null) {
      restoreEnv();
      restoreEnv = null;
    }
  });

  it('T2-F6-01: 401/403 maps to auth_error and 404 maps to model_unavailable', async () => {
    genaiMockState.queue.push({
      kind: 'error',
      status: 403,
      message: 'API key invalid or forbidden',
    });
    const authRes = await postTriage({
      title: 'Pothole report triggering 403 auth failover',
      description: 'Testing 403 upstream authentication error fallback path.',
    });
    expect(authRes.data.metadata.engine).toBe('nlp-fallback');
    expect(authRes.data.metadata.fallbackReason).toBe('auth_error');

    genaiMockState.queue.push({
      kind: 'error',
      status: 404,
      message: 'Requested model not found',
    });
    const modelRes = await postTriage({
      title: 'Streetlight report triggering 404 model failover',
      description: 'Testing 404 upstream model unavailable fallback path.',
    });
    expect(modelRes.data.metadata.engine).toBe('nlp-fallback');
    expect(modelRes.data.metadata.fallbackReason).toBe('model_unavailable');
  });

  it('T2-F6-02: 500/503 maps to upstream_error and timeout maps to timeout', async () => {
    genaiMockState.queue.push({
      kind: 'error',
      status: 503,
      message: 'Service temporarily unavailable',
    });
    const upstreamRes = await postTriage({
      title: 'Water leak report triggering 503 upstream failover',
      description: 'Testing 503 upstream error fallback tagging cleanly.',
    });
    expect(upstreamRes.data.metadata.engine).toBe('nlp-fallback');
    expect(upstreamRes.data.metadata.fallbackReason).toBe('upstream_error');

    genaiMockState.queue.push({
      kind: 'timeout',
      message: 'Deadline exceeded',
    });
    const timeoutRes = await postTriage({
      title: 'Garbage spill triggering timeout failover',
      description: 'Testing AbortError timeout fallback tagging cleanly.',
    });
    expect(timeoutRes.data.metadata.engine).toBe('nlp-fallback');
    expect(timeoutRes.data.metadata.fallbackReason).toBe('timeout');
  });

  it('T2-F6-03: Schema-invalid JSON from Gemini fails over with invalid_response', async () => {
    genaiMockState.queue.push({
      kind: 'raw-text',
      text: JSON.stringify({
        category: 'NotARealCategory',
        urgencyScore: 99,
      }),
    });

    const { data } = await postTriage({
      title: 'Broken park fence along playground',
      description:
        'Fence panel collapsed near toddler play area and needs repair.',
    });

    expect(data.metadata.engine).toBe('nlp-fallback');
    expect(data.metadata.fallbackReason).toBe('invalid_response');
  });

  it('T2-F6-04: Ambiguous non-keyword description defaults cleanly to Other Civic Issue', async () => {
    if (restoreEnv !== null) {
      restoreEnv();
    }
    restoreEnv = applyTestEnv({
      GEMINI_API_KEY: undefined,
      STRICT_AUTH_LOCKDOWN: 'false',
    });
    vi.resetModules();

    const { data } = await postTriage({
      title: 'Community noticeboard glass cracked',
      description:
        'Public wooden kiosk panel near civic fountain has a hairline crack.',
    });

    expect(data.metadata.engine).toBe('nlp-fallback');
    expect(data.triage.category).toBe('Other Civic Issue');
    expect(data.triage.urgencyScore).toBeGreaterThanOrEqual(1);
    expect(data.triage.urgencyScore).toBeLessThanOrEqual(10);
    expect(data.triage.slaEstimateHours).toBeGreaterThan(0);
  });

  it('T2-F6-05: Offline NLP executes local Haversine and Jaccard duplicate detection', async () => {
    if (restoreEnv !== null) {
      restoreEnv();
    }
    restoreEnv = applyTestEnv({
      GEMINI_API_KEY: undefined,
      STRICT_AUTH_LOCKDOWN: 'false',
    });
    vi.resetModules();

    const { data } = await postTriage({
      title: 'Burst water pipe on Market Street',
      description:
        'Burst water pipe flooding Market Street sidewalk and crosswalk.',
      location: { lat: 12.9716, lng: 77.5946 },
      nearbyIssues: [
        {
          id: 'local-dup-42',
          title: 'Burst water pipe on Market Street',
          description:
            'Burst water pipe flooding Market Street sidewalk near crosswalk.',
          category: 'Water Leak & Sewage',
          lat: 12.97162,
          lng: 77.59462,
          status: 'Reported',
        },
      ],
    });

    expect(data.metadata.engine).toBe('nlp-fallback');
    expect(data.triage.duplicateDetection.isLikelyDuplicate).toBe(true);
    expect(data.triage.duplicateDetection.matchedIssueIds).toContain(
      'local-dup-42',
    );
    expect(data.triage.duplicateDetection.highestSimilarity).toBeGreaterThan(
      0.4,
    );
  });
});
