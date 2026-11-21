import React, { useMemo, useState } from 'react';
import {
  Building2,
  CheckCircle2,
  Clock,
  Download,
  Filter,
  Image as ImageIcon,
  MapPin,
  Search,
  ThumbsUp,
} from 'lucide-react';
import {
  ISSUE_CATEGORIES,
  ISSUE_STATUSES,
  type CivicIssue,
  type IssueCategory,
  type IssueStatus,
  type PriorityLevel,
} from '../../../shared/types/civic.js';
import { downloadOfficialReceipt } from '../../lib/export/civicExport.js';
import {
  getUiStrings,
  translateDepartment,
  translatePriority,
  translateStatus,
  type AppLanguage,
} from '../../lib/i18n/translations.js';
import { computeSlaStatus } from '../../lib/utils/slaUtils.js';
import { CivicMap } from '../map/CivicMap.js';
import { BionisAnalyticsRow } from './BionisAnalyticsRow.js';

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

function getStatusStepIndex(status: IssueStatus): number {
  switch (status) {
    case 'Reported':
      return 1;
    case 'In Progress':
      return 2;
    case 'Resolved':
      return 3;
  }
}

export interface TrackIssuesViewProps {
  readonly issues: ReadonlyArray<CivicIssue>;
  readonly votedIssueIds: ReadonlySet<string>;
  readonly resolutionPhotos: Readonly<Record<string, string>>;
  readonly darkTheme: boolean;
  readonly language: AppLanguage;
  readonly onUpvoteIssue: (issueId: string) => Promise<void>;
}

export function TrackIssuesView({
  issues,
  votedIssueIds,
  resolutionPhotos,
  darkTheme,
  language,
  onUpvoteIssue,
}: TrackIssuesViewProps): React.ReactElement {
  const t = getUiStrings(language);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<IssueStatus | 'ALL'>('ALL');
  const [categoryFilter, setCategoryFilter] = useState<IssueCategory | 'ALL'>(
    'ALL',
  );
  const [selectedIssueId, setSelectedIssueId] = useState<string | null>(
    issues[0]?.id ?? null,
  );

  const filteredIssues = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return issues.filter((issue) => {
      if (statusFilter !== 'ALL' && issue.status !== statusFilter) {
        return false;
      }
      if (categoryFilter !== 'ALL' && issue.category !== categoryFilter) {
        return false;
      }
      if (q.length > 0) {
        const haystack =
          `${issue.title} ${issue.description} ${issue.location.address} ${issue.assignedDepartment}`.toLowerCase();
        return haystack.includes(q);
      }
      return true;
    });
  }, [categoryFilter, issues, searchQuery, statusFilter]);

  return (
    <section
      aria-labelledby="track-heading"
      className="mx-auto max-w-6xl px-4 py-5 sm:px-6 sm:py-6"
    >
      {/* Header */}
      <div className="mb-5">
        <h1
          id="track-heading"
          className="text-xl font-bold tracking-tight sm:text-2xl"
        >
          <span className="text-slate-500 dark:text-slate-400">
            {t.trackLead}{' '}
          </span>
          <span className="text-[#11131a] dark:text-white">{t.trackTitle}</span>
        </h1>
        <p className="mt-1 max-w-2xl text-xs leading-relaxed text-slate-700 sm:text-sm dark:text-slate-300">
          {t.trackSubtitle}
        </p>
      </div>

      {/* Bionis Hero SLA Gauge + 4 KPI Cards + 2 Analytics Charts + 3 Insights */}
      <BionisAnalyticsRow
        issues={issues}
        scopeLabel={t.citizenWorkspaceTag}
        accent="teal"
        language={language}
      />

      {/* Refero-Inspired Filter Pills + Search */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div
          role="group"
          aria-label="Filter complaints by status"
          className="flex flex-wrap items-center gap-2"
        >
          {(['ALL', ...ISSUE_STATUSES] as const).map((status) => {
            const active = statusFilter === status;
            return (
              <button
                key={status}
                type="button"
                onClick={() => setStatusFilter(status)}
                className={`press-feedback inline-flex min-h-[38px] items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold ${
                  active
                    ? 'bg-[#0f766e] text-white shadow-xs'
                    : 'border border-slate-300 bg-white text-[#11131a] hover:bg-teal-50 dark:border-slate-700 dark:bg-slate-800 dark:text-white'
                }`}
              >
                <Filter className="h-3 w-3 opacity-80" aria-hidden="true" />
                <span>
                  {status === 'ALL'
                    ? t.allStatuses
                    : translateStatus(status, language)}
                </span>
              </button>
            );
          })}
        </div>

        <div className="flex w-full flex-wrap items-center gap-2.5 sm:w-auto">
          <div className="relative flex-1 sm:flex-none">
            <Search
              className="pointer-events-none absolute top-3 left-3.5 h-4 w-4 text-slate-500"
              aria-hidden="true"
            />
            <input
              type="search"
              aria-label="Search civic complaints"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t.searchPlaceholder}
              className="min-h-[38px] w-full rounded-full border border-slate-300 bg-white py-1.5 pr-4 pl-10 text-xs font-medium text-[#11131a] placeholder:text-slate-500 sm:w-64 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:placeholder:text-slate-400"
            />
          </div>

          <select
            aria-label="Filter by issue category"
            value={categoryFilter}
            onChange={(e) =>
              setCategoryFilter(e.target.value as IssueCategory | 'ALL')
            }
            className="min-h-[38px] rounded-full border border-slate-300 bg-white px-4 py-1.5 text-xs font-semibold text-[#11131a] dark:border-slate-700 dark:bg-slate-900 dark:text-white"
          >
            <option value="ALL">{t.allCategories}</option>
            {ISSUE_CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Main Split Workspace */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="flex flex-col gap-5 lg:col-span-7">
          {filteredIssues.length === 0 ? (
            <div className="surface-card p-8 text-center">
              <p className="text-base font-bold text-[#11131a] dark:text-white">
                No complaints match the current filter
              </p>
              <p className="mt-1.5 text-xs text-slate-600 dark:text-slate-300">
                Clear the search box or switch status to &ldquo;{t.allStatuses}&rdquo;.
              </p>
            </div>
          ) : (
            filteredIssues.map((issue) => {
              const stepIdx = getStatusStepIndex(issue.status);
              const isSelected = issue.id === selectedIssueId;
              const hasVoted = votedIssueIds.has(issue.id);
              const sla = computeSlaStatus(issue);
              const afterPhoto = Reflect.get(resolutionPhotos, issue.id) as
                | string
                | undefined;

              return (
                <article
                  key={issue.id}
                  onClick={() => setSelectedIssueId(issue.id)}
                  className={`surface-card cursor-pointer p-4 transition-all sm:p-6 ${
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

                  <h2 className="mt-3 text-base font-bold text-[#11131a] sm:text-lg dark:text-white">
                    {issue.title}
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

                  {/* Concentric Inner Progress Well */}
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

                    <div className="mt-2 grid grid-cols-3 gap-2">
                      <div
                        className={`h-2 rounded-full ${
                          stepIdx >= 1
                            ? 'bg-[#3730a3]'
                            : 'bg-slate-200 dark:bg-slate-800'
                        }`}
                      />
                      <div
                        className={`h-2 rounded-full ${
                          stepIdx >= 2
                            ? 'bg-[#0f766e]'
                            : 'bg-slate-200 dark:bg-slate-800'
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
                        <strong className="font-bold">
                          {t.municipalUpdateLabel}
                        </strong>{' '}
                        {issue.resolutionNotes}
                      </p>
                    )}
                  </div>

                  {/* Card Footer */}
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-xs font-medium text-slate-600 dark:text-slate-300">
                    <span>
                      {t.reportedByLabel} {issue.reporterDisplayName}
                    </span>

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          downloadOfficialReceipt(issue);
                        }}
                        className="press-feedback inline-flex min-h-[38px] items-center gap-1.5 rounded-full border border-slate-300 bg-white px-3.5 py-1.5 text-xs font-semibold text-[#11131a] hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                      >
                        <Download className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>{t.receiptBtn}</span>
                      </button>

                      <button
                        type="button"
                        disabled={hasVoted}
                        onClick={(e) => {
                          e.stopPropagation();
                          void onUpvoteIssue(issue.id);
                        }}
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
            })
          )}
        </div>

        {/* Right Column: Live Overview Map */}
        <div className="lg:col-span-5">
          <div className="surface-card sticky top-4 p-4 sm:p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-bold text-[#11131a] dark:text-white">
                {t.communityMapTitle}
              </h2>
              <span className="tabular-nums text-xs font-semibold text-slate-600 dark:text-slate-300">
                Showing {filteredIssues.length} pin(s)
              </span>
            </div>
            <CivicMap
              mode="overview"
              darkTheme={darkTheme}
              issues={filteredIssues}
              selectedIssueId={selectedIssueId}
              onSelectIssue={setSelectedIssueId}
              heightClassName="h-[300px] sm:h-[400px]"
            />
          </div>
        </div>
      </div>
    </section>
  );
}
