import type {
  CivicIssue,
  IssueStatus,
  PriorityLevel,
} from '../../../shared/types/civic.js';
import {
  translateDepartment,
  translatePriority,
  translateStatus,
  type AppLanguage,
} from '../i18n/translations.js';

export function getPriorityDotClass(priority: PriorityLevel): string {
  switch (priority) {
    case 'Critical':
      return 'bg-red-600';
    case 'High':
      return 'bg-amber-600';
    case 'Medium':
      return 'bg-indigo-700';
    case 'Low':
    default:
      return 'bg-slate-500';
  }
}

export function getStatusStepIndex(status: IssueStatus): 1 | 2 | 3 {
  switch (status) {
    case 'Reported':
      return 1;
    case 'In Progress':
      return 2;
    case 'Resolved':
      return 3;
  }
}

export function tokenizeSearchQuery(query: string): string[] {
  return query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter((token) => token.length > 0);
}

export function matchesIssueSearchTokens(
  issue: CivicIssue,
  tokens: ReadonlyArray<string>,
  language: AppLanguage,
): boolean {
  if (tokens.length === 0) {
    return true;
  }
  const haystack = [
    issue.id,
    issue.title,
    issue.description,
    issue.category,
    issue.location.address,
    issue.assignedDepartment,
    issue.recommendedDepartment,
    issue.priorityLevel,
    issue.status,
    issue.reporterDisplayName,
    issue.resolutionNotes ?? '',
    translateDepartment(issue.assignedDepartment, language),
    translatePriority(issue.priorityLevel, language),
    translateStatus(issue.status, language),
  ]
    .join(' ')
    .toLowerCase();

  return tokens.every((token) => haystack.includes(token));
}
