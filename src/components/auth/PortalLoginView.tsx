import React, { useState } from 'react';
import {
  Building2,
  Lock,
  ShieldCheck,
  User,
  UserCheck,
} from 'lucide-react';
import {
  DEPARTMENTS,
  type Department,
} from '../../../shared/types/civic.js';
import {
  getUiStrings,
  translateDepartment,
  type AppLanguage,
} from '../../lib/i18n/translations.js';

export interface PortalLoginViewProps {
  readonly language?: AppLanguage;
  readonly onCitizenGuestSignIn: () => Promise<void>;
  readonly onCitizenGoogleSignIn: () => Promise<void>;
  readonly onCitizenEmailSignIn: (
    email: string,
    password: string,
  ) => Promise<void>;
  readonly onCitizenEmailSignUp: (
    email: string,
    password: string,
    displayName: string,
  ) => Promise<void>;
  readonly onAdminSignIn: (
    officerEmail: string,
    passcode: string,
    department: Department | null,
  ) => Promise<void>;
  readonly onAdminQuickDemoSignIn: (
    department?: Department | null,
  ) => Promise<void>;
}

export function PortalLoginView({
  language = 'en',
  onCitizenGuestSignIn,
  onCitizenGoogleSignIn,
  onCitizenEmailSignIn,
  onCitizenEmailSignUp,
  onAdminSignIn,
  onAdminQuickDemoSignIn,
}: PortalLoginViewProps): React.ReactElement {
  const t = getUiStrings(language);

  // Citizen Login Form State
  const [citizenMode, setCitizenMode] = useState<'signin' | 'signup'>('signin');
  const [citizenEmail, setCitizenEmail] = useState('');
  const [citizenPassword, setCitizenPassword] = useState('');
  const [citizenName, setCitizenName] = useState('');
  const [citizenError, setCitizenError] = useState<string | null>(null);
  const [citizenBusy, setCitizenBusy] = useState(false);

  // Admin Login Form State
  const [adminDepartment, setAdminDepartment] = useState<Department | 'ALL'>(
    'Water & Sewage',
  );
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPasscode, setAdminPasscode] = useState('');
  const [adminError, setAdminError] = useState<string | null>(null);
  const [adminBusy, setAdminBusy] = useState(false);

  const handleCitizenSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setCitizenError(null);
    setCitizenBusy(true);
    try {
      if (citizenMode === 'signin') {
        await onCitizenEmailSignIn(citizenEmail, citizenPassword);
      } else {
        await onCitizenEmailSignUp(
          citizenEmail,
          citizenPassword,
          citizenName || 'Civic Citizen',
        );
      }
    } catch (err) {
      setCitizenError(
        err instanceof Error
          ? err.message
          : 'Citizen login failed. Check your credentials or use 1-Click Citizen Login.',
      );
    } finally {
      setCitizenBusy(false);
    }
  };

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
    <section
      aria-labelledby="portal-gate-heading"
      className="mx-auto flex h-full w-full max-w-6xl flex-col justify-center px-4 py-4 sm:px-8"
    >
      {/* Prominent Single-Color Black Editorial Hero Header Aligned Over Both Dashboards */}
      <div className="mb-6 w-full text-center">
        <h1
          id="portal-gate-heading"
          className="text-3xl leading-[1.1] font-black tracking-tight text-[#11131a] sm:text-4xl lg:text-[2.85rem] xl:text-5xl dark:text-white"
        >
          {t.gateWelcomePrefix} {t.gateWelcomeMain}
        </h1>
        <p className="mx-auto mt-2 max-w-3xl text-xs font-medium text-slate-700 sm:text-sm dark:text-slate-300">
          {t.gateSubtitle}
        </p>
      </div>

      {/* 2 Side-by-Side Workspace Dashboards Aligned Directly Under the Hero Message */}
      <div className="grid w-full grid-cols-1 items-stretch gap-5 lg:grid-cols-2">
        {/* LEFT CARD: CITIZEN PORTAL LOGIN ONLY */}
        <article
          aria-labelledby="citizen-login-heading"
          className="surface-card flex flex-col justify-between gap-3.5 p-5"
        >
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-2 border-b border-slate-200/80 pb-2.5 dark:border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#11131a] text-white dark:bg-white dark:text-[#11131a]">
                  <User className="h-4 w-4" aria-hidden="true" />
                </div>
                <div>
                  <h2
                    id="citizen-login-heading"
                    className="text-base font-bold text-[#11131a] dark:text-white"
                  >
                    {t.citizenPortalTitle}
                  </h2>
                  <p className="text-[11px] font-medium text-slate-600 dark:text-slate-300">
                    {t.citizenPortalSub}
                  </p>
                </div>
              </div>
              <span className="shrink-0 whitespace-nowrap rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-bold text-[#11131a] dark:bg-slate-800 dark:text-white">
                {t.citizenRoleBadge}
              </span>
            </div>

            {/* Instant Citizen Access Buttons */}
            <div className="surface-well grid grid-cols-1 gap-2 p-2.5 sm:grid-cols-2">
              <button
                type="button"
                disabled={citizenBusy}
                onClick={() => void onCitizenGuestSignIn()}
                className="press-feedback inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-full bg-[#11131a] px-3.5 py-2 text-xs font-semibold text-white hover:opacity-90 dark:bg-white dark:text-[#11131a]"
              >
                <User className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span>{t.enterCitizenWorkspace}</span>
              </button>

              <button
                type="button"
                disabled={citizenBusy}
                onClick={() => {
                  setCitizenError(null);
                  setCitizenBusy(true);
                  void onCitizenGoogleSignIn()
                    .catch((err: unknown) => {
                      setCitizenError(
                        err instanceof Error
                          ? err.message
                          : 'Google Sign-In unavailable.',
                      );
                    })
                    .finally(() => setCitizenBusy(false));
                }}
                className="press-feedback inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-full border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-[#11131a] hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              >
                <UserCheck className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span>{t.citizenGoogleBtn}</span>
              </button>
            </div>

            {/* Citizen Email & Password Form */}
            <form
              onSubmit={(e) => void handleCitizenSubmit(e)}
              className="flex flex-col gap-2.5"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-[#11131a] dark:text-white">
                  {citizenMode === 'signin'
                    ? t.citizenEmailHeading
                    : t.citizenRegisterHeading}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setCitizenMode((prev) =>
                      prev === 'signin' ? 'signup' : 'signin',
                    )
                  }
                  className="text-[11px] font-semibold text-slate-700 underline hover:text-[#11131a] dark:text-slate-300 dark:hover:text-white"
                >
                  {citizenMode === 'signin'
                    ? t.createCitizenLink
                    : t.haveAccountLink}
                </button>
              </div>

              {citizenMode === 'signup' && (
                <div>
                  <label
                    htmlFor="citizen-name-input"
                    className="block text-[11px] font-semibold text-[#11131a] dark:text-white"
                  >
                    {t.fullNameLabel}
                  </label>
                  <input
                    id="citizen-name-input"
                    type="text"
                    required
                    value={citizenName}
                    onChange={(e) => setCitizenName(e.target.value)}
                    placeholder="Rajesh Sharma"
                    className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-[#11131a] dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                  />
                </div>
              )}

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="citizen-email-input"
                    className="block text-[11px] font-semibold text-[#11131a] dark:text-white"
                  >
                    {t.citizenEmailLabel}
                  </label>
                  <input
                    id="citizen-email-input"
                    type="email"
                    required
                    value={citizenEmail}
                    onChange={(e) => setCitizenEmail(e.target.value)}
                    placeholder="citizen@community.org"
                    className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-[#11131a] dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                  />
                </div>

                <div>
                  <label
                    htmlFor="citizen-password-input"
                    className="block text-[11px] font-semibold text-[#11131a] dark:text-white"
                  >
                    {t.passwordLabel}
                  </label>
                  <input
                    id="citizen-password-input"
                    type="password"
                    required
                    minLength={6}
                    value={citizenPassword}
                    onChange={(e) => setCitizenPassword(e.target.value)}
                    placeholder="Min 6 characters"
                    className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-[#11131a] dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                  />
                </div>
              </div>

              {citizenError && (
                <p
                  role="alert"
                  className="rounded-xl border border-red-300 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-900 dark:border-red-900 dark:bg-red-950/60 dark:text-red-200"
                >
                  {citizenError}
                </p>
              )}

              <button
                type="submit"
                disabled={citizenBusy}
                className="press-feedback min-h-[38px] rounded-full border border-slate-300 bg-white px-4 py-2 text-xs font-bold text-[#11131a] hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              >
                {citizenBusy
                  ? t.submittingLabel
                  : citizenMode === 'signin'
                    ? t.citizenEmailSubmit
                    : t.citizenRegisterSubmit}
              </button>
            </form>
          </div>

          <p className="border-t border-slate-200/80 pt-2 text-[11px] font-medium text-slate-600 dark:border-slate-800 dark:text-slate-300">
            <Lock className="mr-1 inline h-3 w-3" aria-hidden="true" />
            {t.citizenLockNote}
          </p>
        </article>

        {/* RIGHT CARD: MUNICIPAL ADMIN PORTAL LOGIN ONLY */}
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

            {/* 1-Click Demo Admin ONLY (No Staff Demo Button) */}
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

            {/* Verified Department Staff & Officer Credentials Form */}
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
      </div>
    </section>
  );
}
