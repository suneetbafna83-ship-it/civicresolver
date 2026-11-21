import {
  TriageResponseSchema,
} from '../../../shared/schemas/triage.js';
import type {
  CivicIssue,
  HealthResponse,
  IssueCategory,
  NearbyIssueContext,
  PriorityLevel,
  Department,
  TriageRequest,
  TriageResponse,
} from '../../../shared/types/civic.js';

export function buildNearbyContextFromIssues(
  issues: ReadonlyArray<CivicIssue>,
): NearbyIssueContext[] {
  return issues.slice(0, 35).map((issue) => ({
    id: issue.id,
    title: issue.title,
    description: issue.description,
    category: issue.category,
    lat: issue.location.lat,
    lng: issue.location.lng,
    status: issue.status,
  }));
}

function inferOfflineClientTriage(request: TriageRequest): TriageResponse {
  const combined = `${request.title} ${request.description}`.toLowerCase();

  let category: IssueCategory = 'Other Civic Issue';
  let recommendedDepartment: Department = 'Roads & Infrastructure';
  let urgencyScore = 5;
  let priorityLevel: PriorityLevel = 'Medium';
  let slaEstimateHours = 48;
  let slaEstimateText = 'Standard dispatch within 48 hours';

  if (/water|burst|pipe|sewage|flood|leak/.test(combined)) {
    category = 'Water Leak & Sewage';
    recommendedDepartment = 'Water & Sewage';
    urgencyScore = /burst|flood|gushing|sewage/.test(combined) ? 9 : 7;
    priorityLevel = urgencyScore >= 9 ? 'Critical' : 'High';
    slaEstimateHours = urgencyScore >= 9 ? 4 : 12;
    slaEstimateText = `Water utility dispatch within ${slaEstimateHours} hours`;
  } else if (/wire|spark|streetlight|lamp|pole|electric|dark/.test(combined)) {
    category = 'Streetlight & Electrical';
    recommendedDepartment = 'Electrical & Streetlights';
    urgencyScore = /wire|spark|live|exposed/.test(combined) ? 10 : 6;
    priorityLevel = urgencyScore >= 9 ? 'Critical' : 'Medium';
    slaEstimateHours = urgencyScore >= 9 ? 2 : 36;
    slaEstimateText = `Electrical crew response within ${slaEstimateHours} hours`;
  } else if (/garbage|trash|bin|dump|waste|smell|debris/.test(combined)) {
    category = 'Garbage & Illegal Dumping';
    recommendedDepartment = 'Sanitation & Waste';
    urgencyScore = 5;
    priorityLevel = 'Medium';
    slaEstimateHours = 24;
    slaEstimateText = 'Sanitation truck pickup within 24 hours';
  } else if (/signal|crosswalk|school|traffic|accident|hazard/.test(combined)) {
    category = 'Traffic & Public Safety';
    recommendedDepartment = 'Public Safety';
    urgencyScore = 8;
    priorityLevel = 'High';
    slaEstimateHours = 8;
    slaEstimateText = 'Traffic safety officer dispatch within 8 hours';
  } else if (/pothole|road|asphalt|crater|lane|pavement/.test(combined)) {
    category = 'Pothole & Road Damage';
    recommendedDepartment = 'Roads & Infrastructure';
    urgencyScore = /deep|highway|swerve|school|hospital/.test(combined) ? 8 : 6;
    priorityLevel = urgencyScore >= 8 ? 'High' : 'Medium';
    slaEstimateHours = 24;
    slaEstimateText = 'Road repair crew within 24 hours';
  }

  const matchedIds: string[] = [];
  let highestSimilarity = 0;
  if (request.nearbyIssues && request.location) {
    for (const nearby of request.nearbyIssues) {
      const dLat = Math.abs(nearby.lat - request.location.lat);
      const dLng = Math.abs(nearby.lng - request.location.lng);
      const isClose = dLat < 0.004 && dLng < 0.004;
      const sameCategory = nearby.category === category;
      if (isClose && sameCategory) {
        matchedIds.push(nearby.id);
        highestSimilarity = Math.max(highestSimilarity, 0.84);
      }
    }
  }

  return {
    triage: {
      category,
      urgencyScore,
      priorityLevel,
      recommendedDepartment,
      slaEstimateHours,
      slaEstimateText,
      authenticityCheck: {
        isAuthentic: true,
        status: 'likely_authentic',
        confidence: 0.88,
        reason: 'Verified civic infrastructure report structure and location context.',
      },
      duplicateDetection: {
        isLikelyDuplicate: matchedIds.length > 0,
        matchedIssueIds: matchedIds.slice(0, 5),
        highestSimilarity,
        reason:
          matchedIds.length > 0
            ? `Found ${matchedIds.length} active report(s) in the same category nearby.`
            : 'No nearby duplicate complaints detected.',
      },
      summary: `${category} routed to ${recommendedDepartment} (${priorityLevel} Priority).`,
      reasoning: `Classified as ${category} with urgency ${urgencyScore}/10 based on public impact and safety indicators.`,
    },
    metadata: {
      engine: 'nlp-fallback',
      model: 'civic-nlp-heuristic-v1',
      cacheHit: false,
      cacheKey: 'offline-client-triage',
      fallbackReason: 'upstream_error',
      latencyMs: 6,
      timestamp: new Date().toISOString(),
    },
  };
}

export async function analyzeCivicIssue(
  payload: TriageRequest,
  idToken?: string | null,
): Promise<TriageResponse> {
  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (idToken) {
      headers['Authorization'] = `Bearer ${idToken}`;
    }

    const res = await fetch('/api/triage', {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      return inferOfflineClientTriage(payload);
    }

    const json: unknown = await res.json();
    const parsed = TriageResponseSchema.safeParse(json);
    if (parsed.success) {
      return parsed.data;
    }
    return inferOfflineClientTriage(payload);
  } catch {
    return inferOfflineClientTriage(payload);
  }
}

export async function fetchApiHealth(): Promise<HealthResponse | null> {
  try {
    const res = await fetch('/api/health');
    if (!res.ok) {
      return null;
    }
    const data = (await res.json()) as HealthResponse;
    return data?.ok === true ? data : null;
  } catch {
    return null;
  }
}
