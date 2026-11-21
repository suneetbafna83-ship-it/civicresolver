import React from 'react';
import {
  ArrowRightLeft,
  Building2,
  Camera,
  CheckCircle2,
  Clock,
  MapPin,
  Save,
} from 'lucide-react';
import {
  DEPARTMENTS,
  ISSUE_STATUSES,
  type CivicIssue,
  type Department,
  type IssueStatus,
} from '../../../shared/types/civic.js';
import {
  getUiStrings,
  translateDepartment,
  translatePriority,
  translateStatus,
  type AppLanguage,
} from '../../lib/i18n/translations.js';
import { getPriorityDotClass } from '../../lib/utils/issueDisplay.js';
import { computeSlaStatus } from '../../lib/utils/slaUtils.js';

export interface AdminIssueCardProps {
  readonly issue: CivicIssue;
  readonly language: AppLanguage;
  readonly isAdmin: boolean;
  readonly isSaving: boolean;
  readonly scopedDepartment: Department | null;
  readonly currentNote: string;
  readonly currentDept: Department;
  readonly hasAfterPhoto: boolean;
  readonly isTransferOpen: boolean;
  readonly transferTargetDept: Department;
  readonly transferReason: string;
  readonly onQuickStatusUpdate: (issue: CivicIssue, next: IssueStatus) => void;
  readonly onSaveNotesAndDepartment: (issue: CivicIssue) => void;
  readonly onResolutionPhotoUpload: (
    issue: CivicIssue,
    event: React.ChangeEvent<HTMLInputElement>,
  ) => void;
  readonly onDraftNoteChange: (issueId: string, value: string) => void;
  readonly onDraftDeptChange: (issueId: string, value: Department) => void;
  readonly onToggleTransfer: (issueId: string | null) => void;
  readonly onTransferDeptChange: (issueId: string, value: Department) => void;
  readonly onTransferReasonChange: (issueId: string, value: string) => void;
  readonly onSubmitTransfer: (issue: CivicIssue) => void;
}

export function AdminIssueCard({
  issue,
  language,
  isAdmin,
  isSaving,
  scopedDepartment,
  currentNote,
  currentDept,
  hasAfterPhoto,
  isTransferOpen,
  transferTargetDept,
  transferReason,
  onQuickStatusUpdate,
  onSaveNotesAndDepartment,
  onResolutionPhotoUpload,
  onDraftNoteChange,
  onDraftDeptChange,
  onToggleTransfer,
  onTransferDeptChange,
  onTransferReasonChange,
  onSubmitTransfer,
}: AdminIssueCardProps): React.ReactElement {
  const t = getUiStrings(language);
  const sla = computeSlaStatus(issue);

  return (
    <article
      aria-labelledby={`admin-issue-${issue.id}`}
      className="surface-card p-4 sm:p-6"
    >
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        <div className="flex flex-col gap-2.5 lg:col-span-7">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-bold text-[#11131a] dark:border-slate-700 dark:bg-slate-800 dark:text-white">
              <span
                aria-hidden="true"
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

          <h2
            id={`admin-issue-${issue.id}`}
            className="text-base font-bold text-[#11131a] sm:text-lg dark:text-white"
          >
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
              Dept: {translateDepartment(issue.assignedDepartment, language)}
            </span>
            <span className="tabular-nums">{issue.upvoteCount} upvotes</span>
          </div>

          {scopedDepartment !== null && (
            <div className="mt-2">
              {!isTransferOpen ? (
                <button
                  type="button"
                  onClick={() => onToggleTransfer(issue.id)}
                  className="press-feedback inline-flex items-center gap-1.5 rounded-full border border-slate-300 bg-white px-3 py-1 text-[11px] font-semibold text-[#11131a] hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                >
                  <ArrowRightLeft className="h-3 w-3" aria-hidden="true" />
                  <span>{t.requestTransferBtn}</span>
                </button>
              ) : (
                <div className="surface-well flex flex-col gap-2 p-3 text-xs">
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      aria-label="Target department for handover request"
                      value={transferTargetDept}
                      onChange={(e) =>
                        onTransferDeptChange(
                          issue.id,
                          e.target.value as Department,
                        )
                      }
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
                      aria-label="Handover reason"
                      maxLength={200}
                      value={transferReason}
                      onChange={(e) =>
                        onTransferReasonChange(issue.id, e.target.value)
                      }
                      placeholder="Reason (e.g., pipe fixed, road needs repaving)..."
                      className="min-w-[180px] flex-1 rounded-xl border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-[#11131a] dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                    />
                    <button
                      type="button"
                      onClick={() => onSubmitTransfer(issue)}
                      className="press-feedback rounded-full bg-[#11131a] px-3 py-1.5 text-[11px] font-bold text-white dark:bg-white dark:text-[#11131a]"
                    >
                      Submit Request
                    </button>
                    <button
                      type="button"
                      onClick={() => onToggleTransfer(null)}
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
                    onClick={() => onQuickStatusUpdate(issue, statusOption)}
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

          <div className="flex flex-wrap items-center justify-between gap-2 border-y border-slate-200/80 py-2.5 dark:border-slate-800">
            <label
              htmlFor={`after-photo-${issue.id}`}
              className="press-feedback inline-flex min-h-[36px] cursor-pointer items-center gap-1.5 rounded-full bg-[#11131a] px-3.5 py-1.5 text-[11px] font-semibold text-white hover:bg-slate-800 dark:bg-white dark:text-[#11131a] dark:hover:bg-slate-200"
            >
              <Camera className="h-3.5 w-3.5" aria-hidden="true" />
              <span>
                {hasAfterPhoto ? t.updateAfterPhoto : t.attachAfterPhoto}
              </span>
              <input
                id={`after-photo-${issue.id}`}
                type="file"
                accept="image/webp,image/jpeg,image/png"
                disabled={!isAdmin}
                onChange={(e) => onResolutionPhotoUpload(issue, e)}
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
                onChange={(e) =>
                  onDraftDeptChange(issue.id, e.target.value as Department)
                }
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
                  onChange={(e) => onDraftNoteChange(issue.id, e.target.value)}
                  placeholder="Crew assigned / repaired..."
                  className="w-full rounded-xl border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-[#11131a] disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                />
                <button
                  type="button"
                  disabled={!isAdmin || isSaving}
                  onClick={() => onSaveNotesAndDepartment(issue)}
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
}
