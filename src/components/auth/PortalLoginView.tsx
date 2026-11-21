import React from 'react';
import type { Department } from '../../../shared/types/civic.js';
import { getUiStrings, type AppLanguage } from '../../lib/i18n/translations.js';
import { AdminPortalCard } from './AdminPortalCard.js';
import { CitizenPortalCard } from './CitizenPortalCard.js';

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

  return (
    <section
      aria-labelledby="portal-gate-heading"
      className="mx-auto flex h-full w-full max-w-6xl flex-col justify-center px-4 py-4 sm:px-8"
    >
      <div className="mb-5 w-full text-center">
        <h1
          id="portal-gate-heading"
          className="text-2xl leading-[1.1] font-black tracking-tight text-[#11131a] sm:text-4xl lg:text-[2.85rem] xl:text-5xl dark:text-white"
        >
          {t.gateWelcomePrefix} {t.gateWelcomeMain}
        </h1>
        <p className="mx-auto mt-2 max-w-3xl text-xs font-medium text-slate-700 sm:text-sm dark:text-slate-300">
          {t.gateSubtitle}
        </p>
        <div className="mt-2.5 flex flex-wrap items-center justify-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-300 bg-emerald-50 px-3 py-1 text-[11px] font-bold text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200">
            <span
              aria-hidden="true"
              className="h-2 w-2 rounded-full bg-emerald-600"
            />
            Demo Mode Ready for Both Citizens &amp; Municipal Admins (Zero Sign-Up Needed)
          </span>
        </div>
      </div>

      <div className="grid w-full grid-cols-1 items-stretch gap-5 lg:grid-cols-2">
        <CitizenPortalCard
          language={language}
          onCitizenGuestSignIn={onCitizenGuestSignIn}
          onCitizenGoogleSignIn={onCitizenGoogleSignIn}
          onCitizenEmailSignIn={onCitizenEmailSignIn}
          onCitizenEmailSignUp={onCitizenEmailSignUp}
        />
        <AdminPortalCard
          language={language}
          onAdminSignIn={onAdminSignIn}
          onAdminQuickDemoSignIn={onAdminQuickDemoSignIn}
        />
      </div>
    </section>
  );
}
