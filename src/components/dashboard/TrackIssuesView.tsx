import React, { useEffect, useMemo, useState } from 'react';
import { Filter, Search, X } from 'lucide-react';
import {
  ISSUE_CATEGORIES,
  ISSUE_STATUSES,
  type CivicIssue,
  type IssueCategory,
  type IssueStatus,
} from '../../../shared/types/civic.js';
import {
  getUiStrings,
  translateStatus,
  type AppLanguage,
} from '../../lib/i18n/translations.js';
import {
  matchesIssueSearchTokens,
  tokenizeSearchQuery,
} from '../../lib/utils/issueDisplay.js';
import { CivicMap } from '../map/CivicMap.js';
import { BionisAnalyticsRow } from './BionisAnalyticsRow.js';
import { TrackIssueCard } from './TrackIssueCard.js';

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
    const tokens = tokenizeSearchQuery(searchQuery);
    return issues.filter((issue) => {
      if (statusFilter !== 'ALL' && issue.status !== statusFilter) {
        return false;
      }
      if (categoryFilter !== 'ALL' && issue.category !== categoryFilter) {
        return false;
      }
      return matchesIssueSearchTokens(issue, tokens, language);
    });
  }, [categoryFilter, issues, language, searchQuery, statusFilter]);

  useEffect(() => {
    if (filteredIssues.length === 0) {
      setSelectedIssueId(null);
      return;
    }
    const stillVisible = filteredIssues.some(
      (item) => item.id === selectedIssueId,
    );
    if (!stillVisible) {
      setSelectedIssueId(filteredIssues[0]?.id ?? null);
    }
  }, [filteredIssues, selectedIssueId]);

  return (
    <section
      aria-labelledby="track-heading"
      className="mx-auto max-w-6xl px-4 py-5 sm:px-6 sm:py-6"
    >
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

      <BionisAnalyticsRow
        issues={issues}
        scopeLabel={t.citizenWorkspaceTag}
        accent="teal"
        language={language}
      />

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
              className="min-h-[38px] w-full rounded-full border border-slate-300 bg-white py-1.5 pr-8 pl-10 text-xs font-medium text-[#11131a] placeholder:text-slate-500 sm:w-64 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:placeholder:text-slate-400"
            />
            {searchQuery.length > 0 && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                aria-label="Clear search query"
                className="absolute top-2.5 right-2.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-slate-200 text-slate-700 hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-200"
              >
                <X className="h-3 w-3" aria-hidden="true" />
              </button>
            )}
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

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="flex flex-col gap-5 lg:col-span-7">
          {filteredIssues.length === 0 ? (
            <div className="surface-card p-8 text-center">
              <p className="text-base font-bold text-[#11131a] dark:text-white">
                No complaints match the current filter
              </p>
              <p className="mt-1.5 text-xs text-slate-600 dark:text-slate-300">
                Clear the search box or switch status to &ldquo;{t.allStatuses}
                &rdquo;.
              </p>
            </div>
          ) : (
            filteredIssues.map((issue) => {
              const afterPhoto = Reflect.get(resolutionPhotos, issue.id) as
                | string
                | undefined;
              return (
                <TrackIssueCard
                  key={issue.id}
                  issue={issue}
                  isSelected={issue.id === selectedIssueId}
                  hasVoted={votedIssueIds.has(issue.id)}
                  {...(afterPhoto !== undefined ? { afterPhoto } : {})}
                  language={language}
                  onSelect={setSelectedIssueId}
                  onUpvote={onUpvoteIssue}
                />
              );
            })
          )}
        </div>

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
              language={language}
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
