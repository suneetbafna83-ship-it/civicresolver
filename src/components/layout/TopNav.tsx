import React from 'react';
import {
  Building2,
  ClipboardList,
  Globe,
  LogOut,
  Moon,
  PlusCircle,
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
}

export function TopNav({
  activeTab,
  onSelectTab,
  totalIssuesCount,
  unresolvedIssuesCount,
  session,
  darkTheme,
  language,
  onToggleLanguage,
  onToggleTheme,
  onSignOutPortal,
}: TopNavProps): React.ReactElement {
  const isAdmin = session?.role === 'admin';
  const isCitizen = session?.role === 'citizen';
  const t = getUiStrings(language);

  return (
    <header className="w-full border-b border-slate-200/70 px-4 py-3 sm:px-8 dark:border-slate-800/80">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2.5 sm:gap-4">
        {/* Left: Brand Identity + Active Workspace Lock Badge */}
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#3730a3] text-white">
            <Building2 className="h-4 w-4" aria-hidden="true" />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-bold tracking-tight text-[#11131a] sm:text-base dark:text-white">
              CivicResolve
            </span>
            {session ? (
              <span
                className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold text-white ${
                  isAdmin ? 'bg-[#581c87]' : 'bg-[#3730a3]'
                }`}
              >
                {isAdmin ? 'Admin Workspace' : 'Citizen Workspace'}
              </span>
            ) : (
              <span className="rounded-full bg-indigo-100 px-2.5 py-0.5 text-[11px] font-semibold text-[#3730a3] dark:bg-indigo-950/70 dark:text-indigo-200">
                Sign-In Gate
              </span>
            )}
          </div>
        </div>

        {/* Center: Distinct Color-Tinted Tabs (Indigo / Teal / Plum) */}
        <nav
          aria-label="Primary sections"
          className="flex flex-wrap items-center gap-1.5 rounded-full border border-slate-200/90 bg-white/90 p-1 shadow-2xs dark:border-slate-800 dark:bg-slate-900/90"
        >
          {isCitizen && (
            <>
              <button
                type="button"
                onClick={() => onSelectTab('report')}
                aria-current={activeTab === 'report' ? 'page' : undefined}
                className={`press-feedback inline-flex min-h-[36px] items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold sm:px-4 ${
                  activeTab === 'report'
                    ? 'bg-[#3730a3] text-white shadow-xs'
                    : 'text-[#11131a] hover:bg-indigo-50 hover:text-[#3730a3] dark:text-slate-200 dark:hover:bg-indigo-950/50'
                }`}
              >
                <PlusCircle className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{t.tabReport}</span>
              </button>

              <button
                type="button"
                onClick={() => onSelectTab('track')}
                aria-current={activeTab === 'track' ? 'page' : undefined}
                className={`press-feedback inline-flex min-h-[36px] items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold sm:px-4 ${
                  activeTab === 'track'
                    ? 'bg-[#0f766e] text-white shadow-xs'
                    : 'text-[#11131a] hover:bg-teal-50 hover:text-[#0f766e] dark:text-slate-200 dark:hover:bg-teal-950/50'
                }`}
              >
                <ClipboardList className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{t.tabTrack}</span>
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
              onClick={() => onSelectTab('admin')}
              aria-current="page"
              className="press-feedback inline-flex min-h-[36px] items-center gap-1.5 rounded-full bg-[#581c87] px-4 py-1.5 text-xs font-semibold text-white shadow-xs"
            >
              <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{t.tabAdmin}</span>
              <span className="tabular-nums rounded-full bg-white/20 px-2 py-0.5 text-[11px] font-bold text-white">
                {unresolvedIssuesCount} Pending
              </span>
            </button>
          )}

          {!session && (
            <span className="px-3.5 py-1 text-xs font-semibold text-[#11131a] dark:text-white">
              Select Citizen or Admin Portal Below
            </span>
          )}
        </nav>

        {/* Right: Language Toggle + User + Sign Out + Theme */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onToggleLanguage}
            aria-label="Toggle language between English and Hindi"
            className="press-feedback inline-flex min-h-[36px] items-center gap-1 rounded-full border border-indigo-200 bg-indigo-50/80 px-3 py-1.5 text-xs font-bold text-[#3730a3] hover:bg-indigo-100 dark:border-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-200"
          >
            <Globe className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{language === 'en' ? 'EN / हिंदी' : 'हिंदी / EN'}</span>
          </button>

          {session && (
            <>
              <span className="hidden items-center gap-1.5 rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-[#11131a] md:inline-flex dark:border-slate-700 dark:bg-slate-800 dark:text-white">
                {isAdmin ? (
                  <ShieldCheck className="h-3.5 w-3.5 text-[#581c87] dark:text-purple-300" aria-hidden="true" />
                ) : (
                  <User className="h-3.5 w-3.5 text-[#3730a3] dark:text-indigo-300" aria-hidden="true" />
                )}
                <span className="max-w-[110px] truncate">
                  {session.displayName}
                </span>
              </span>

              <button
                type="button"
                onClick={onSignOutPortal}
                className="press-feedback inline-flex min-h-[36px] items-center gap-1.5 rounded-full bg-[#11131a] px-3.5 py-1.5 text-xs font-semibold text-white hover:opacity-90 dark:bg-white dark:text-[#11131a]"
              >
                <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
                <span className="hidden sm:inline">{t.signOutSwitch}</span>
                <span className="sm:hidden">Switch</span>
              </button>
            </>
          )}

          <button
            type="button"
            onClick={onToggleTheme}
            aria-label={
              darkTheme ? 'Switch to light theme' : 'Switch to dark theme'
            }
            className="press-feedback inline-flex min-h-[36px] items-center gap-1 rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-[#11131a] hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
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
