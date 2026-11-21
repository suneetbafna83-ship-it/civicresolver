import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Download,
  History,
  Lock,
  ShieldAlert,
  ShieldCheck,
  UserCheck,
} from 'lucide-react';
import {
  DEPARTMENTS,
  type CivicIssue,
  type CivicSession,
  type Department,
  type IssueAdminUpdateInput,
  type IssueStatus,
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
  type AppLanguage,
} from '../../lib/i18n/translations.js';
import { compressImageFileToWebp } from '../../lib/media/imageCompressor.js';
import {
  matchesIssueSearchTokens,
  tokenizeSearchQuery,
} from '../../lib/utils/issueDisplay.js';
import { computeSlaStatus } from '../../lib/utils/slaUtils.js';
import { BionisAnalyticsRow } from '../dashboard/BionisAnalyticsRow.js';
import { AdminAuditLogPanel } from './AdminAuditLogPanel.js';
import { AdminHandoverQueue } from './AdminHandoverQueue.js';
import { AdminIssueCard } from './AdminIssueCard.js';
import { AdminQueueFilters } from './AdminQueueFilters.js';

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
  const [searchQuery, setSearchQuery] = useState('');
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

  const scopeFilteredIssues = useMemo(
    () =>
      scopedDepartment === null
        ? issues
        : issues.filter((issue) => issue.assignedDepartment === scopedDepartment),
    [issues, scopedDepartment],
  );

  const overdueCount = useMemo(
    () =>
      scopeFilteredIssues.filter(
        (issue) =>
          issue.status !== 'Resolved' && computeSlaStatus(issue).isOverdue,
      ).length,
    [scopeFilteredIssues],
  );

  const pendingTransfers = useMemo(
    () =>
      transferRequests.filter(
        (req) =>
          req.status === 'Pending' &&
          (scopedDepartment === null || req.fromDepartment === scopedDepartment),
      ),
    [scopedDepartment, transferRequests],
  );

  const effectiveDepartment =
    scopedDepartment !== null ? scopedDepartment : selectedDepartment;

  const sortedIssues = useMemo(() => {
    const tokens = tokenizeSearchQuery(searchQuery);
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
      return matchesIssueSearchTokens(issue, tokens, language);
    });

    return [...filtered].sort((a, b) => {
      if (a.status === 'Resolved' && b.status !== 'Resolved') return 1;
      if (a.status !== 'Resolved' && b.status === 'Resolved') return -1;
      if (b.urgencyScore !== a.urgencyScore) {
        return b.urgencyScore - a.urgencyScore;
      }
      return b.upvoteCount - a.upvoteCount;
    });
  }, [
    effectiveDepartment,
    language,
    overdueOnly,
    scopeFilteredIssues,
    searchQuery,
    selectedStatus,
  ]);

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
        scopedDepartment !== null ? undefined : draftDepartments.get(issue.id);
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

    setTransferRequests(
      createTransferRequest({
        issueId: issue.id,
        issueTitle: issue.title,
        fromDepartment: issue.assignedDepartment,
        toDepartment: targetDept,
        reason,
        requestedBy: actorName,
      }),
    );
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
      setTransferRequests(resolveTransferRequest(req.id, decision, actorName));
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
              downloadCsvFile(
                buildIssuesCsv(sortedIssues),
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

      {scopedDepartment !== null && (
        <div
          role="status"
          className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-indigo-300/80 bg-indigo-500/[0.08] px-4 py-3 text-xs dark:border-indigo-800/80 dark:bg-indigo-500/15"
        >
          <div className="flex items-center gap-2.5 font-semibold text-[#3730a3] dark:text-indigo-200">
            <Lock className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>
              <strong>
                {translateDepartment(scopedDepartment, language)} Staff Scope
                Enforced:
              </strong>{' '}
              Other municipal departments are isolated and blocked across
              queries, repositories, and Firestore security rules.
            </span>
          </div>
          <span className="rounded-full bg-[#11131a] px-3 py-1 text-[11px] font-bold text-white dark:bg-white dark:text-[#11131a]">
            Locked: {translateDepartment(scopedDepartment, language)}
          </span>
        </div>
      )}

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

      <AdminHandoverQueue
        requests={pendingTransfers}
        scopedDepartment={scopedDepartment}
        language={language}
        onDecision={handleDecisionTransferRequest}
      />

      {showAuditLog && (
        <AdminAuditLogPanel entries={auditEntries} language={language} />
      )}

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

      {(photoError || actionError) && (
        <div
          role="alert"
          className="mb-4 rounded-xl border border-red-300 bg-red-50 px-4 py-2.5 text-xs font-semibold text-red-900"
        >
          <ShieldAlert className="mr-1.5 inline h-4 w-4" aria-hidden="true" />
          {photoError ?? actionError}
        </div>
      )}

      <AdminQueueFilters
        scopedDepartment={scopedDepartment}
        selectedDepartment={selectedDepartment}
        selectedStatus={selectedStatus}
        searchQuery={searchQuery}
        language={language}
        onSelectDepartment={setSelectedDepartment}
        onSelectStatus={setSelectedStatus}
        onSearchChange={setSearchQuery}
      />

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
          sortedIssues.map((issue) => (
            <AdminIssueCard
              key={issue.id}
              issue={issue}
              language={language}
              isAdmin={isAdmin}
              isSaving={savingIssueId === issue.id}
              scopedDepartment={scopedDepartment}
              currentNote={
                draftNotes.get(issue.id) ?? issue.resolutionNotes ?? ''
              }
              currentDept={
                scopedDepartment !== null
                  ? issue.assignedDepartment
                  : (draftDepartments.get(issue.id) ?? issue.assignedDepartment)
              }
              hasAfterPhoto={Boolean(Reflect.get(resolutionPhotos, issue.id))}
              isTransferOpen={openTransferIssueId === issue.id}
              transferTargetDept={
                transferDraftDept.get(issue.id) ??
                DEPARTMENTS.find((d) => d !== issue.assignedDepartment) ??
                'Roads & Infrastructure'
              }
              transferReason={transferDraftReason.get(issue.id) ?? ''}
              onQuickStatusUpdate={(item, next) =>
                void handleQuickStatusUpdate(item, next)
              }
              onSaveNotesAndDepartment={(item) =>
                void handleSaveNotesAndDepartment(item)
              }
              onResolutionPhotoUpload={(item, e) =>
                void handleResolutionPhotoUpload(item, e)
              }
              onDraftNoteChange={(id, val) =>
                setDraftNotes((prev) => new Map(prev).set(id, val))
              }
              onDraftDeptChange={(id, val) =>
                setDraftDepartments((prev) => new Map(prev).set(id, val))
              }
              onToggleTransfer={setOpenTransferIssueId}
              onTransferDeptChange={(id, val) =>
                setTransferDraftDept((prev) => new Map(prev).set(id, val))
              }
              onTransferReasonChange={(id, val) =>
                setTransferDraftReason((prev) => new Map(prev).set(id, val))
              }
              onSubmitTransfer={handleSubmitTransferRequest}
            />
          ))
        )}
      </div>
    </section>
  );
}
