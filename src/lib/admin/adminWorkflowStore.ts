import { z } from 'zod';
import { DepartmentSchema } from '../../../shared/schemas/triage.js';
import type { Department } from '../../../shared/types/civic.js';
import { generateSecureId } from '../utils/secureId.js';

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

function stripUnsafeText(input: string, maxLen: number): string {
  let out = '';
  for (let i = 0; i < input.length; i += 1) {
    const code = input.charCodeAt(i);
    const ch = input.charAt(i);
    if (code >= 32 && code !== 127 && ch !== '<' && ch !== '>') {
      out += ch;
    } else if (code < 32 || code === 127) {
      out += ' ';
    }
  }
  return out.trim().slice(0, maxLen);
}

const DepartmentTransferRequestSchema = z.object({
  id: z.string().min(1).max(80),
  issueId: z.string().min(1).max(128),
  issueTitle: z.string().min(1).max(160),
  fromDepartment: DepartmentSchema,
  toDepartment: DepartmentSchema,
  reason: z.string().min(1).max(240),
  requestedBy: z.string().min(1).max(80),
  createdAt: z.string().min(1).max(64),
  status: z.enum(['Pending', 'Approved', 'Rejected']),
  reviewedBy: z.string().max(80).nullable(),
  reviewedAt: z.string().max(64).nullable(),
});

const MunicipalAuditEntrySchema = z.object({
  id: z.string().min(1).max(80),
  issueId: z.string().min(1).max(128),
  issueTitle: z.string().min(1).max(160),
  actorName: z.string().min(1).max(80),
  actorScope: z.string().min(1).max(80),
  action: z.string().min(1).max(80),
  details: z.string().min(1).max(280),
  timestamp: z.string().min(1).max(64),
});

function safeReadJson(key: string): unknown {
  if (typeof window === 'undefined' || !window.localStorage) {
    return [];
  }
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) {
      return [];
    }
    return JSON.parse(raw) as unknown;
  } catch {
    return [];
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
  const parsed = safeReadJson(TRANSFER_STORAGE_KEY);
  if (!Array.isArray(parsed)) {
    return [];
  }
  const valid: DepartmentTransferRequest[] = [];
  for (const item of parsed) {
    const res = DepartmentTransferRequestSchema.safeParse(item);
    if (res.success) {
      valid.push(res.data);
    }
  }
  return valid;
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
    id: generateSecureId('tr'),
    issueId: stripUnsafeText(input.issueId, 128) || 'unknown',
    issueTitle: stripUnsafeText(input.issueTitle, 160) || 'Civic Issue',
    fromDepartment: input.fromDepartment,
    toDepartment: input.toDepartment,
    reason:
      stripUnsafeText(input.reason, 240) ||
      `Handover requested to ${input.toDepartment}`,
    requestedBy: stripUnsafeText(input.requestedBy, 80) || 'Municipal Officer',
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
  const cleanReviewer = stripUnsafeText(reviewedBy, 80) || 'City Ops Admin';
  const updated = existing.map((req) =>
    req.id === requestId
      ? {
          ...req,
          status: decision,
          reviewedBy: cleanReviewer,
          reviewedAt: nowIso,
        }
      : req,
  );
  safeWriteJson(TRANSFER_STORAGE_KEY, updated);
  return updated;
}

export function loadAuditLog(): MunicipalAuditEntry[] {
  const parsed = safeReadJson(AUDIT_STORAGE_KEY);
  if (!Array.isArray(parsed)) {
    return [];
  }
  const valid: MunicipalAuditEntry[] = [];
  for (const item of parsed) {
    const res = MunicipalAuditEntrySchema.safeParse(item);
    if (res.success) {
      valid.push(res.data);
    }
  }
  return valid;
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
    id: generateSecureId('aud'),
    issueId: stripUnsafeText(input.issueId, 128) || 'unknown',
    issueTitle: stripUnsafeText(input.issueTitle, 160) || 'Civic Issue',
    actorName: stripUnsafeText(input.actorName, 80) || 'Municipal Officer',
    actorScope: stripUnsafeText(input.actorScope, 80) || 'Municipal Scope',
    action: stripUnsafeText(input.action, 80) || 'ACTION',
    details: stripUnsafeText(input.details, 280) || 'Updated ticket',
    timestamp: new Date().toISOString(),
  };
  const updated = [entry, ...existing].slice(0, MAX_AUDIT_ENTRIES);
  safeWriteJson(AUDIT_STORAGE_KEY, updated);
  return updated;
}
