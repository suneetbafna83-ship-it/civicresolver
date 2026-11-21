import type { CivicIssue } from '../../../shared/types/civic.js';

export interface SlaStatusInfo {
  readonly label: string;
  readonly isOverdue: boolean;
  readonly isResolved: boolean;
}

export function computeSlaStatus(
  issue: Pick<CivicIssue, 'createdAt' | 'slaEstimateHours' | 'status' | 'resolvedAt'>,
  nowMs = Date.now(),
): SlaStatusInfo {
  if (issue.status === 'Resolved') {
    return {
      label: 'Resolved · SLA Closed',
      isOverdue: false,
      isResolved: true,
    };
  }

  const createdMs = Date.parse(issue.createdAt);
  if (!Number.isFinite(createdMs)) {
    return {
      label: `SLA: ${issue.slaEstimateHours}h`,
      isOverdue: false,
      isResolved: false,
    };
  }

  const deadlineMs = createdMs + issue.slaEstimateHours * 3_600_000;
  const diffMs = deadlineMs - nowMs;

  if (diffMs <= 0) {
    const overdueHours = Math.max(1, Math.floor(Math.abs(diffMs) / 3_600_000));
    return {
      label: `OVERDUE (${overdueHours}h) · Escalated`,
      isOverdue: true,
      isResolved: false,
    };
  }

  const hoursLeft = Math.floor(diffMs / 3_600_000);
  const minsLeft = Math.floor((diffMs % 3_600_000) / 60_000);
  return {
    label: `${hoursLeft}h ${minsLeft}m left`,
    isOverdue: false,
    isResolved: false,
  };
}
