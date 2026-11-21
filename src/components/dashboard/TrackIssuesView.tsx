import React, { useMemo, useState } from 'react';
import {
  Building2,
  CheckCircle2,
  Clock,
  Download,
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
  type AppLanguage,
} from '../../lib/i18n/translations.js';
import { computeSlaStatus } from '../../lib/utils/slaUtils.js';
import { CivicMap } from '../map/CivicMap.js';

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

  const counts = useMemo(() => {
    let reported = 0;
    let inProgress = 0;
    let resolved = 0;
    for (const item of issues) {
      if (item.status === 'Reported') {
        reported += 1;
      } else if (item.status === 'In Progress') {
        inProgress += 1;
      } else if (item.status === 'Resolved') {
        resolved += 1;
      }
    }
    return {
      total: issues.length,
      reported,
      inProgress,
      resolved,
    };
  }, [issues]);

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
      className="mx-auto max-w-6xl px-4 py-6 sm:px-8 sm:py-8"
    >
      {/* Editorial Two-Tone Header + 4-Card KPI Strip */}
      <div className="mb-8 flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
        <div>
          <h1
            id="track-heading"
            className="text-2xl font-bold tracking-tight sm:text-3xl"
          >
            <span className="text-slate-500 dark:text-slate-400">
              {t.trackLead}{' '}
            </span>
            <span className="text-[#11131a] dark:text-white">
              {t.trackTitle}
            </span>
          </h1>
          <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-slate-700 dark:text-slate-300">
            Follow every report with live SLA countdowns, before/after photo proof, and official downloadable receipts.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="surface-card px-4 py-3">
            <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
              Total Reports
            </span>
            <p className="tabular-nums mt-0.5 text-xl font-bold text-[#11131a] dark:text-white">
              {counts.total}
            </p>
          </div>
          <div className="surface-card px-4 py-3">
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300">
              <span className="h-2 w-2 rounded-full bg-amber-600" />
              Reported
            </span>
            <p className="tabular-nums mt-0.5 text-xl font-bold text-[#11131a] dark:text-white">
              {counts.reported}
            </p>
          </div>
          <div className="surface-card px-4 py-3">
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300">
              <span className="h-2 w-2 rounded-full bg-indigo-700" />
              In Progress
            </span>
            <p className="tabular-nums mt-0.5 text-xl font-bold text-[#11131a] dark:text-white">
              {counts.inProgress}
            </p>
          </div>
          <div className="surface-card px-4 py-3">
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300">
              <span className="h-2 w-2 rounded-full bg-emerald-600" />
              Resolved
            </span>
            <p className="tabular-nums mt-0.5 text-xl font-bold text-[#11131a] dark:text-white">
              {counts.resolved}
            </p>
          </div>
        </div>
      </div>

      {/* Filter Bar (Teal-Tinted Active Status Pills) */}
      <div className="mb-7 flex flex-wrap items-center justify-between gap-3">
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
                className={`press-feedback min-h-[36px] rounded-full px-4 py-1.5 text-xs font-semibold ${
                  active
                    ? 'bg-[#0f766e] text-white shadow-xs'
                    : 'border border-slate-300 bg-white text-[#11131a] hover:bg-teal-50 dark:border-slate-700 dark:bg-slate-800 dark:text-white'
                }`}
              >
                {status === 'ALL' ? 'All Statuses' : status}
              </button>
            );
          })}
        </div>

        <div className="flex w-full flex-wrap items-center gap-2.5 sm:w-auto">
          <div className="relative flex-1 sm:flex-none">
            <Search
              className="pointer-events-none absolute top-2.5 left-3.5 h-4 w-4 text-slate-500"
              aria-hidden="true"
            />
            <input
              type="search"
              aria-label="Search civic complaints"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search street, title, or department..."
              className="w-full rounded-full border border-slate-300 bg-white py-2 pr-4 pl-10 text-xs font-medium text-[#11131a] placeholder:text-slate-500 sm:w-64 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:placeholder:text-slate-400"
            />
          </div>

          <select
            aria-label="Filter by issue category"
            value={categoryFilter}
            onChange={(e) =>
              setCategoryFilter(e.target.value as IssueCategory | 'ALL')
            }
            className="rounded-full border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-[#11131a] dark:border-slate-700 dark:bg-slate-900 dark:text-white"
          >
            <option value="ALL">All Categories</option>
            {ISSUE_CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Main Split Workspace */}
      <div className="grid grid-cols-1 gap-7 lg:grid-cols-12">
        <div className="flex flex-col gap-6 lg:col-span-7">
          {filteredIssues.length === 0 ? (
            <div className="surface-card p-10 text-center">
              <p className="text-base font-bold text-[#11131a] dark:text-white">
                No complaints match the current filter
              </p>
              <p className="mt-1.5 text-xs text-slate-600 dark:text-slate-300">
                Clear the search box or switch status to &ldquo;All Statuses&rdquo;.
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
                  className={`surface-card cursor-pointer p-5 transition-all sm:p-6 ${
                    isSelected
                      ? 'ring-2 ring-[#0f766e]'
                      : 'hover:border-slate-300 dark:hover:border-slate-700'
                  }`}
                >
                  {/* Top Row: Category + Priority + Live SLA Countdown */}
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
                        {issue.priorityLevel} ·{' '}
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

                  <div className="mt-3.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300">
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
                      {issue.location.address}
                    </span>
                    <span className="inline-flex items-center gap-1 text-[#3730a3] dark:text-indigo-300">
                      <Building2 className="h-3.5 w-3.5" aria-hidden="true" />
                      Dept: {issue.assignedDepartment}
                    </span>
                  </div>

                  {/* Before & After Photo Proof Viewer (when photos attached) */}
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

                  {/* Concentric Inner Progress Well: 3-Step Visual Tracker */}
                  <div className="surface-well mt-4 p-3.5">
                    <div className="flex items-center justify-between text-xs font-bold">
                      <span
                        className={
                          stepIdx >= 1
                            ? 'text-[#11131a] dark:text-white'
                            : 'text-slate-500'
                        }
                      >
                        1. Reported
                      </span>
                      <span
                        className={
                          stepIdx >= 2
                            ? 'text-[#3730a3] dark:text-indigo-300'
                            : 'text-slate-500'
                        }
                      >
                        2. In Progress
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
                        3. Resolved
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
                        <strong className="font-bold">Municipal Update:</strong>{' '}
                        {issue.resolutionNotes}
                      </p>
                    )}
                  </div>

                  {/* Card Footer: Official Receipt + Upvote Pill */}
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-xs font-medium text-slate-600 dark:text-slate-300">
                    <span>Reported by {issue.reporterDisplayName}</span>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          downloadOfficialReceipt(issue);
                        }}
                        className="press-feedback inline-flex min-h-[34px] items-center gap-1.5 rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-[#11131a] hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
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
                        className={`press-feedback inline-flex min-h-[34px] items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold ${
                          hasVoted
                            ? 'bg-slate-200 text-[#11131a] dark:bg-slate-800 dark:text-white'
                            : 'bg-[#0f766e] text-white hover:opacity-90'
                        }`}
                      >
                        <ThumbsUp className="h-3.5 w-3.5" aria-hidden="true" />
                        <span className="tabular-nums">
                          {hasVoted ? 'Upvoted' : '+1 Affected'} ({issue.upvoteCount})
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
          <div className="surface-card sticky top-6 p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-bold text-[#11131a] dark:text-white">
                Community Issue Map
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
              heightClassName="h-[420px]"
            />
          </div>
        </div>
      </div>
    </section>
  );
}
