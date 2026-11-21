import type { CivicIssue } from '../../../shared/types/civic.js';
import { validateStoredWebpImage } from '../media/imageValidation.js';

const RESOLUTION_PHOTOS_KEY = 'civicresolve.resolutionPhotos.v1';

/**
 * Prevents CSV Formula Injection (OWASP) by neutralizing cells starting with =, +, -, @, tab, or CR.
 */
export function escapeCsvCell(raw: string | number | null | undefined): string {
  const str = raw === null || raw === undefined ? '' : String(raw);
  const neutralized = /^[=+\-@\t\r]/.test(str) ? `'${str}` : str;
  const escapedQuotes = neutralized.replace(/"/g, '""');
  return `"${escapedQuotes}"`;
}

export function buildIssuesCsv(issues: ReadonlyArray<CivicIssue>): string {
  const headers = [
    'Tracking ID',
    'Title',
    'Category',
    'Status',
    'Priority',
    'Urgency (1-10)',
    'Assigned Department',
    'Location Address',
    'SLA Hours',
    'Upvotes',
    'Resolution Notes',
    'Created At',
  ];

  const rows = issues.map((issue) =>
    [
      issue.id,
      issue.title,
      issue.category,
      issue.status,
      issue.priorityLevel,
      issue.urgencyScore,
      issue.assignedDepartment,
      issue.location.address,
      issue.slaEstimateHours,
      issue.upvoteCount,
      issue.resolutionNotes ?? '',
      issue.createdAt,
    ]
      .map(escapeCsvCell)
      .join(','),
  );

  return [headers.map(escapeCsvCell).join(','), ...rows].join('\r\n');
}

export function downloadCsvFile(csvContent: string, filename: string): void {
  if (typeof document === 'undefined' || typeof URL.createObjectURL !== 'function') {
    return;
  }
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

export function buildOfficialReceiptText(issue: CivicIssue): string {
  return [
    '====================================================',
    '       CIVICRESOLVE — OFFICIAL MUNICIPAL RECEIPT     ',
    '====================================================',
    `Tracking ID : ${issue.id}`,
    `Submitted   : ${issue.createdAt}`,
    `Status      : ${issue.status}`,
    `Category    : ${issue.category}`,
    `Priority    : ${issue.priorityLevel} (Urgency ${issue.urgencyScore}/10)`,
    `Department  : ${issue.assignedDepartment}`,
    `Target SLA  : ${issue.slaEstimateHours} hours (${issue.slaSummary})`,
    `Location    : ${issue.location.address} (${issue.location.lat.toFixed(4)}, ${issue.location.lng.toFixed(4)})`,
    `Reporter    : ${issue.reporterDisplayName}`,
    '----------------------------------------------------',
    `Title       : ${issue.title}`,
    `Details     : ${issue.description}`,
    ...(issue.resolutionNotes
      ? [`Resolution  : ${issue.resolutionNotes}`]
      : []),
    '====================================================',
  ].join('\n');
}

export function downloadOfficialReceipt(issue: CivicIssue): void {
  if (typeof document === 'undefined' || typeof URL.createObjectURL !== 'function') {
    return;
  }
  const receiptText = buildOfficialReceiptText(issue);
  const blob = new Blob([receiptText], { type: 'text/plain;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `CivicResolve-Receipt-${issue.id}.txt`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

export function loadResolutionPhotosMap(): Record<string, string> {
  if (typeof window === 'undefined' || !('localStorage' in window)) {
    return {};
  }
  try {
    const raw = window.localStorage.getItem(RESOLUTION_PHOTOS_KEY);
    if (!raw) {
      return {};
    }
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) {
      return {};
    }
    const safeMap: Record<string, string> = {};
    for (const [key, val] of Object.entries(parsed)) {
      if (typeof val === 'string' && validateStoredWebpImage(val).valid) {
        Reflect.set(safeMap, key, val);
      }
    }
    return safeMap;
  } catch {
    return {};
  }
}

export function saveResolutionPhoto(
  issueId: string,
  webpDataUrl: string,
): Record<string, string> {
  const check = validateStoredWebpImage(webpDataUrl);
  if (!check.valid) {
    throw new Error(check.reason);
  }
  const current = loadResolutionPhotosMap();
  Reflect.set(current, issueId, webpDataUrl);
  if (typeof window !== 'undefined' && 'localStorage' in window) {
    try {
      window.localStorage.setItem(RESOLUTION_PHOTOS_KEY, JSON.stringify(current));
    } catch {
      // Ignore quota errors gracefully
    }
  }
  return current;
}
