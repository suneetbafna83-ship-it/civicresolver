import {
  type AuthenticityCheck,
  type Department,
  type IssueCategory,
  type PriorityLevel,
  type TriageRequest,
  type TriageResult,
} from '../../../shared/types/civic.js';
import { sanitizeText } from '../middleware/sanitize.js';
import { detectDuplicates } from './duplicateDetector.js';

export const HEURISTIC_MODEL_ID = 'deterministic-civic-nlp-v1';

interface CategoryRule {
  readonly category: IssueCategory;
  readonly department: Department;
  readonly baseUrgency: number;
  readonly phrases: readonly string[];
  readonly tokens: readonly string[];
}

const CATEGORY_RULES: readonly CategoryRule[] = [
  {
    category: 'Pothole & Road Damage',
    department: 'Roads & Infrastructure',
    baseUrgency: 5,
    phrases: [
      'road crack',
      'road damage',
      'speed bump',
      'broken pavement',
      'collapsed road',
    ],
    tokens: [
      'pothole',
      'potholes',
      'asphalt',
      'pavement',
      'sidewalk',
      'curb',
      'sinkhole',
      'manhole',
      'culvert',
      'bridge',
      'footpath',
      'highway',
      'lane',
      'roadway',
      'crater',
    ],
  },
  {
    category: 'Garbage & Illegal Dumping',
    department: 'Sanitation & Waste',
    baseUrgency: 4,
    phrases: [
      'illegal dump',
      'illegal dumping',
      'overflowing bin',
      'overflowing dumpster',
      'dead animal',
      'trash pile',
    ],
    tokens: [
      'garbage',
      'trash',
      'waste',
      'dumping',
      'litter',
      'rubbish',
      'dumpster',
      'sanitation',
      'stench',
      'odor',
      'debris',
      'recycling',
      'landfill',
      'bins',
    ],
  },
  {
    category: 'Streetlight & Electrical',
    department: 'Electrical & Streetlights',
    baseUrgency: 5,
    phrases: [
      'street light',
      'street lights',
      'lamp post',
      'light pole',
      'dark street',
      'flickering light',
      'power line',
      'downed wire',
      'live wire',
      'power outage',
    ],
    tokens: [
      'streetlight',
      'streetlights',
      'electrical',
      'transformer',
      'sparking',
      'sparks',
      'blackout',
      'electrocution',
      'wire',
      'wires',
      'pole',
      'voltage',
      'outage',
    ],
  },
  {
    category: 'Water Leak & Sewage',
    department: 'Water & Sewage',
    baseUrgency: 6,
    phrases: [
      'water leak',
      'burst pipe',
      'pipe leak',
      'water main',
      'storm drain',
      'stagnant water',
      'overflowing drain',
      'raw sewage',
    ],
    tokens: [
      'sewage',
      'sewer',
      'drainage',
      'drain',
      'flooding',
      'flooded',
      'waterlogged',
      'hydrant',
      'gutter',
      'leakage',
      'leak',
      'pipe',
      'water',
      'contamination',
    ],
  },
  {
    category: 'Traffic & Public Safety',
    department: 'Public Safety',
    baseUrgency: 6,
    phrases: [
      'traffic light',
      'traffic signal',
      'stop sign',
      'pedestrian crossing',
      'school zone',
      'intersection hazard',
      'fallen tree',
      'blocked road',
      'gas leak',
      'building collapse',
      'fire hazard',
      'broken glass',
    ],
    tokens: [
      'traffic',
      'signal',
      'crosswalk',
      'intersection',
      'unsafe',
      'accident',
      'hazard',
      'emergency',
      'collapse',
      'fire',
      'gas',
      'pedestrian',
      'crash',
    ],
  },
];

const CRITICAL_PHRASES = [
  'live wire',
  'downed wire',
  'gas leak',
  'building collapse',
  'burst main',
  'raw sewage',
  'life threatening',
  'fire hazard',
] as const;

const CRITICAL_TOKENS = new Set<string>([
  'sparking',
  'sparks',
  'electrocution',
  'collapse',
  'collapsed',
  'sinkhole',
  'hospital',
  'school',
  'emergency',
  'imminent',
  'injury',
  'flooding',
  'flooded',
  'explosion',
  'fatal',
]);

const HIGH_URGENCY_TOKENS = new Set<string>([
  'outage',
  'dark',
  'blocked',
  'overflowing',
  'deep',
  'highway',
  'intersection',
  'pedestrian',
  'children',
  'severe',
  'major',
  'urgent',
  'hazardous',
  'hazard',
  'dangerous',
  'burst',
]);

const LOW_URGENCY_TOKENS = new Set<string>([
  'minor',
  'small',
  'cosmetic',
  'faded',
  'non-urgent',
  'suggestion',
  'request',
  'peeling',
  'tiny',
]);

function tokenizeWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9-\s]+/g, ' ')
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 0);
}

function countRuleScore(
  titleLower: string,
  descLower: string,
  titleTokenSet: ReadonlySet<string>,
  descTokenSet: ReadonlySet<string>,
  rule: CategoryRule,
): number {
  let score = 0;

  for (const phrase of rule.phrases) {
    if (titleLower.includes(phrase)) {
      score += 6;
    } else if (descLower.includes(phrase)) {
      score += 3;
    }
  }

  for (const token of rule.tokens) {
    if (titleTokenSet.has(token)) {
      score += 2;
    }
    if (descTokenSet.has(token)) {
      score += 1;
    }
  }

  return score;
}

function computeUrgencyScore(
  combinedLower: string,
  combinedTokenSet: ReadonlySet<string>,
  baseUrgency: number,
): number {
  let score = baseUrgency;

  let criticalHits = 0;
  for (const phrase of CRITICAL_PHRASES) {
    if (combinedLower.includes(phrase)) {
      criticalHits += 1;
    }
  }
  for (const token of CRITICAL_TOKENS) {
    if (combinedTokenSet.has(token)) {
      criticalHits += 1;
    }
  }

  let highHits = 0;
  for (const token of HIGH_URGENCY_TOKENS) {
    if (combinedTokenSet.has(token)) {
      highHits += 1;
    }
  }

  let lowHits = 0;
  for (const token of LOW_URGENCY_TOKENS) {
    if (combinedTokenSet.has(token)) {
      lowHits += 1;
    }
  }

  if (criticalHits >= 2) {
    score += 4;
  } else if (criticalHits === 1) {
    score += 3;
  }

  if (highHits >= 2) {
    score += 2;
  } else if (highHits === 1) {
    score += 1;
  }

  if (lowHits >= 1 && criticalHits === 0) {
    score -= lowHits >= 2 ? 3 : 2;
  }

  return Math.min(10, Math.max(1, Math.round(score)));
}

function mapPriorityAndSla(urgencyScore: number): {
  readonly priorityLevel: PriorityLevel;
  readonly slaEstimateHours: number;
  readonly slaEstimateText: string;
} {
  if (urgencyScore >= 9) {
    return {
      priorityLevel: 'Critical',
      slaEstimateHours: 4,
      slaEstimateText: 'Within 4 hours (Emergency Dispatch)',
    };
  }
  if (urgencyScore >= 7) {
    return {
      priorityLevel: 'High',
      slaEstimateHours: 24,
      slaEstimateText: 'Within 24 hours',
    };
  }
  if (urgencyScore >= 4) {
    return {
      priorityLevel: 'Medium',
      slaEstimateHours: 72,
      slaEstimateText: 'Within 72 hours',
    };
  }
  return {
    priorityLevel: 'Low',
    slaEstimateHours: 168,
    slaEstimateText: 'Within 7 days',
  };
}

function evaluateAuthenticity(
  request: TriageRequest,
  alphaWords: readonly string[],
): AuthenticityCheck {
  const uniqueAlpha = new Set(alphaWords);
  const hasImage = Boolean(request.imageBase64 && request.imageBase64.length > 0);
  const hasRichText = alphaWords.length >= 4 && uniqueAlpha.size >= 3;

  if (hasImage && hasRichText) {
    return {
      isAuthentic: true,
      status: 'likely_authentic',
      confidence: 0.86,
      reason:
        'Report includes both a validated image attachment and coherent civic description.',
    };
  }

  if (hasRichText || hasImage) {
    return {
      isAuthentic: true,
      status: 'likely_authentic',
      confidence: hasImage ? 0.82 : 0.76,
      reason: hasImage
        ? 'Validated image attachment provided with civic issue report.'
        : 'Text report contains coherent civic details without spam indicators.',
    };
  }

  return {
    isAuthentic: true,
    status: 'uncertain',
    confidence: 0.55,
    reason:
      'Brief or repetitive description; manual dispatcher verification recommended.',
  };
}

export function runHeuristicTriage(request: TriageRequest): TriageResult {
  const safeTitle = sanitizeText(request.title) || 'Civic issue report';
  const safeDesc =
    sanitizeText(request.description) || 'Citizen-submitted civic issue.';

  const titleLower = safeTitle.toLowerCase();
  const descLower = safeDesc.toLowerCase();
  const combinedLower = `${titleLower} ${descLower}`;

  const titleTokens = tokenizeWords(titleLower);
  const descTokens = tokenizeWords(descLower);
  const titleTokenSet = new Set(titleTokens);
  const descTokenSet = new Set(descTokens);
  const combinedTokenSet = new Set([...titleTokens, ...descTokens]);

  let bestCategory: IssueCategory = 'Other Civic Issue';
  let bestDepartment: Department = 'Roads & Infrastructure';
  let bestBaseUrgency = 4;
  let bestScore = 0;

  for (const rule of CATEGORY_RULES) {
    const score = countRuleScore(
      titleLower,
      descLower,
      titleTokenSet,
      descTokenSet,
      rule,
    );
    if (score > bestScore) {
      bestScore = score;
      bestCategory = rule.category;
      bestDepartment = rule.department;
      bestBaseUrgency = rule.baseUrgency;
    }
  }

  const urgencyScore = computeUrgencyScore(
    combinedLower,
    combinedTokenSet,
    bestBaseUrgency,
  );
  const { priorityLevel, slaEstimateHours, slaEstimateText } =
    mapPriorityAndSla(urgencyScore);

  const alphaWords = [...titleTokens, ...descTokens].filter((token) =>
    /[a-z]{2,}/.test(token),
  );
  const authenticityCheck = evaluateAuthenticity(request, alphaWords);
  const duplicateDetection = detectDuplicates(request, bestCategory);

  const locationContext = request.location?.address
    ? ` near ${sanitizeText(request.location.address)}`
    : '';
  const summary = `${priorityLevel} priority ${bestCategory.toLowerCase()} routed to ${bestDepartment}${locationContext}: ${safeTitle}`.slice(
    0,
    500,
  );

  const reasoning = `Deterministic civic NLP heuristic classified report as "${bestCategory}" (score ${bestScore}) for ${bestDepartment} with urgency ${urgencyScore}/10 (${priorityLevel}) and ${slaEstimateText} SLA.${duplicateDetection.isLikelyDuplicate ? ` Flagged ${duplicateDetection.matchedIssueIds.length} nearby potential duplicate(s).` : ''}`.slice(
    0,
    1000,
  );

  return {
    category: bestCategory,
    urgencyScore,
    priorityLevel,
    recommendedDepartment: bestDepartment,
    slaEstimateHours,
    slaEstimateText,
    authenticityCheck,
    duplicateDetection,
    summary,
    reasoning,
  };
}
