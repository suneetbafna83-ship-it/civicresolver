import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRightLeft,
  Building2,
  Camera,
  CheckCircle2,
  Clock,
  Download,
  History,
  Lock,
  MapPin,
  Save,
  ShieldAlert,
  ShieldCheck,
  UserCheck,
  XCircle,
} from 'lucide-react';
import {
  DEPARTMENTS,
  ISSUE_STATUSES,
  type CivicIssue,
  type CivicSession,
  type Department,
  type IssueAdminUpdateInput,
  type IssueStatus,
  type PriorityLevel,
} from '../../../shared/types/civic.js';
import {
  appendAuditEntry,
  createTransferRequest,
  loadAuditLog,
  loadTransferRequests,
  resolveTransferRequest,
  type DepartmentTransferRequest,
  type MunicipalAuditEntry,
} from '../../lib/admin/adminWorkflowStore.js';
import {
  buildIssuesCsv,
  downloadCsvFile,
} from '../../lib/export/civicExport.js';
import {
  getUiStrings,
  translateDepartment,
  translatePriority,
  translateStatus,
  type AppLanguage,
} from '../../lib/i18n/translations.js';
import { compressImageFileToWebp } from '../../lib/media/imageCompressor.js';
import { computeSlaStatus } from '../../lib/utils/slaUtils.js';
import { BionisAnalyticsRow } from '../dashboard/BionisAnalyticsRow.js';

function getPriorityDotClass(priority: PriorityLevel): string {
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

export interface AdminDashboardViewProps {
  readonly issues: ReadonlyArray<CivicIssue>;
  readonly session: CivicSession | null;
  readonly resolutionPhotos: Readonly<Record<string, string>>;
  readonly language?: AppLanguage;
  readonly onAttachResolutionPhoto: (issueId: string, webpDataUrl: string) => void;
  readonly onEnableDemoAdmin: () => Promise<void>;
  readonly onUpdateIssue: (
    issueId: string,
    patch: IssueAdminUpdateInput,
  ) => Promise<void>;
}

export function AdminDashboardView({
  issues,
  session,
  resolutionPhotos,
  language = 'en',
  onAttachResolutionPhoto,
  onEnableDemoAdmin,
  onUpdateIssue,
}: AdminDashboardViewProps): React.ReactElement {
  const t = getUiStrings(language);
  const isAdmin = session?.role === 'admin';
  const scopedDepartment: Department | null =
    isAdmin && session.assignedDepartment ? session.assignedDepartment : null;
  const actorName = session?.displayName ?? 'Municipal Officer';
  const actorScope = scopedDepartment ?? 'City Ops Super Admin';

  const [selectedDepartment, setSelectedDepartment] = useState<
    Department | 'ALL'
  >('ALL');
  const [selectedStatus, setSelectedStatus] = useState<IssueStatus | 'ALL'>(
    'ALL',
  );
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [showAuditLog, setShowAuditLog] = useState(false);

  const [draftNotes, setDraftNotes] = useState<Map<string, string>>(
    () => new Map(),
  );
  const [draftDepartments, setDraftDepartments] = useState<
    Map<string, Department>
  >(() => new Map());
  const [transferDraftDept, setTransferDraftDept] = useState<
    Map<string, Department>
  >(() => new Map());
  const [transferDraftReason, setTransferDraftReason] = useState<
    Map<string, string>
  >(() => new Map());
  const [openTransferIssueId, setOpenTransferIssueId] = useState<string | null>(
    null,
  );

  const [transferRequests, setTransferRequests] = useState<
    DepartmentTransferRequest[]
  >(() => loadTransferRequests());
  const [auditEntries, setAuditEntries] = useState<MunicipalAuditEntry[]>(() =>
    loadAuditLog(),
  );

  const [savingIssueId, setSavingIssueId] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const scopeFilteredIssues = useMemo(() => {
    if (scopedDepartment === null) {
      return issues;
    }
    return issues.filter(
      (issue) => issue.assignedDepartment === scopedDepartment,
    );
  }, [issues, scopedDepartment]);

  const overdueCount = useMemo(
    () =>
      scopeFilteredIssues.filter(
        (issue) => issue.status !== 'Resolved' && computeSlaStatus(issue).isOverdue,
      ).length,
    [scopeFilteredIssues],
  );

  const pendingTransfers = useMemo(
    () =>
      transferRequests.filter((req) => {
        if (req.status !== 'Pending') {
          return false;
        }
        if (scopedDepartment !== null) {
          return req.fromDepartment === scopedDepartment;
        }
        return true;
      }),
    [scopedDepartment, transferRequests],
  );

  const effectiveDepartment =
    scopedDepartment !== null ? scopedDepartment : selectedDepartment;

  const sortedIssues = useMemo(() => {
    const filtered = scopeFilteredIssues.filter((issue) => {
      if (
        effectiveDepartment !== 'ALL' &&
        issue.assignedDepartment !== effectiveDepartment
      ) {
        return false;
      }
      if (selectedStatus !== 'ALL' && issue.status !== selectedStatus) {
        return false;
      }
      if (
        overdueOnly &&
        (issue.status === 'Resolved' || !computeSlaStatus(issue).isOverdue)
      ) {
        return false;
      }
      return true;
    });

    return [...filtered].sort((a, b) => {
      if (a.status === 'Resolved' && b.status !== 'Resolved') {
        return 1;
      }
      if (a.status !== 'Resolved' && b.status === 'Resolved') {
        return -1;
      }
      if (b.urgencyScore !== a.urgencyScore) {
        return b.urgencyScore - a.urgencyScore;
      }
      return b.upvoteCount - a.upvoteCount;
    });
  }, [effectiveDepartment, overdueOnly, scopeFilteredIssues, selectedStatus]);

  const recordAudit = (
    issue: { readonly id: string; readonly title: string },
    action: string,
    details: string,
  ): void => {
    setAuditEntries(
      appendAuditEntry({
        issueId: issue.id,
        issueTitle: issue.title,
        actorName,
        actorScope,
        action,
        details,
      }),
    );
  };

  const handleQuickStatusUpdate = async (
    issue: CivicIssue,
    nextStatus: IssueStatus,
  ): Promise<void> => {
    setActionError(null);
    setSavingIssueId(issue.id);
    try {
      const customNote = draftNotes.get(issue.id);
      const nextDept =
        scopedDepartment !== null
          ? undefined
          : draftDepartments.get(issue.id);
      await onUpdateIssue(issue.id, {
        status: nextStatus,
        ...(nextDept ? { assignedDepartment: nextDept } : {}),
        ...(customNote !== undefined
          ? { resolutionNotes: customNote.trim() || null }
          : {}),
      });
      recordAudit(
        issue,
        `STATUS -> ${nextStatus}`,
        `Transitioned from ${issue.status} to ${nextStatus}`,
      );
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : 'Status update failed.',
      );
    } finally {
      setSavingIssueId(null);
    }
  };

  const handleSaveNotesAndDepartment = async (
    issue: CivicIssue,
  ): Promise<void> => {
    setActionError(null);
    setSavingIssueId(issue.id);
    try {
      const noteValue = draftNotes.get(issue.id) ?? issue.resolutionNotes ?? '';
      const deptValue =
        scopedDepartment !== null
          ? issue.assignedDepartment
          : (draftDepartments.get(issue.id) ?? issue.assignedDepartment);
      await onUpdateIssue(issue.id, {
        ...(scopedDepartment === null ? { assignedDepartment: deptValue } : {}),
        resolutionNotes: noteValue.trim().length > 0 ? noteValue.trim() : null,
      });
      recordAudit(
        issue,
        'DISPATCH_UPDATE',
        `Saved note & department (${deptValue})`,
      );
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : 'Could not save admin update.',
      );
    } finally {
      setSavingIssueId(null);
    }
  };

  const handleResolutionPhotoUpload = async (
    issue: CivicIssue,
    event: React.ChangeEvent<HTMLInputElement>,
  ): Promise<void> => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    setPhotoError(null);
    try {
      const compressed = await compressImageFileToWebp(file);
      onAttachResolutionPhoto(issue.id, compressed.dataUrl);
      recordAudit(
        issue,
        'AFTER_REPAIR_PROOF',
        `Attached compressed WebP repair proof (${Math.round(compressed.compressedBytes / 1024)} KB)`,
      );
    } catch (err) {
      setPhotoError(
        err instanceof Error
          ? err.message
          : 'Could not compress after-repair photo.',
      );
    }
  };

  const handleSubmitTransferRequest = (issue: CivicIssue): void => {
    const fallbackTarget =
      DEPARTMENTS.find((d) => d !== issue.assignedDepartment) ??
      'Roads & Infrastructure';
    const targetDept = transferDraftDept.get(issue.id) ?? fallbackTarget;
    const reason =
      transferDraftReason.get(issue.id)?.trim() ||
      `Field inspection completed by ${issue.assignedDepartment}; handover requested for ${targetDept}.`;

    const updated = createTransferRequest({
      issueId: issue.id,
      issueTitle: issue.title,
      fromDepartment: issue.assignedDepartment,
      toDepartment: targetDept,
      reason,
      requestedBy: actorName,
    });
    setTransferRequests(updated);
    setOpenTransferIssueId(null);
    recordAudit(
      issue,
      'TRANSFER_REQUESTED',
      `Requested handover: ${issue.assignedDepartment} -> ${targetDept} (${reason})`,
    );
  };

  const handleDecisionTransferRequest = async (
    req: DepartmentTransferRequest,
    decision: 'Approved' | 'Rejected',
  ): Promise<void> => {
    setActionError(null);
    try {
      if (decision === 'Approved') {
        await onUpdateIssue(req.issueId, {
          assignedDepartment: req.toDepartment,
          resolutionNotes: `Handover approved by ${actorName} (${req.fromDepartment} -> ${req.toDepartment}): ${req.reason}`,
        });
      }
      setTransferRequests(
        resolveTransferRequest(req.id, decision, actorName),
      );
      recordAudit(
        { id: req.issueId, title: req.issueTitle },
        `TRANSFER_${decision.toUpperCase()}`,
        `${req.fromDepartment} -> ${req.toDepartment} (${decision} by ${actorName})`,
      );
    } catch (err) {
      setActionError(
        err instanceof Error
          ? err.message
          : 'Failed to process department transfer request.',
      );
    }
  };

  return (
    <section
      aria-labelledby="admin-heading"
      className="mx-auto max-w-6xl px-4 py-5 sm:px-6 sm:py-6"
    >
      {/* Header + CSV Export + Audit Log Toggle */}
      <div className="mb-5 flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <h1
              id="admin-heading"
              className="text-xl font-bold tracking-tight sm:text-2xl"
            >
              <span className="text-slate-500 dark:text-slate-400">
                {t.adminLead}{' '}
              </span>
              <span className="text-[#11131a] dark:text-white">
                {t.adminTitle}
              </span>
            </h1>
            <span className="rounded-full bg-[#581c87] px-3 py-1 text-xs font-semibold text-white">
              AI Urgency Queue (10 → 1)
            </span>
          </div>
          <p className="mt-1 max-w-2xl text-xs leading-relaxed text-slate-700 sm:text-sm dark:text-slate-300">
            {scopedDepartment !== null
              ? t.adminSubtitleScoped
              : t.adminSubtitleAll}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setShowAuditLog((prev) => !prev)}
            className="press-feedback inline-flex min-h-[40px] items-center gap-1.5 rounded-full border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-[#11131a] hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
          >
            <History className="h-3.5 w-3.5" aria-hidden="true" />
            <span>
              {t.auditLogTitle} ({auditEntries.length})
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              const csv = buildIssuesCsv(sortedIssues);
              downloadCsvFile(
                csv,
                `CivicResolve-Queue-${new Date().toISOString().slice(0, 10)}.csv`,
              );
            }}
            className="press-feedback inline-flex min-h-[40px] items-center gap-1.5 rounded-full bg-[#581c87] px-4 py-2 text-xs font-semibold text-white hover:bg-[#4c1d95]"
          >
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{t.exportCsvBtn}</span>
          </button>

          {isAdmin ? (
            <div className="inline-flex min-h-[40px] items-center gap-1.5 rounded-full border border-emerald-600/30 bg-emerald-500/15 px-3.5 py-2 text-xs font-bold text-emerald-900 dark:text-emerald-200">
              <ShieldCheck className="h-4 w-4" aria-hidden="true" />
              <span>{actorName}</span>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => void onEnableDemoAdmin()}
              className="press-feedback inline-flex min-h-[40px] items-center gap-1.5 rounded-full bg-[#11131a] px-4 py-2 text-xs font-semibold text-white"
            >
              <UserCheck className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Unlock 1-Click Demo Admin</span>
            </button>
          )}
        </div>
      </div>

      {/* Explicit Department RBAC Lock Banner for Scoped Staff */}
      {scopedDepartment !== null && (
        <div
          role="status"
          className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-indigo-300/80 bg-indigo-500/[0.08] px-4 py-3 text-xs dark:border-indigo-800/80 dark:bg-indigo-500/15"
        >
          <div className="flex items-center gap-2.5 font-semibold text-[#3730a3] dark:text-indigo-200">
            <Lock className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>
              <strong>
                {translateDepartment(scopedDepartment, language)} Staff Scope Enforced:
              </strong>{' '}
              Other municipal departments are isolated and blocked across queries, repositories, and Firestore security rules.
            </span>
          </div>
          <span className="rounded-full bg-[#11131a] px-3 py-1 text-[11px] font-bold text-white dark:bg-white dark:text-[#11131a]">
            Locked: {translateDepartment(scopedDepartment, language)}
          </span>
        </div>
      )}

      {/* Auto-Escalation SLA Alert Banner */}
      {overdueCount > 0 && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-red-300/80 bg-red-500/[0.08] px-4 py-3 text-xs dark:border-red-900/70 dark:bg-red-950/35">
          <div className="flex items-center gap-2 font-bold text-red-900 dark:text-red-200">
            <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>
              Auto-Escalation Alert: {overdueCount} active ticket
              {overdueCount > 1 ? 's have' : ' has'} breached SLA deadline.
            </span>
          </div>
          <button
            type="button"
            onClick={() => setOverdueOnly((prev) => !prev)}
            className="press-feedback rounded-full bg-[#11131a] px-3.5 py-1.5 text-[11px] font-bold text-white hover:bg-slate-800 dark:bg-white dark:text-[#11131a]"
          >
            {overdueOnly ? t.showAllQueueBtn : t.overdueOnlyBtn}
          </button>
        </div>
      )}

      {/* Pending Cross-Department Transfer & Handover Queue */}
      {pendingTransfers.length > 0 && (
        <div className="surface-card mb-5 border-amber-300/80 p-4 dark:border-amber-800/70">
          <div className="mb-2.5 flex items-center justify-between gap-2">
            <h2 className="inline-flex items-center gap-1.5 text-xs font-bold tracking-wide text-[#11131a] uppercase dark:text-white">
              <ArrowRightLeft
                className="h-4 w-4 text-amber-600"
                aria-hidden="true"
              />
              <span>
                {t.transferQueueTitle} ({pendingTransfers.length})
              </span>
            </h2>
          </div>

          <div className="flex flex-col gap-2">
            {pendingTransfers.map((req) => (
              <div
                key={req.id}
                className="surface-well flex flex-wrap items-center justify-between gap-3 p-3 text-xs"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-[#11131a] dark:text-white">
                    {req.issueTitle}
                  </p>
                  <p className="mt-0.5 text-[11px] text-slate-600 dark:text-slate-300">
                    {translateDepartment(req.fromDepartment, language)} →{' '}
                    <strong>
                      {translateDepartment(req.toDepartment, language)}
                    </strong>{' '}
                    · {req.reason} ({req.requestedBy})
                  </p>
                </div>

                {scopedDepartment === null ? (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        void handleDecisionTransferRequest(req, 'Approved')
                      }
                      className="press-feedback inline-flex min-h-[34px] items-center gap-1 rounded-full bg-[#11131a] px-3 py-1 text-[11px] font-bold text-white hover:bg-slate-800 dark:bg-white dark:text-[#11131a]"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Approve &amp; Reassign</span>
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        void handleDecisionTransferRequest(req, 'Rejected')
                      }
                      className="press-feedback inline-flex min-h-[34px] items-center gap-1 rounded-full border border-slate-300 bg-white px-3 py-1 text-[11px] font-bold text-red-700 hover:bg-red-50 dark:border-slate-700 dark:bg-slate-900 dark:text-red-300"
                    >
                      <XCircle className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Reject</span>
                    </button>
                  </div>
                ) : (
                  <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-bold text-amber-900 dark:bg-amber-950/70 dark:text-amber-200">
                    Pending City Ops Approval
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Immutable Municipal Audit Trail Drawer */}
      {showAuditLog && (
        <div className="surface-card mb-5 p-4">
          <div className="mb-2.5 flex items-center justify-between">
            <h2 className="inline-flex items-center gap-1.5 text-xs font-bold tracking-wide text-[#11131a] uppercase dark:text-white">
              <History className="h-4 w-4 text-[#3730a3]" aria-hidden="true" />
              <span>{t.auditLogTitle}</span>
            </h2>
            <span className="text-[11px] font-medium text-slate-500">
              Append-Only Session Trail
            </span>
          </div>
          {auditEntries.length === 0 ? (
            <p className="text-xs text-slate-600 dark:text-slate-300">
              No administrative mutations logged yet. Status changes, dispatch notes, proof uploads, and handovers appear here automatically.
            </p>
          ) : (
            <div className="flex max-h-48 flex-col gap-1.5 overflow-y-auto">
              {auditEntries.slice(0, 15).map((entry) => (
                <div
                  key={entry.id}
                  className="surface-well flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-[11px]"
                >
                  <div className="min-w-0">
                    <span className="font-mono font-bold text-[#3730a3] dark:text-indigo-300">
                      [{entry.action}]
                    </span>{' '}
                    <strong className="text-[#11131a] dark:text-white">
                      {entry.issueTitle}
                    </strong>{' '}
                    — {entry.details}
                  </div>
                  <span className="tabular-nums shrink-0 text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                    {entry.actorName} · {entry.timestamp.slice(11, 19)}Z
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Bionis Hero SLA Gauge + 4 KPI Cards + 2 Analytics Charts + 3 Insights */}
      <BionisAnalyticsRow
        issues={scopeFilteredIssues}
        scopeLabel={
          scopedDepartment !== null
            ? `${translateDepartment(scopedDepartment, language)} ${t.onlyTag}`
            : t.allDeptAdminTag
        }
        accent="plum"
        language={language}
        scopedDepartment={scopedDepartment}
      />

      {photoError && (
        <div
          role="alert"
          className="mb-4 rounded-xl border border-red-300 bg-red-50 px-4 py-2.5 text-xs font-semibold text-red-900"
        >
          <ShieldAlert className="mr-1.5 inline h-4 w-4" aria-hidden="true" />
          {photoError}
        </div>
      )}

      {actionError && (
        <div
          role="alert"
          className="mb-4 rounded-xl border border-red-300 bg-red-50 px-4 py-2.5 text-xs font-semibold text-red-900"
        >
          <ShieldAlert className="mr-1.5 inline h-4 w-4" aria-hidden="true" />
          {actionError}
        </div>
      )}

      {/* Department Filter Bar (Black Button for All Departments) */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        {scopedDepartment !== null ? (
          <div
            role="group"
            aria-label="Locked municipal department scope"
            className="flex flex-wrap items-center gap-2"
          >
            <span className="inline-flex min-h-[38px] items-center gap-1.5 rounded-full bg-[#11131a] px-4 py-1.5 text-xs font-semibold text-white shadow-xs dark:bg-white dark:text-[#11131a]">
              <Lock className="h-3.5 w-3.5" aria-hidden="true" />
              <span>
                {translateDepartment(scopedDepartment, language)} {t.onlyTag}
              </span>
            </span>
          </div>
        ) : (
          <div
            role="group"
            aria-label="Filter queue by municipal department"
            className="flex flex-wrap items-center gap-2"
          >
            {(['ALL', ...DEPARTMENTS] as const).map((dept) => {
              const active = selectedDepartment === dept;
              const isAllDept = dept === 'ALL';
              return (
                <button
                  key={dept}
                  type="button"
                  onClick={() => setSelectedDepartment(dept)}
                  className={`press-feedback min-h-[38px] rounded-full px-3.5 py-1.5 text-xs font-semibold ${
                    isAllDept
                      ? active
                        ? 'bg-[#11131a] text-white shadow-xs hover:bg-slate-800 dark:bg-white dark:text-[#11131a]'
                        : 'bg-[#11131a]/85 text-white hover:bg-[#11131a] dark:bg-white/90 dark:text-[#11131a]'
                      : active
                        ? 'bg-[#11131a] text-white shadow-xs dark:bg-white dark:text-[#11131a]'
                        : 'border border-slate-300 bg-white text-[#11131a] hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-white'
                  }`}
                >
                  {isAllDept
                    ? t.allDepartments
                    : translateDepartment(dept, language)}
                </button>
              );
            })}
          </div>
        )}

        <select
          aria-label="Filter admin queue by status"
          value={selectedStatus}
          onChange={(e) =>
            setSelectedStatus(e.target.value as IssueStatus | 'ALL')
          }
          className="min-h-[38px] rounded-full border border-slate-300 bg-white px-4 py-1.5 text-xs font-semibold text-[#11131a] dark:border-slate-700 dark:bg-slate-900 dark:text-white"
        >
          <option value="ALL">{t.allStatuses}</option>
          {ISSUE_STATUSES.map((st) => (
            <option key={st} value={st}>
              {translateStatus(st, language)}
            </option>
          ))}
        </select>
      </div>

      {/* Priority Dispatch Queue */}
      <div className="flex flex-col gap-5">
        {sortedIssues.length === 0 ? (
          <div className="surface-card p-8 text-center">
            <p className="text-sm font-bold text-[#11131a] dark:text-white">
              No active issues found in this department queue
            </p>
            <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
              Adjust the status or SLA filter to inspect remaining tickets.
            </p>
          </div>
        ) : (
          sortedIssues.map((issue) => {
            const isSaving = savingIssueId === issue.id;
            const currentNote =
              draftNotes.get(issue.id) ?? issue.resolutionNotes ?? '';
            const currentDept =
              scopedDepartment !== null
                ? issue.assignedDepartment
                : (draftDepartments.get(issue.id) ?? issue.assignedDepartment);
            const sla = computeSlaStatus(issue);
            const hasAfterPhoto = Boolean(Reflect.get(resolutionPhotos, issue.id));
            const isTransferOpen = openTransferIssueId === issue.id;

            return (
              <article key={issue.id} className="surface-card p-4 sm:p-6">
                <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
                  {/* Left 7 Cols */}
                  <div className="flex flex-col gap-2.5 lg:col-span-7">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-bold text-[#11131a] dark:border-slate-700 dark:bg-slate-800 dark:text-white">
                        <span
                          className={`h-2 w-2 rounded-full ${getPriorityDotClass(
                            issue.priorityLevel,
                          )}`}
                        />
                        Urgency{' '}
                        <span className="tabular-nums font-mono">
                          {issue.urgencyScore}/10
                        </span>{' '}
                        ({translatePriority(issue.priorityLevel, language)})
                      </span>

                      <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-[#11131a] dark:bg-slate-800 dark:text-white">
                        {issue.category}
                      </span>

                      <span
                        className={`tabular-nums inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold ${
                          sla.isOverdue
                            ? 'bg-red-100 text-red-900 dark:bg-red-950/70 dark:text-red-200'
                            : 'bg-indigo-50 text-[#3730a3] dark:bg-indigo-950/60 dark:text-indigo-200'
                        }`}
                      >
                        <Clock className="h-3 w-3" aria-hidden="true" />
                        {sla.label}
                      </span>
                    </div>

                    <h2 className="text-base font-bold text-[#11131a] sm:text-lg dark:text-white">
                      {issue.title}
                    </h2>
                    <p className="text-sm leading-relaxed text-slate-700 dark:text-slate-300">
                      {issue.description}
                    </p>

                    <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300">
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
                        {issue.location.address}
                      </span>
                      <span className="inline-flex items-center gap-1 text-[#581c87] dark:text-purple-300">
                        <Building2 className="h-3.5 w-3.5" aria-hidden="true" />
                        Dept:{' '}
                        {translateDepartment(issue.assignedDepartment, language)}
                      </span>
                      <span className="tabular-nums">
                        {issue.upvoteCount} upvotes
                      </span>
                    </div>

                    {/* Scoped Dept Staff: Cross-Department Handover Request Trigger */}
                    {scopedDepartment !== null && (
                      <div className="mt-2">
                        {!isTransferOpen ? (
                          <button
                            type="button"
                            onClick={() => setOpenTransferIssueId(issue.id)}
                            className="press-feedback inline-flex items-center gap-1.5 rounded-full border border-slate-300 bg-white px-3 py-1 text-[11px] font-semibold text-[#11131a] hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                          >
                            <ArrowRightLeft
                              className="h-3 w-3"
                              aria-hidden="true"
                            />
                            <span>{t.requestTransferBtn}</span>
                          </button>
                        ) : (
                          <div className="surface-well flex flex-col gap-2 p-3 text-xs">
                            <div className="flex flex-wrap items-center gap-2">
                              <select
                                aria-label="Target department for handover request"
                                value={
                                  transferDraftDept.get(issue.id) ??
                                  DEPARTMENTS.find(
                                    (d) => d !== issue.assignedDepartment,
                                  ) ??
                                  'Roads & Infrastructure'
                                }
                                onChange={(e) => {
                                  const val = e.target.value as Department;
                                  setTransferDraftDept((prev) => {
                                    const next = new Map(prev);
                                    next.set(issue.id, val);
                                    return next;
                                  });
                                }}
                                className="rounded-xl border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-[#11131a] dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                              >
                                {DEPARTMENTS.filter(
                                  (d) => d !== issue.assignedDepartment,
                                ).map((dept) => (
                                  <option key={dept} value={dept}>
                                    → {translateDepartment(dept, language)}
                                  </option>
                                ))}
                              </select>
                              <input
                                type="text"
                                maxLength={200}
                                value={transferDraftReason.get(issue.id) ?? ''}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setTransferDraftReason((prev) => {
                                    const next = new Map(prev);
                                    next.set(issue.id, val);
                                    return next;
                                  });
                                }}
                                placeholder="Reason (e.g., pipe fixed, road needs repaving)..."
                                className="min-w-[180px] flex-1 rounded-xl border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-[#11131a] dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                              />
                              <button
                                type="button"
                                onClick={() =>
                                  handleSubmitTransferRequest(issue)
                                }
                                className="press-feedback rounded-full bg-[#11131a] px-3 py-1.5 text-[11px] font-bold text-white dark:bg-white dark:text-[#11131a]"
                              >
                                Submit Request
                              </button>
                              <button
                                type="button"
                                onClick={() => setOpenTransferIssueId(null)}
                                className="text-[11px] font-semibold text-slate-500 underline"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Right 5 Cols: Dispatch Controls & Black After-Repair Proof Button */}
                  <div className="surface-well flex flex-col justify-between gap-3.5 p-4 lg:col-span-5">
                    <div>
                      <span className="block text-xs font-bold text-[#11131a] dark:text-white">
                        {t.statusActionLabel}
                      </span>
                      <div className="mt-1.5 grid grid-cols-3 gap-1.5">
                        {ISSUE_STATUSES.map((statusOption) => {
                          const isCurrent = issue.status === statusOption;
                          return (
                            <button
                              key={statusOption}
                              type="button"
                              disabled={!isAdmin || isSaving || isCurrent}
                              onClick={() =>
                                void handleQuickStatusUpdate(issue, statusOption)
                              }
                              className={`press-feedback inline-flex min-h-[38px] items-center justify-center gap-1 rounded-full px-2 py-1.5 text-xs font-semibold disabled:opacity-60 ${
                                isCurrent
                                  ? 'bg-[#581c87] text-white'
                                  : 'border border-slate-300 bg-white text-[#11131a] hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-white'
                              }`}
                            >
                              {isCurrent && (
                                <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                              )}
                              <span>{translateStatus(statusOption, language)}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Black Button: Attach After-Repair Proof (< 120 KB WebP) */}
                    <div className="flex flex-wrap items-center justify-between gap-2 border-y border-slate-200/80 py-2.5 dark:border-slate-800">
                      <label
                        htmlFor={`after-photo-${issue.id}`}
                        className="press-feedback inline-flex min-h-[36px] cursor-pointer items-center gap-1.5 rounded-full bg-[#11131a] px-3.5 py-1.5 text-[11px] font-semibold text-white hover:bg-slate-800 dark:bg-white dark:text-[#11131a] dark:hover:bg-slate-200"
                      >
                        <Camera className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>
                          {hasAfterPhoto
                            ? t.updateAfterPhoto
                            : t.attachAfterPhoto}
                        </span>
                        <input
                          id={`after-photo-${issue.id}`}
                          type="file"
                          accept="image/webp,image/jpeg,image/png"
                          disabled={!isAdmin}
                          onChange={(e) =>
                            void handleResolutionPhotoUpload(issue, e)
                          }
                          className="sr-only"
                        />
                      </label>
                      {hasAfterPhoto && (
                        <span className="text-[11px] font-bold text-emerald-700 dark:text-emerald-300">
                          {t.proofAttached}
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                      <div>
                        <label
                          htmlFor={`dept-select-${issue.id}`}
                          className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300"
                        >
                          {scopedDepartment !== null
                            ? t.lockedDeptLabel
                            : t.assignedDeptLabel}
                        </label>
                        <select
                          id={`dept-select-${issue.id}`}
                          disabled={!isAdmin || isSaving || scopedDepartment !== null}
                          value={currentDept}
                          onChange={(e) => {
                            const nextVal = e.target.value as Department;
                            setDraftDepartments((prev) => {
                              const next = new Map(prev);
                              next.set(issue.id, nextVal);
                              return next;
                            });
                          }}
                          className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-[#11131a] disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                        >
                          {DEPARTMENTS.map((dept) => (
                            <option key={dept} value={dept}>
                              {translateDepartment(dept, language)}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label
                          htmlFor={`note-input-${issue.id}`}
                          className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300"
                        >
                          {t.dispatchNoteLabel}
                        </label>
                        <div className="mt-1 flex gap-1.5">
                          <input
                            id={`note-input-${issue.id}`}
                            type="text"
                            disabled={!isAdmin || isSaving}
                            maxLength={500}
                            value={currentNote}
                            onChange={(e) => {
                              const nextVal = e.target.value;
                              setDraftNotes((prev) => {
                                const next = new Map(prev);
                                next.set(issue.id, nextVal);
                                return next;
                              });
                            }}
                            placeholder="Crew assigned / repaired..."
                            className="w-full rounded-xl border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-[#11131a] disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                          />
                          <button
                            type="button"
                            disabled={!isAdmin || isSaving}
                            onClick={() =>
                              void handleSaveNotesAndDepartment(issue)
                            }
                            aria-label={`Save notes and department for ${issue.title}`}
                            className="press-feedback inline-flex min-h-[36px] shrink-0 items-center gap-1 rounded-full bg-[#3730a3] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#312e81] disabled:opacity-50"
                          >
                            <Save className="h-3.5 w-3.5" aria-hidden="true" />
                            <span>{t.saveBtn}</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </article>
            );
          })
        )}
      </div>
    </section>
  );
}
