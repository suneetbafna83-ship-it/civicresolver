import React from 'react';
import {
  Building2,
  CheckCircle2,
  Clock,
  Download,
  Image as ImageIcon,
  MapPin,
  ThumbsUp,
} from 'lucide-react';
import type { CivicIssue } from '../../../shared/types/civic.js';
import { downloadOfficialReceipt } from '../../lib/export/civicExport.js';
import {
  getUiStrings,
  translateDepartment,
  translatePriority,
  type AppLanguage,
} from '../../lib/i18n/translations.js';
import {
  getPriorityDotClass,
  getStatusStepIndex,
} from '../../lib/utils/issueDisplay.js';
import { computeSlaStatus } from '../../lib/utils/slaUtils.js';

export interface TrackIssueCardProps {
  readonly issue: CivicIssue;
  readonly isSelected: boolean;
  readonly hasVoted: boolean;
  readonly afterPhoto?: string;
  readonly language: AppLanguage;
  readonly onSelect: (issueId: string) => void;
  readonly onUpvote: (issueId: string) => Promise<void>;
}

export function TrackIssueCard({
  issue,
  isSelected,
  hasVoted,
  afterPhoto,
  language,
  onSelect,
  onUpvote,
}: TrackIssueCardProps): React.ReactElement {
  const t = getUiStrings(language);
  const stepIdx = getStatusStepIndex(issue.status);
  const sla = computeSlaStatus(issue);

  return (
    <article
      aria-labelledby={`track-issue-title-${issue.id}`}
      className={`surface-card p-4 transition-all sm:p-6 ${
        isSelected
          ? 'ring-2 ring-[#0f766e]'
          : 'hover:border-slate-300 dark:hover:border-slate-700'
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-[#11131a] dark:bg-slate-800 dark:text-white">
            {issue.category}
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-bold text-[#11131a] dark:border-slate-700 dark:bg-slate-900 dark:text-white">
            <span
              aria-hidden="true"
              className={`h-2 w-2 rounded-full ${getPriorityDotClass(
                issue.priorityLevel,
              )}`}
            />
            {translatePriority(issue.priorityLevel, language)} ·{' '}
            <span className="tabular-nums font-mono">
              {issue.urgencyScore}/10
            </span>
          </span>
        </div>

        <span
          className={`tabular-nums inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold ${
            sla.isOverdue
              ? 'bg-red-100 text-red-900 dark:bg-red-950/70 dark:text-red-200'
              : sla.isResolved
                ? 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950/70 dark:text-emerald-200'
                : 'bg-indigo-50 text-[#3730a3] dark:bg-indigo-950/60 dark:text-indigo-200'
          }`}
        >
          <Clock className="h-3 w-3" aria-hidden="true" />
          {sla.label}
        </span>
      </div>

      <h2
        id={`track-issue-title-${issue.id}`}
        className="mt-3 text-base font-bold text-[#11131a] sm:text-lg dark:text-white"
      >
        <button
          type="button"
          onClick={() => onSelect(issue.id)}
          aria-pressed={isSelected}
          className="w-full text-left hover:underline"
        >
          {issue.title}
        </button>
      </h2>
      <p className="mt-1.5 text-sm leading-relaxed text-slate-700 dark:text-slate-300">
        {issue.description}
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300">
        <span className="inline-flex items-center gap-1">
          <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
          {issue.location.address}
        </span>
        <span className="inline-flex items-center gap-1 text-[#3730a3] dark:text-indigo-300">
          <Building2 className="h-3.5 w-3.5" aria-hidden="true" />
          {translateDepartment(issue.assignedDepartment, language)}
        </span>
      </div>

      {(issue.imageDataUrl || afterPhoto) && (
        <div className="surface-well mt-4 grid grid-cols-1 gap-3 p-3 sm:grid-cols-2">
          {issue.imageDataUrl && (
            <div className="flex flex-col gap-1">
              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-700 dark:text-slate-300">
                <ImageIcon className="h-3 w-3" aria-hidden="true" />
                Before (Citizen Report Photo)
              </span>
              <img
                src={issue.imageDataUrl}
                alt={`Before photo for ${issue.title}`}
                className="h-28 w-full rounded-lg border border-slate-200 object-cover dark:border-slate-700"
              />
            </div>
          )}
          {afterPhoto && (
            <div className="flex flex-col gap-1">
              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-800 dark:text-emerald-300">
                <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                After (Verified Municipal Repair)
              </span>
              <img
                src={afterPhoto}
                alt={`After repair photo for ${issue.title}`}
                className="h-28 w-full rounded-lg border border-emerald-300 object-cover dark:border-emerald-700"
              />
            </div>
          )}
        </div>
      )}

      <div className="surface-well mt-4 p-3.5">
        <div className="flex items-center justify-between text-xs font-bold">
          <span
            className={
              stepIdx >= 1
                ? 'text-[#11131a] dark:text-white'
                : 'text-slate-500'
            }
          >
            {t.stepReported}
          </span>
          <span
            className={
              stepIdx >= 2
                ? 'text-[#3730a3] dark:text-indigo-300'
                : 'text-slate-500'
            }
          >
            {t.stepInProgress}
          </span>
          <span
            className={
              stepIdx >= 3
                ? 'inline-flex items-center gap-1 text-emerald-800 dark:text-emerald-300'
                : 'text-slate-500'
            }
          >
            {stepIdx >= 3 && (
              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            {t.stepResolved}
          </span>
        </div>

        <div
          role="progressbar"
          aria-label={`Resolution progress for ${issue.title}`}
          aria-valuemin={1}
          aria-valuemax={3}
          aria-valuenow={stepIdx}
          className="mt-2 grid grid-cols-3 gap-2"
        >
          <div
            className={`h-2 rounded-full ${
              stepIdx >= 1 ? 'bg-[#3730a3]' : 'bg-slate-200 dark:bg-slate-800'
            }`}
          />
          <div
            className={`h-2 rounded-full ${
              stepIdx >= 2 ? 'bg-[#0f766e]' : 'bg-slate-200 dark:bg-slate-800'
            }`}
          />
          <div
            className={`h-2 rounded-full ${
              stepIdx >= 3
                ? 'bg-emerald-600'
                : 'bg-slate-200 dark:bg-slate-800'
            }`}
          />
        </div>

        {issue.resolutionNotes && (
          <p className="mt-2.5 border-t border-slate-200/90 pt-2 text-xs text-slate-800 dark:border-slate-800 dark:text-slate-200">
            <strong className="font-bold">{t.municipalUpdateLabel}</strong>{' '}
            {issue.resolutionNotes}
          </p>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-xs font-medium text-slate-600 dark:text-slate-300">
        <span>
          {t.reportedByLabel} {issue.reporterDisplayName}
        </span>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => downloadOfficialReceipt(issue)}
            className="press-feedback inline-flex min-h-[38px] items-center gap-1.5 rounded-full border border-slate-300 bg-white px-3.5 py-1.5 text-xs font-semibold text-[#11131a] hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
          >
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{t.receiptBtn}</span>
          </button>

          <button
            type="button"
            disabled={hasVoted}
            onClick={() => void onUpvote(issue.id)}
            className={`press-feedback inline-flex min-h-[38px] items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold ${
              hasVoted
                ? 'bg-slate-200 text-[#11131a] dark:bg-slate-800 dark:text-white'
                : 'bg-[#0f766e] text-white hover:opacity-90'
            }`}
          >
            <ThumbsUp className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="tabular-nums">
              {hasVoted ? t.upvotedLabel : t.upvoteActionLabel} (
              {issue.upvoteCount})
            </span>
          </button>
        </div>
      </div>
    </article>
  );
}
