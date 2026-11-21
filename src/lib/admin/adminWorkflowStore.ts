import type { Department } from '../../../shared/types/civic.js';

export type TransferRequestStatus = 'Pending' | 'Approved' | 'Rejected';

export interface DepartmentTransferRequest {
  readonly id: string;
  readonly issueId: string;
  readonly issueTitle: string;
  readonly fromDepartment: Department;
  readonly toDepartment: Department;
  readonly reason: string;
  readonly requestedBy: string;
  readonly createdAt: string;
  readonly status: TransferRequestStatus;
  readonly reviewedBy: string | null;
  readonly reviewedAt: string | null;
}

export interface MunicipalAuditEntry {
  readonly id: string;
  readonly issueId: string;
  readonly issueTitle: string;
  readonly actorName: string;
  readonly actorScope: string;
  readonly action: string;
  readonly details: string;
  readonly timestamp: string;
}

const TRANSFER_STORAGE_KEY = 'civicresolve.transferRequests.v1';
const AUDIT_STORAGE_KEY = 'civicresolve.auditLog.v1';
const MAX_AUDIT_ENTRIES = 100;

function safeReadJson<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined' || !window.localStorage) {
    return fallback;
  }
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) {
      return fallback;
    }
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function safeWriteJson(key: string, value: unknown): void {
  if (typeof window === 'undefined' || !window.localStorage) {
    return;
  }
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore storage quota errors
  }
}

export function loadTransferRequests(): DepartmentTransferRequest[] {
  const parsed = safeReadJson<unknown>(TRANSFER_STORAGE_KEY, []);
  return Array.isArray(parsed) ? (parsed as DepartmentTransferRequest[]) : [];
}

export function createTransferRequest(input: {
  readonly issueId: string;
  readonly issueTitle: string;
  readonly fromDepartment: Department;
  readonly toDepartment: Department;
  readonly reason: string;
  readonly requestedBy: string;
}): DepartmentTransferRequest[] {
  const existing = loadTransferRequests();
  const next: DepartmentTransferRequest = {
    id: `tr_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    issueId: input.issueId,
    issueTitle: input.issueTitle,
    fromDepartment: input.fromDepartment,
    toDepartment: input.toDepartment,
    reason: input.reason.trim().slice(0, 240),
    requestedBy: input.requestedBy,
    createdAt: new Date().toISOString(),
    status: 'Pending',
    reviewedBy: null,
    reviewedAt: null,
  };
  const updated = [next, ...existing].slice(0, 50);
  safeWriteJson(TRANSFER_STORAGE_KEY, updated);
  return updated;
}

export function resolveTransferRequest(
  requestId: string,
  decision: 'Approved' | 'Rejected',
  reviewedBy: string,
): DepartmentTransferRequest[] {
  const existing = loadTransferRequests();
  const nowIso = new Date().toISOString();
  const updated = existing.map((req) =>
    req.id === requestId
      ? {
          ...req,
          status: decision,
          reviewedBy,
          reviewedAt: nowIso,
        }
      : req,
  );
  safeWriteJson(TRANSFER_STORAGE_KEY, updated);
  return updated;
}

export function loadAuditLog(): MunicipalAuditEntry[] {
  const parsed = safeReadJson<unknown>(AUDIT_STORAGE_KEY, []);
  return Array.isArray(parsed) ? (parsed as MunicipalAuditEntry[]) : [];
}

export function appendAuditEntry(input: {
  readonly issueId: string;
  readonly issueTitle: string;
  readonly actorName: string;
  readonly actorScope: string;
  readonly action: string;
  readonly details: string;
}): MunicipalAuditEntry[] {
  const existing = loadAuditLog();
  const entry: MunicipalAuditEntry = {
    id: `aud_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    issueId: input.issueId,
    issueTitle: input.issueTitle,
    actorName: input.actorName,
    actorScope: input.actorScope,
    action: input.action,
    details: input.details.slice(0, 280),
    timestamp: new Date().toISOString(),
  };
  const updated = [entry, ...existing].slice(0, MAX_AUDIT_ENTRIES);
  safeWriteJson(AUDIT_STORAGE_KEY, updated);
  return updated;
}
