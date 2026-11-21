import {
  DEPARTMENTS,
  type CivicIssue,
  type Department,
  type PriorityLevel,
} from '../../../shared/types/civic.js';
import { computeSlaStatus } from './slaUtils.js';

export interface DaySeriesPoint {
  readonly label: string;
  readonly reported: number;
  readonly resolved: number;
}

export interface CivicAnalyticsSummary {
  readonly total: number;
  readonly open: number;
  readonly inProgress: number;
  readonly resolved: number;
  readonly overdue: number;
  readonly resolutionRate: number;
  readonly avgUrgency: string;
  readonly totalUpvotes: number;
  readonly slaHealthScore: number;
  readonly topPriorityIssue: CivicIssue | null;
  readonly priorityCounts: ReadonlyMap<PriorityLevel, number>;
  readonly trendPoints: ReadonlyArray<DaySeriesPoint>;
  readonly activeDepartmentCount: number;
}

export const ORDERED_PRIORITY_LEVELS: ReadonlyArray<PriorityLevel> = [
  'Critical',
  'High',
  'Medium',
  'Low',
];

export function getPriorityBarColor(level: PriorityLevel): string {
  switch (level) {
    case 'Critical':
      return '#dc2626';
    case 'High':
      return '#d97706';
    case 'Medium':
      return '#3730a3';
    case 'Low':
      return '#0f766e';
  }
}

export function computeCivicAnalytics(
  issues: ReadonlyArray<CivicIssue>,
  scopedDepartment: Department | null = null,
): CivicAnalyticsSummary {
  const total = issues.length;
  let resolved = 0;
  let inProgress = 0;
  let overdue = 0;
  let urgencySum = 0;
  let totalUpvotes = 0;
  let topPriorityIssue: CivicIssue | null = null;

  const priorityCounts = new Map<PriorityLevel, number>([
    ['Critical', 0],
    ['High', 0],
    ['Medium', 0],
    ['Low', 0],
  ]);

  for (const issue of issues) {
    urgencySum += issue.urgencyScore;
    totalUpvotes += issue.upvoteCount;
    priorityCounts.set(
      issue.priorityLevel,
      (priorityCounts.get(issue.priorityLevel) ?? 0) + 1,
    );

    if (issue.status === 'Resolved') {
      resolved += 1;
    } else {
      if (issue.status === 'In Progress') {
        inProgress += 1;
      }
      if (computeSlaStatus(issue).isOverdue) {
        overdue += 1;
      }
      if (
        topPriorityIssue === null ||
        issue.urgencyScore > topPriorityIssue.urgencyScore
      ) {
        topPriorityIssue = issue;
      }
    }
  }

  const open = total - resolved;
  const resolutionRate = total > 0 ? Math.round((resolved / total) * 100) : 100;
  const avgUrgency = total > 0 ? (urgencySum / total).toFixed(1) : '0.0';
  const onTimeOpen = Math.max(0, open - overdue);
  const slaHealthScore =
    total === 0
      ? 100
      : Math.max(
          18,
          Math.min(
            100,
            Math.round(
              52 +
                resolutionRate * 0.42 +
                (open > 0 ? (onTimeOpen / open) * 12 : 12) -
                overdue * 7,
            ),
          ),
        );

  const maxCreatedMs = issues.reduce((max, item) => {
    const parsed = Date.parse(item.createdAt);
    return Number.isFinite(parsed) && parsed > max ? parsed : max;
  }, Date.UTC(2026, 10, 21));

  const trendPoints: DaySeriesPoint[] = [];
  for (let offset = 5; offset >= 0; offset -= 1) {
    const dayEnd = maxCreatedMs - offset * 24 * 60 * 60 * 1000;
    const dayStart = dayEnd - 24 * 60 * 60 * 1000;
    let rep = 0;
    let res = 0;
    for (const item of issues) {
      const createdMs = Date.parse(item.createdAt);
      if (createdMs > dayStart && createdMs <= dayEnd) {
        rep += 1;
      }
      if (item.resolvedAt) {
        const resolvedMs = Date.parse(item.resolvedAt);
        if (resolvedMs > dayStart && resolvedMs <= dayEnd) {
          res += 1;
        }
      }
    }
    const d = new Date(dayEnd);
    trendPoints.push({
      label: `${d.getUTCMonth() + 1}/${d.getUTCDate()}`,
      reported: rep,
      resolved: res,
    });
  }

  const activeDepartmentCount = scopedDepartment ? 1 : DEPARTMENTS.length;

  return {
    total,
    open,
    inProgress,
    resolved,
    overdue,
    resolutionRate,
    avgUrgency,
    totalUpvotes,
    slaHealthScore,
    topPriorityIssue,
    priorityCounts,
    trendPoints,
    activeDepartmentCount,
  };
}
