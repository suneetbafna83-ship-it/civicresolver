import React, { useState } from 'react';
import { Lock, User, UserCheck } from 'lucide-react';
import { getUiStrings, type AppLanguage } from '../../lib/i18n/translations.js';

export interface CitizenPortalCardProps {
  readonly language: AppLanguage;
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
}

export function CitizenPortalCard({
  language,
  onCitizenGuestSignIn,
  onCitizenGoogleSignIn,
  onCitizenEmailSignIn,
  onCitizenEmailSignUp,
}: CitizenPortalCardProps): React.ReactElement {
  const t = getUiStrings(language);
  const [citizenMode, setCitizenMode] = useState<'signin' | 'signup'>('signin');
  const [citizenEmail, setCitizenEmail] = useState('');
  const [citizenPassword, setCitizenPassword] = useState('');
  const [citizenName, setCitizenName] = useState('');
  const [citizenError, setCitizenError] = useState<string | null>(null);
  const [citizenBusy, setCitizenBusy] = useState(false);

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

  return (
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

        <form
          onSubmit={(e) => void handleCitizenSubmit(e)}
          className="flex flex-col gap-2.5"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-bold text-[#11131a] dark:text-white">
              {citizenMode === 'signin'
                ? t.citizenEmailHeading
                : t.citizenRegisterHeading}
            </span>
            <div
              role="group"
              aria-label="Citizen email authentication mode"
              className="inline-flex rounded-full border border-slate-300 bg-slate-100 p-0.5 dark:border-slate-700 dark:bg-slate-800"
            >
              <button
                type="button"
                aria-pressed={citizenMode === 'signin'}
                onClick={() => {
                  setCitizenMode('signin');
                  setCitizenError(null);
                }}
                className={`rounded-full px-3 py-1 text-[11px] font-bold transition-colors ${
                  citizenMode === 'signin'
                    ? 'bg-[#11131a] text-white dark:bg-white dark:text-[#11131a]'
                    : 'text-slate-700 hover:text-[#11131a] dark:text-slate-300 dark:hover:text-white'
                }`}
              >
                Sign In
              </button>
              <button
                type="button"
                aria-pressed={citizenMode === 'signup'}
                onClick={() => {
                  setCitizenMode('signup');
                  setCitizenError(null);
                }}
                className={`rounded-full px-3 py-1 text-[11px] font-bold transition-colors ${
                  citizenMode === 'signup'
                    ? 'bg-[#11131a] text-white dark:bg-white dark:text-[#11131a]'
                    : 'text-slate-700 hover:text-[#11131a] dark:text-slate-300 dark:hover:text-white'
                }`}
              >
                {t.createCitizenLink}
              </button>
            </div>
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
                autoComplete="name"
                value={citizenName}
                onChange={(e) => setCitizenName(e.target.value)}
                placeholder="Rajesh Sharma (optional)"
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
                autoComplete="email"
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
                autoComplete={
                  citizenMode === 'signin' ? 'current-password' : 'new-password'
                }
                required
                minLength={6}
                value={citizenPassword}
                onChange={(e) => setCitizenPassword(e.target.value)}
                placeholder="Min 6 characters"
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-[#11131a] dark:border-slate-700 dark:bg-slate-900 dark:text-white"
              />
            </div>
          </div>

          <p className="text-[11px] font-medium text-emerald-800 dark:text-emerald-300">
            ✓ New citizen email IDs are automatically registered &amp; verified.
          </p>

          {citizenError && (
            <div
              role="alert"
              className="flex flex-col gap-1.5 rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-xs font-semibold text-red-900 dark:border-red-900 dark:bg-red-950/60 dark:text-red-200"
            >
              <span>{citizenError}</span>
            </div>
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
  );
}
