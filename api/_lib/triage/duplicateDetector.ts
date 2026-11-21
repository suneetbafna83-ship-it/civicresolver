import {
  MAX_DUPLICATE_MATCH_IDS,
  type DuplicateDetection,
  type IssueCategory,
  type TriageRequest,
} from '../../../shared/types/civic.js';

export const EARTH_RADIUS_METERS = 6_371_000;
export const DEFAULT_DUPLICATE_RADIUS_METERS = 500;
export const DEFAULT_DUPLICATE_SIMILARITY_THRESHOLD = 0.45;

const STOP_WORDS = new Set<string>([
  'the',
  'and',
  'for',
  'with',
  'that',
  'this',
  'from',
  'near',
  'into',
  'onto',
  'over',
  'under',
  'have',
  'has',
  'are',
  'was',
  'were',
  'been',
  'being',
  'there',
  'here',
  'street',
  'road',
  'area',
  'issue',
  'report',
  'reported',
  'please',
  'very',
  'some',
  'about',
]);

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

export function haversineDistanceMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const rLat1 = toRadians(lat1);
  const rLat2 = toRadians(lat2);

  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const a =
    sinLat * sinLat + Math.cos(rLat1) * Math.cos(rLat2) * sinLng * sinLng;
  const clampedA = Math.min(1, Math.max(0, a));
  const c = 2 * Math.atan2(Math.sqrt(clampedA), Math.sqrt(1 - clampedA));
  return EARTH_RADIUS_METERS * c;
}

export function tokenizeForSimilarity(text: string): Set<string> {
  const normalized = text.toLowerCase().replace(/[^a-z0-9\s]+/g, ' ');
  const rawTokens = normalized
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2);

  const filtered = new Set<string>();
  for (const token of rawTokens) {
    if (!STOP_WORDS.has(token)) {
      filtered.add(token);
    }
  }

  if (filtered.size > 0) {
    return filtered;
  }

  const fallback = new Set<string>();
  for (const token of rawTokens) {
    fallback.add(token);
  }
  return fallback;
}

export function computeTokenJaccard(textA: string, textB: string): number {
  const tokensA = tokenizeForSimilarity(textA);
  const tokensB = tokenizeForSimilarity(textB);
  if (tokensA.size === 0 || tokensB.size === 0) {
    return 0;
  }

  let intersection = 0;
  for (const token of tokensA) {
    if (tokensB.has(token)) {
      intersection += 1;
    }
  }

  const union = tokensA.size + tokensB.size - intersection;
  if (union <= 0) {
    return 0;
  }
  return intersection / union;
}

interface CandidateMatch {
  readonly id: string;
  readonly score: number;
  readonly distanceMeters: number | null;
  readonly isMatch: boolean;
}

function formatDistanceLabel(distanceMeters: number): string {
  if (distanceMeters < 1000) {
    return `${Math.round(distanceMeters)}m`;
  }
  return `${(distanceMeters / 1000).toFixed(2)}km`;
}

export function detectDuplicates(
  request: TriageRequest,
  inferredCategory?: IssueCategory,
): DuplicateDetection {
  const nearby = request.nearbyIssues;
  if (!nearby || nearby.length === 0) {
    return {
      isLikelyDuplicate: false,
      matchedIssueIds: [],
      highestSimilarity: 0,
      reason: 'No nearby civic issues provided for duplicate comparison.',
    };
  }

  const queryText = `${request.title} ${request.description}`;
  const candidates: CandidateMatch[] = [];
  let maxScore = 0;
  let closestMatchDistance: number | null = null;

  for (const issue of nearby) {
    const issueText = `${issue.title} ${issue.description}`;
    const jaccard = computeTokenJaccard(queryText, issueText);
    const distanceMeters = request.location
      ? haversineDistanceMeters(
          request.location.lat,
          request.location.lng,
          issue.lat,
          issue.lng,
        )
      : null;

    let combinedScore: number;
    let isMatch: boolean;

    if (distanceMeters !== null) {
      if (distanceMeters > DEFAULT_DUPLICATE_RADIUS_METERS) {
        combinedScore = jaccard * 0.25;
        isMatch = false;
      } else {
        const proximityScore =
          distanceMeters <= 50
            ? 1
            : Math.max(0, 1 - (distanceMeters - 50) / 450);
        const categoryBoost =
          inferredCategory !== undefined && issue.category === inferredCategory
            ? 0.08
            : 0;
        combinedScore = Math.min(
          1,
          0.62 * jaccard + 0.38 * proximityScore + categoryBoost,
        );
        isMatch =
          combinedScore >= DEFAULT_DUPLICATE_SIMILARITY_THRESHOLD ||
          (distanceMeters <= 120 && jaccard >= 0.3);
      }
    } else {
      combinedScore = jaccard;
      isMatch = jaccard >= DEFAULT_DUPLICATE_SIMILARITY_THRESHOLD;
    }

    if (combinedScore > maxScore) {
      maxScore = combinedScore;
    }

    if (isMatch) {
      candidates.push({
        id: issue.id,
        score: combinedScore,
        distanceMeters,
        isMatch,
      });
      if (
        distanceMeters !== null &&
        (closestMatchDistance === null || distanceMeters < closestMatchDistance)
      ) {
        closestMatchDistance = distanceMeters;
      }
    }
  }

  candidates.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    if (a.distanceMeters !== null && b.distanceMeters !== null) {
      if (a.distanceMeters !== b.distanceMeters) {
        return a.distanceMeters - b.distanceMeters;
      }
    }
    return a.id.localeCompare(b.id);
  });

  const matchedIssueIds = candidates
    .slice(0, MAX_DUPLICATE_MATCH_IDS)
    .map((candidate) => candidate.id);
  const highestSimilarity = Math.round(Math.min(1, Math.max(0, maxScore)) * 1000) / 1000;

  if (matchedIssueIds.length === 0) {
    return {
      isLikelyDuplicate: false,
      matchedIssueIds: [],
      highestSimilarity,
      reason: `Compared against ${nearby.length} nearby report(s); no close duplicate exceeded similarity threshold.`,
    };
  }

  const pct = Math.round(highestSimilarity * 100);
  const distancePart =
    closestMatchDistance !== null
      ? ` within ${formatDistanceLabel(closestMatchDistance)}`
      : '';
  const rawReason = `Found ${matchedIssueIds.length} potential duplicate report(s)${distancePart} (top similarity ${pct}%).`;

  return {
    isLikelyDuplicate: true,
    matchedIssueIds,
    highestSimilarity,
    reason: rawReason.slice(0, 300),
  };
}
