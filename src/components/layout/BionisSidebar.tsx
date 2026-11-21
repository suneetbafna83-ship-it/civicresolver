import React from 'react';
import {
  Building2,
  ClipboardList,
  Lock,
  PlusCircle,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react';
import type {
  CivicSession,
  StorageMode,
} from '../../../shared/types/civic.js';
import {
  getUiStrings,
  type AppLanguage,
} from '../../lib/i18n/translations.js';
import type { ActiveTab } from './TopNav.js';

export interface BionisSidebarProps {
  readonly activeTab: ActiveTab;
  readonly onSelectTab: (tab: ActiveTab) => void;
  readonly session: CivicSession;
  readonly totalIssuesCount: number;
  readonly unresolvedIssuesCount: number;
  readonly storageMode: StorageMode;
  readonly aiConfigured: boolean;
  readonly language: AppLanguage;
  readonly isOpenMobile: boolean;
  readonly onCloseMobile: () => void;
}

export function BionisSidebar({
  activeTab,
  onSelectTab,
  session,
  totalIssuesCount,
  unresolvedIssuesCount,
  storageMode,
  aiConfigured,
  language,
  isOpenMobile,
  onCloseMobile,
}: BionisSidebarProps): React.ReactElement {
  const isAdmin = session.role === 'admin';
  const isCitizen = session.role === 'citizen';
  const scopedDept = isAdmin ? (session.assignedDepartment ?? null) : null;
  const t = getUiStrings(language);

  const handleSelectAndClose = (tab: ActiveTab): void => {
    onSelectTab(tab);
    onCloseMobile();
  };

  return (
    <>
      {/* Mobile Slide-Over Backdrop */}
      {isOpenMobile && (
        <div
          aria-hidden="true"
          onClick={onCloseMobile}
          className="fixed inset-0 z-40 bg-slate-950/50 backdrop-blur-xs lg:hidden"
        />
      )}

      <aside
        aria-label="Workspace navigation rail"
        className={`fixed inset-y-0 left-0 z-50 flex w-[264px] shrink-0 flex-col justify-between border-r border-slate-200/80 bg-white/95 p-4 backdrop-blur-xl transition-transform duration-200 lg:sticky lg:top-0 lg:z-auto lg:h-[calc(100vh-3rem)] lg:w-[248px] lg:self-start lg:translate-x-0 lg:bg-white/55 lg:transition-none dark:border-slate-800/90 dark:bg-slate-950/95 lg:dark:bg-slate-950/45 ${
          isOpenMobile ? 'translate-x-0 shadow-2xl' : '-translate-x-full'
        }`}
      >
        <div className="flex flex-col gap-5">
          {/* Brand Header (Matches Bionis Sidebar Top Block) */}
          <div className="flex items-center justify-between gap-2 px-1">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#3730a3] to-[#581c87] text-white shadow-sm">
                <Building2 className="h-4 w-4" aria-hidden="true" />
              </div>
              <div>
                <p className="text-sm font-bold tracking-tight text-[#11131a] dark:text-white">
                  CivicResolve
                </p>
                <p className="text-[10px] font-bold tracking-wider text-slate-500 uppercase dark:text-slate-400">
                  {isAdmin ? 'Municipal Command' : 'Citizen Portal'}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onCloseMobile}
              aria-label="Close navigation menu"
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 text-slate-600 hover:bg-slate-100 lg:hidden dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>

          {/* Primary Role-Scoped Navigation */}
          <div>
            <p className="mb-2 px-2 text-[10px] font-bold tracking-widest text-slate-500 uppercase dark:text-slate-400">
              {isAdmin ? 'Operations Queue' : 'Citizen Workspace'}
            </p>
            <nav
              aria-label="Primary sections"
              className="flex flex-col gap-1.5"
            >
              {isCitizen && (
                <>
                  <button
                    type="button"
                    onClick={() => handleSelectAndClose('report')}
                    aria-current={activeTab === 'report' ? 'page' : undefined}
                    className={`press-feedback flex min-h-[42px] w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-left text-xs font-semibold ${
                      activeTab === 'report'
                        ? 'bg-[#3730a3] text-white shadow-sm'
                        : 'text-[#11131a] hover:bg-indigo-50/90 hover:text-[#3730a3] dark:text-slate-200 dark:hover:bg-indigo-950/50'
                    }`}
                  >
                    <span className="inline-flex items-center gap-2.5">
                      <PlusCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
                      <span>{t.tabReport}</span>
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSelectAndClose('track')}
                    aria-current={activeTab === 'track' ? 'page' : undefined}
                    className={`press-feedback flex min-h-[42px] w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-left text-xs font-semibold ${
                      activeTab === 'track'
                        ? 'bg-[#0f766e] text-white shadow-sm'
                        : 'text-[#11131a] hover:bg-teal-50/90 hover:text-[#0f766e] dark:text-slate-200 dark:hover:bg-teal-950/50'
                    }`}
                  >
                    <span className="inline-flex items-center gap-2.5">
                      <ClipboardList className="h-4 w-4 shrink-0" aria-hidden="true" />
                      <span>{t.tabTrack}</span>
                    </span>
                    <span
                      className={`tabular-nums rounded-full px-2 py-0.5 text-[11px] font-bold ${
                        activeTab === 'track'
                          ? 'bg-white/20 text-white'
                          : 'bg-teal-100 text-[#0f766e] dark:bg-teal-950 dark:text-teal-200'
                      }`}
                    >
                      {totalIssuesCount}
                    </span>
                  </button>
                </>
              )}

              {isAdmin && (
                <button
                  type="button"
                  onClick={() => handleSelectAndClose('admin')}
                  aria-current="page"
                  className="press-feedback flex min-h-[42px] w-full items-center justify-between gap-2 rounded-xl bg-[#581c87] px-3 py-2 text-left text-xs font-semibold text-white shadow-sm"
                >
                  <span className="inline-flex items-center gap-2.5">
                    <ShieldCheck className="h-4 w-4 shrink-0" aria-hidden="true" />
                    <span>{t.tabAdmin}</span>
                  </span>
                  <span className="tabular-nums rounded-full bg-white/20 px-2 py-0.5 text-[11px] font-bold text-white">
                    {unresolvedIssuesCount}
                  </span>
                </button>
              )}
            </nav>
          </div>

          {/* Access Scope Guard Card */}
          <div className="rounded-2xl border border-slate-200/80 bg-slate-50/85 p-3 dark:border-slate-800 dark:bg-slate-900/75">
            <p className="inline-flex items-center gap-1.5 text-[11px] font-bold text-[#11131a] dark:text-white">
              <Lock className="h-3.5 w-3.5 text-[#581c87] dark:text-purple-300" aria-hidden="true" />
              <span>RBAC Clearance Scope</span>
            </p>
            <p className="mt-1 text-xs font-semibold text-[#3730a3] dark:text-indigo-300">
              {isCitizen
                ? 'Public Citizen Only'
                : scopedDept !== null
                  ? `${scopedDept} Only`
                  : 'City Ops · All 5 Depts'}
            </p>
            <p className="mt-1 text-[11px] leading-relaxed text-slate-600 dark:text-slate-400">
              {isCitizen
                ? 'Admin Command Desk is strictly hidden & blocked.'
                : scopedDept !== null
                  ? `Isolated to ${scopedDept} tasks. Cross-department reads & edits denied.`
                  : 'Full municipal triage & cross-department dispatch clearance.'}
            </p>
          </div>
        </div>

        {/* Bottom Bionis-Inspired AI & Engine Telemetry Promo Card */}
        <div className="mt-4 rounded-2xl border border-indigo-200/80 bg-gradient-to-br from-indigo-50/90 via-purple-50/75 to-amber-50/70 p-3.5 dark:border-indigo-900/60 dark:from-indigo-950/70 dark:via-purple-950/50 dark:to-slate-900">
          <div className="flex items-center gap-2 text-xs font-bold text-[#3730a3] dark:text-indigo-200">
            <Sparkles className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>Civic AI &amp; Vault</span>
          </div>
          <div className="mt-2 flex flex-col gap-1.5 text-[11px] font-medium text-slate-700 dark:text-slate-300">
            <div className="flex items-center justify-between gap-2">
              <span>AI Triage</span>
              <span className="rounded-full bg-white/85 px-2 py-0.5 text-[10px] font-bold text-[#3730a3] dark:bg-slate-800 dark:text-indigo-200">
                {aiConfigured ? 'Gemini Live' : 'Deterministic NLP'}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span>Storage</span>
              <span className="rounded-full bg-white/85 px-2 py-0.5 text-[10px] font-bold text-[#0f766e] dark:bg-slate-800 dark:text-teal-200">
                {storageMode === 'firestore' ? 'Firestore' : 'Local Safe'}
              </span>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
