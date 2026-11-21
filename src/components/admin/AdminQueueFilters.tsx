import React from 'react';
import { Lock, Search, X } from 'lucide-react';
import {
  DEPARTMENTS,
  ISSUE_STATUSES,
  type Department,
  type IssueStatus,
} from '../../../shared/types/civic.js';
import {
  getUiStrings,
  translateDepartment,
  translateStatus,
  type AppLanguage,
} from '../../lib/i18n/translations.js';

export interface AdminQueueFiltersProps {
  readonly scopedDepartment: Department | null;
  readonly selectedDepartment: Department | 'ALL';
  readonly selectedStatus: IssueStatus | 'ALL';
  readonly searchQuery: string;
  readonly language: AppLanguage;
  readonly onSelectDepartment: (dept: Department | 'ALL') => void;
  readonly onSelectStatus: (status: IssueStatus | 'ALL') => void;
  readonly onSearchChange: (query: string) => void;
}

export function AdminQueueFilters({
  scopedDepartment,
  selectedDepartment,
  selectedStatus,
  searchQuery,
  language,
  onSelectDepartment,
  onSelectStatus,
  onSearchChange,
}: AdminQueueFiltersProps): React.ReactElement {
  const t = getUiStrings(language);

  return (
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
                aria-pressed={active}
                onClick={() => onSelectDepartment(dept)}
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

      <div className="flex w-full flex-wrap items-center gap-2.5 sm:w-auto">
        <div className="relative flex-1 sm:flex-none">
          <Search
            className="pointer-events-none absolute top-3 left-3.5 h-4 w-4 text-slate-500"
            aria-hidden="true"
          />
          <input
            type="search"
            aria-label="Search admin dispatch queue"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={t.searchPlaceholder}
            className="min-h-[38px] w-full rounded-full border border-slate-300 bg-white py-1.5 pr-8 pl-10 text-xs font-medium text-[#11131a] placeholder:text-slate-500 sm:w-60 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:placeholder:text-slate-400"
          />
          {searchQuery.length > 0 && (
            <button
              type="button"
              onClick={() => onSearchChange('')}
              aria-label="Clear admin search query"
              className="absolute top-2.5 right-2.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-slate-200 text-slate-700 hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-200"
            >
              <X className="h-3 w-3" aria-hidden="true" />
            </button>
          )}
        </div>

        <select
          aria-label="Filter admin queue by status"
          value={selectedStatus}
          onChange={(e) =>
            onSelectStatus(e.target.value as IssueStatus | 'ALL')
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
    </div>
  );
}
