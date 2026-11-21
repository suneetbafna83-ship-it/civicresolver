import React from 'react';
import {
  Building2,
  Globe,
  Lock,
  LogOut,
  Menu,
  Moon,
  ShieldCheck,
  Sun,
  User,
} from 'lucide-react';
import type {
  CivicSession,
  StorageMode,
} from '../../../shared/types/civic.js';
import {
  getUiStrings,
  translateDepartment,
  type AppLanguage,
} from '../../lib/i18n/translations.js';

export type ActiveTab = 'report' | 'track' | 'admin';

export interface TopNavProps {
  readonly activeTab: ActiveTab;
  readonly onSelectTab: (tab: ActiveTab) => void;
  readonly totalIssuesCount: number;
  readonly unresolvedIssuesCount: number;
  readonly session: CivicSession | null;
  readonly storageMode: StorageMode;
  readonly aiConfigured: boolean;
  readonly darkTheme: boolean;
  readonly language: AppLanguage;
  readonly onToggleLanguage: () => void;
  readonly onToggleTheme: () => void;
  readonly onSignOutPortal: () => void;
  readonly onOpenMobileNav?: () => void;
}

export function TopNav({
  activeTab,
  onSelectTab,
  totalIssuesCount,
  session,
  darkTheme,
  language,
  onToggleLanguage,
  onToggleTheme,
  onSignOutPortal,
  onOpenMobileNav,
}: TopNavProps): React.ReactElement {
  const isAdmin = session?.role === 'admin';
  const isCitizen = session?.role === 'citizen';
  const scopedDept = isAdmin ? (session?.assignedDepartment ?? null) : null;
  const t = getUiStrings(language);

  const activeHeadline = !session
    ? 'CivicResolve'
    : isAdmin
      ? scopedDept !== null
        ? translateDepartment(scopedDept, language)
        : t.tabAdmin
      : activeTab === 'track'
        ? t.tabTrack
        : t.tabReport;

  return (
    <header className="w-full border-b border-slate-200/70 px-3.5 py-2.5 sm:px-6 dark:border-slate-800/80">
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        {/* Left: Mobile Drawer Toggle / Sign-In Gate Identity + Active Scope Pill */}
        <div className="flex min-w-0 items-center gap-2.5">
          {session && onOpenMobileNav && (
            <button
              type="button"
              onClick={onOpenMobileNav}
              aria-label="Open navigation menu"
              className="press-feedback inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-300 bg-white text-[#11131a] hover:bg-slate-100 lg:hidden dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            >
              <Menu className="h-4 w-4" aria-hidden="true" />
            </button>
          )}

          {!session && (
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#3730a3] to-[#581c87] text-white">
              <Building2 className="h-4 w-4" aria-hidden="true" />
            </div>
          )}

          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="truncate text-sm font-bold tracking-tight text-[#11131a] sm:text-base dark:text-white">
              {activeHeadline}
            </span>

            {session ? (
              <div className="flex flex-wrap items-center gap-1.5">
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold text-white ${
                    isAdmin ? 'bg-[#581c87]' : 'bg-[#3730a3]'
                  }`}
                >
                  {isAdmin && scopedDept !== null && (
                    <Lock className="h-3 w-3" aria-hidden="true" />
                  )}
                  <span>
                    {isAdmin
                      ? scopedDept !== null
                        ? `${translateDepartment(scopedDept, language)} ${t.onlyTag}`
                        : t.allDeptAdminTag
                      : t.citizenWorkspaceTag}
                  </span>
                </span>
                {(session.isPreviewAdmin || session.isAnonymous) && (
                  <span className="rounded-full border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200">
                    Demo Mode
                  </span>
                )}
              </div>
            ) : (
              <span className="rounded-full bg-indigo-100 px-2.5 py-0.5 text-[11px] font-semibold text-[#3730a3] dark:bg-indigo-950/70 dark:text-indigo-200">
                {t.gateBadge}
              </span>
            )}
          </div>
        </div>

        {/* Right: Mobile Quick Switch + EN / हिंदी / தமிழ் Language Toggle + Signed-In Identity + Sign Out + Theme */}
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
          {isCitizen && (
            <button
              type="button"
              onClick={() =>
                onSelectTab(activeTab === 'report' ? 'track' : 'report')
              }
              aria-label="Quick switch citizen mobile view"
              className="press-feedback inline-flex min-h-[38px] items-center gap-1 rounded-full bg-[#0f766e] px-3 py-1.5 text-xs font-bold text-white shadow-xs lg:hidden"
            >
              <span>
                {activeTab === 'report'
                  ? `Track (${totalIssuesCount})`
                  : 'New Report'}
              </span>
            </button>
          )}

          <button
            type="button"
            onClick={onToggleLanguage}
            aria-label="Toggle language between English and Hindi and Tamil"
            className="press-feedback inline-flex min-h-[38px] items-center gap-1.5 rounded-full border border-indigo-200 bg-indigo-50/85 px-3 py-1.5 text-xs font-bold text-[#3730a3] hover:bg-indigo-100 dark:border-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-200"
          >
            <Globe className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span className="hidden sm:inline">{t.languageBadge}</span>
            <span className="sm:hidden">{t.languageShort}</span>
          </button>

          {session && (
            <>
              <span className="hidden items-center gap-1.5 rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-[#11131a] md:inline-flex dark:border-slate-700 dark:bg-slate-800 dark:text-white">
                {isAdmin ? (
                  <ShieldCheck
                    className="h-3.5 w-3.5 text-[#581c87] dark:text-purple-300"
                    aria-hidden="true"
                  />
                ) : (
                  <User
                    className="h-3.5 w-3.5 text-[#3730a3] dark:text-indigo-300"
                    aria-hidden="true"
                  />
                )}
                <span className="max-w-[180px] truncate lg:max-w-[260px]">
                  {session.displayName}
                </span>
              </span>

              <button
                type="button"
                onClick={onSignOutPortal}
                aria-label="Sign Out / Switch Portal"
                className="press-feedback inline-flex min-h-[38px] items-center gap-1.5 rounded-full bg-[#11131a] px-3.5 py-1.5 text-xs font-semibold text-white hover:opacity-90 dark:bg-white dark:text-[#11131a]"
              >
                <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
                <span className="hidden sm:inline">{t.signOutSwitch}</span>
                <span className="sm:hidden">{t.switchShort}</span>
              </button>
            </>
          )}

          <button
            type="button"
            onClick={onToggleTheme}
            aria-label={
              darkTheme ? 'Switch to light theme' : 'Switch to dark theme'
            }
            className="press-feedback inline-flex min-h-[38px] min-w-[38px] items-center justify-center rounded-full border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-[#11131a] hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
          >
            {darkTheme ? (
              <Sun className="h-3.5 w-3.5" aria-hidden="true" />
            ) : (
              <Moon className="h-3.5 w-3.5" aria-hidden="true" />
            )}
          </button>
        </div>
      </div>
    </header>
  );
}
