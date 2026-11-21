import React, { useState } from 'react';
import { Building2, Lock, ShieldCheck } from 'lucide-react';
import {
  DEPARTMENTS,
  type Department,
} from '../../../shared/types/civic.js';
import {
  getUiStrings,
  translateDepartment,
  type AppLanguage,
} from '../../lib/i18n/translations.js';

export interface AdminPortalCardProps {
  readonly language: AppLanguage;
  readonly onAdminSignIn: (
    officerEmail: string,
    passcode: string,
    department: Department | null,
  ) => Promise<void>;
  readonly onAdminQuickDemoSignIn: (
    department?: Department | null,
  ) => Promise<void>;
}

export function AdminPortalCard({
  language,
  onAdminSignIn,
  onAdminQuickDemoSignIn,
}: AdminPortalCardProps): React.ReactElement {
  const t = getUiStrings(language);
  const [adminDepartment, setAdminDepartment] = useState<Department | 'ALL'>(
    'Water & Sewage',
  );
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPasscode, setAdminPasscode] = useState('');
  const [adminError, setAdminError] = useState<string | null>(null);
  const [adminBusy, setAdminBusy] = useState(false);

  const handleAdminSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setAdminError(null);
    if (adminEmail.trim().length < 3 || adminPasscode.length < 4) {
      setAdminError('Enter valid municipal officer email and department passkey.');
      return;
    }
    setAdminBusy(true);
    try {
      const requestedScope =
        adminDepartment === 'ALL' ? null : adminDepartment;
      await onAdminSignIn(adminEmail.trim(), adminPasscode, requestedScope);
    } catch (err) {
      setAdminError(
        err instanceof Error
          ? err.message
          : 'Municipal Admin authentication failed.',
      );
    } finally {
      setAdminBusy(false);
    }
  };

  return (
    <article
      aria-labelledby="admin-login-heading"
      className="surface-card flex flex-col justify-between gap-3.5 p-5"
    >
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2 border-b border-slate-200/80 pb-2.5 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#11131a] text-white dark:bg-white dark:text-[#11131a]">
              <ShieldCheck className="h-4 w-4" aria-hidden="true" />
            </div>
            <div>
              <h2
                id="admin-login-heading"
                className="text-base font-bold text-[#11131a] dark:text-white"
              >
                {t.adminPortalTitle}
              </h2>
              <p className="text-[11px] font-medium text-slate-600 dark:text-slate-300">
                {t.adminPortalSub}
              </p>
            </div>
          </div>
          <span className="shrink-0 whitespace-nowrap rounded-full bg-[#11131a] px-2.5 py-0.5 text-[11px] font-bold text-white dark:bg-white dark:text-[#11131a]">
            {t.adminRoleBadge}
          </span>
        </div>

        <div className="surface-well p-2.5">
          <button
            type="button"
            disabled={adminBusy}
            onClick={() => void onAdminQuickDemoSignIn(null)}
            className="press-feedback flex min-h-[40px] w-full items-center justify-center gap-2 rounded-full bg-[#11131a] px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 dark:bg-white dark:text-[#11131a]"
          >
            <ShieldCheck className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>{t.enterAdminDemoBtn}</span>
          </button>
        </div>

        <form
          onSubmit={(e) => void handleAdminSubmit(e)}
          className="flex flex-col gap-2"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-bold text-[#11131a] dark:text-white">
              {t.verifiedOfficerHeading}
            </span>
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-[#581c87] dark:text-purple-300">
              <Building2 className="h-3 w-3" aria-hidden="true" />
              {t.roleDeptCheckedBadge}
            </span>
          </div>

          <div>
            <label
              htmlFor="admin-department-select"
              className="block text-[11px] font-semibold text-[#11131a] dark:text-white"
            >
              {t.deptClearanceLabel}
            </label>
            <select
              id="admin-department-select"
              value={adminDepartment}
              onChange={(e) =>
                setAdminDepartment(e.target.value as Department | 'ALL')
              }
              className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-[#11131a] dark:border-slate-700 dark:bg-slate-900 dark:text-white"
            >
              {DEPARTMENTS.map((dept) => (
                <option key={dept} value={dept}>
                  {translateDepartment(dept, language)} ({t.scopedStaffSuffix})
                </option>
              ))}
              <option value="ALL">{t.allDeptsSuperAdmin}</option>
            </select>
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div>
              <label
                htmlFor="admin-email-input"
                className="block text-[11px] font-semibold text-[#11131a] dark:text-white"
              >
                {t.officerEmailLabel}
              </label>
              <input
                id="admin-email-input"
                type="email"
                autoComplete="username"
                required
                value={adminEmail}
                onChange={(e) => setAdminEmail(e.target.value)}
                placeholder="water.staff@civicresolve.gov"
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-[#11131a] dark:border-slate-700 dark:bg-slate-900 dark:text-white"
              />
            </div>

            <div>
              <label
                htmlFor="admin-passcode-input"
                className="block text-[11px] font-semibold text-[#11131a] dark:text-white"
              >
                {t.officerPasskeyLabel}
              </label>
              <input
                id="admin-passcode-input"
                type="password"
                autoComplete="current-password"
                required
                minLength={4}
                value={adminPasscode}
                onChange={(e) => setAdminPasscode(e.target.value)}
                placeholder="Department passkey"
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-[#11131a] dark:border-slate-700 dark:bg-slate-900 dark:text-white"
              />
            </div>
          </div>

          {adminError && (
            <p
              role="alert"
              className="rounded-xl border border-red-300 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-900 dark:border-red-900 dark:bg-red-950/60 dark:text-red-200"
            >
              {adminError}
            </p>
          )}

          <button
            type="submit"
            disabled={adminBusy}
            className="press-feedback min-h-[38px] rounded-full border border-slate-300 bg-white px-4 py-2 text-xs font-bold text-[#11131a] hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
          >
            {adminBusy
              ? t.analyzingLabel
              : `${t.adminSignInSubmit} (${
                  adminDepartment === 'ALL'
                    ? t.allDepartments
                    : translateDepartment(adminDepartment, language)
                })`}
          </button>
        </form>
      </div>

      <p className="border-t border-slate-200/80 pt-2 text-[11px] font-medium text-slate-600 dark:border-slate-800 dark:text-slate-300">
        <Lock className="mr-1 inline h-3 w-3" aria-hidden="true" />
        {t.adminLockNote}
      </p>
    </article>
  );
}
