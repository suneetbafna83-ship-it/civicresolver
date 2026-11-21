import React, { useMemo, useState } from 'react';
import {
  Building2,
  Camera,
  CheckCircle2,
  Clock,
  Download,
  Lock,
  MapPin,
  Save,
  ShieldAlert,
  ShieldCheck,
  UserCheck,
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
  buildIssuesCsv,
  downloadCsvFile,
} from '../../lib/export/civicExport.js';
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
  onAttachResolutionPhoto,
  onEnableDemoAdmin,
  onUpdateIssue,
}: AdminDashboardViewProps): React.ReactElement {
  const isAdmin = session?.role === 'admin';
  const scopedDepartment: Department | null =
    isAdmin && session.assignedDepartment ? session.assignedDepartment : null;

  const [selectedDepartment, setSelectedDepartment] = useState<
    Department | 'ALL'
  >('ALL');
  const [selectedStatus, setSelectedStatus] = useState<IssueStatus | 'ALL'>(
    'ALL',
  );
  const [draftNotes, setDraftNotes] = useState<Map<string, string>>(
    () => new Map(),
  );
  const [draftDepartments, setDraftDepartments] = useState<
    Map<string, Department>
  >(() => new Map());
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
  }, [effectiveDepartment, scopeFilteredIssues, selectedStatus]);

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
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : 'Could not save admin update.',
      );
    } finally {
      setSavingIssueId(null);
    }
  };

  const handleResolutionPhotoUpload = async (
    issueId: string,
    event: React.ChangeEvent<HTMLInputElement>,
  ): Promise<void> => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    setPhotoError(null);
    try {
      const compressed = await compressImageFileToWebp(file);
      onAttachResolutionPhoto(issueId, compressed.dataUrl);
    } catch (err) {
      setPhotoError(
        err instanceof Error
          ? err.message
          : 'Could not compress after-repair photo.',
      );
    }
  };

  return (
    <section
      aria-labelledby="admin-heading"
      className="mx-auto max-w-6xl px-4 py-5 sm:px-6 sm:py-6"
    >
      {/* Bionis Header + CSV Export Action */}
      <div className="mb-5 flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <h1
              id="admin-heading"
              className="text-xl font-bold tracking-tight sm:text-2xl"
            >
              <span className="text-slate-500 dark:text-slate-400">
                Operations,{' '}
              </span>
              <span className="text-[#11131a] dark:text-white">
                Municipal Admin Command Desk
              </span>
            </h1>
            <span className="rounded-full bg-[#581c87] px-3 py-1 text-xs font-semibold text-white">
              AI Urgency Queue (10 → 1)
            </span>
          </div>
          <p className="mt-1 max-w-2xl text-xs leading-relaxed text-slate-700 sm:text-sm dark:text-slate-300">
            {scopedDepartment !== null
              ? `Restricted Clearance: viewing and managing ${scopedDepartment} tasks only.`
              : 'Review cross-department complaints sorted by urgency, attach After-Repair photo proof, and export field dispatch queues.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
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
            <span>Export Queue (CSV)</span>
          </button>

          {isAdmin ? (
            <div className="inline-flex min-h-[40px] items-center gap-1.5 rounded-full border border-emerald-600/30 bg-emerald-500/15 px-3.5 py-2 text-xs font-bold text-emerald-900 dark:text-emerald-200">
              <ShieldCheck className="h-4 w-4" aria-hidden="true" />
              <span>{session?.displayName ?? 'Municipal Officer'}</span>
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
          className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-indigo-300/80 bg-indigo-500/[0.08] px-4 py-3 text-xs dark:border-indigo-800/80 dark:bg-indigo-500/15"
        >
          <div className="flex items-center gap-2.5 font-semibold text-[#3730a3] dark:text-indigo-200">
            <Lock className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>
              <strong>{scopedDepartment} Staff Scope Enforced:</strong> Other municipal departments are isolated and blocked across queries, repositories, and Firestore security rules.
            </span>
          </div>
          <span className="rounded-full bg-[#3730a3] px-3 py-1 text-[11px] font-bold text-white">
            Locked: {scopedDepartment}
          </span>
        </div>
      )}

      {/* Bionis Hero SLA Gauge + 4 KPI Cards + 2 Analytics Charts + 3 Tinted Insights */}
      <BionisAnalyticsRow
        issues={scopeFilteredIssues}
        scopeLabel={
          scopedDepartment !== null
            ? `${scopedDepartment} Scope`
            : 'City-Wide Command'
        }
        accent="plum"
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

      {/* Department Filter Bar (Locked for Scoped Staff, Multi-Dept for Super Admin) */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        {scopedDepartment !== null ? (
          <div
            role="group"
            aria-label="Locked municipal department scope"
            className="flex flex-wrap items-center gap-2"
          >
            <span className="inline-flex min-h-[38px] items-center gap-1.5 rounded-full bg-[#3730a3] px-4 py-1.5 text-xs font-semibold text-white shadow-xs">
              <Lock className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{scopedDepartment} Only</span>
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
              return (
                <button
                  key={dept}
                  type="button"
                  onClick={() => setSelectedDepartment(dept)}
                  className={`press-feedback min-h-[38px] rounded-full px-3.5 py-1.5 text-xs font-semibold ${
                    active
                      ? 'bg-[#581c87] text-white shadow-xs'
                      : 'border border-slate-300 bg-white text-[#11131a] hover:bg-purple-50 dark:border-slate-700 dark:bg-slate-800 dark:text-white'
                  }`}
                >
                  {dept === 'ALL' ? 'All Departments' : dept}
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
          <option value="ALL">All Statuses</option>
          {ISSUE_STATUSES.map((st) => (
            <option key={st} value={st}>
              {st}
            </option>
          ))}
        </select>
      </div>

      {/* Priority Dispatch Queue (Cult UI Category Tags & Concentric Controls) */}
      <div className="flex flex-col gap-5">
        {sortedIssues.length === 0 ? (
          <div className="surface-card p-8 text-center">
            <p className="text-sm font-bold text-[#11131a] dark:text-white">
              No active issues found in this department queue
            </p>
            <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
              Adjust the status filter or check back when new civic reports arrive.
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
                        ({issue.priorityLevel})
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
                        Dept: {issue.assignedDepartment}
                      </span>
                      <span className="tabular-nums">
                        {issue.upvoteCount} upvotes
                      </span>
                    </div>
                  </div>

                  {/* Right 5 Cols: Dispatch Controls & After-Repair Photo Proof */}
                  <div className="surface-well flex flex-col justify-between gap-3.5 p-4 lg:col-span-5">
                    <div>
                      <span className="block text-xs font-bold text-[#11131a] dark:text-white">
                        Status Action
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
                              <span>{statusOption}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* After-Repair Photo Proof Uploader (< 120 KB WebP) */}
                    <div className="flex flex-wrap items-center justify-between gap-2 border-y border-slate-200/80 py-2.5 dark:border-slate-800">
                      <label
                        htmlFor={`after-photo-${issue.id}`}
                        className="press-feedback inline-flex min-h-[36px] cursor-pointer items-center gap-1.5 rounded-full bg-[#581c87] px-3.5 py-1.5 text-[11px] font-semibold text-white hover:bg-[#4c1d95]"
                      >
                        <Camera className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>
                          {hasAfterPhoto
                            ? 'Update After-Repair Photo'
                            : 'Attach After-Repair Proof'}
                        </span>
                        <input
                          id={`after-photo-${issue.id}`}
                          type="file"
                          accept="image/webp,image/jpeg,image/png"
                          disabled={!isAdmin}
                          onChange={(e) =>
                            void handleResolutionPhotoUpload(issue.id, e)
                          }
                          className="sr-only"
                        />
                      </label>
                      {hasAfterPhoto && (
                        <span className="text-[11px] font-bold text-emerald-700 dark:text-emerald-300">
                          Proof Attached
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
                            ? 'Department (Locked)'
                            : 'Assigned Department'}
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
                              {dept}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label
                          htmlFor={`note-input-${issue.id}`}
                          className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300"
                        >
                          Official Dispatch / Resolution Note
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
                            <span>Save</span>
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
