import React from 'react';
import { ArrowRightLeft, CheckCircle2, XCircle } from 'lucide-react';
import type { Department } from '../../../shared/types/civic.js';
import type { DepartmentTransferRequest } from '../../lib/admin/adminWorkflowStore.js';
import {
  getUiStrings,
  translateDepartment,
  type AppLanguage,
} from '../../lib/i18n/translations.js';

export interface AdminHandoverQueueProps {
  readonly requests: ReadonlyArray<DepartmentTransferRequest>;
  readonly scopedDepartment: Department | null;
  readonly language: AppLanguage;
  readonly onDecision: (
    request: DepartmentTransferRequest,
    decision: 'Approved' | 'Rejected',
  ) => Promise<void>;
}

export function AdminHandoverQueue({
  requests,
  scopedDepartment,
  language,
  onDecision,
}: AdminHandoverQueueProps): React.ReactElement | null {
  if (requests.length === 0) {
    return null;
  }

  const t = getUiStrings(language);

  return (
    <div className="surface-card mb-5 border-amber-300/80 p-4 dark:border-amber-800/70">
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <h2 className="inline-flex items-center gap-1.5 text-xs font-bold tracking-wide text-[#11131a] uppercase dark:text-white">
          <ArrowRightLeft
            className="h-4 w-4 text-amber-600"
            aria-hidden="true"
          />
          <span>
            {t.transferQueueTitle} ({requests.length})
          </span>
        </h2>
      </div>

      <div className="flex flex-col gap-2">
        {requests.map((req) => (
          <div
            key={req.id}
            className="surface-well flex flex-wrap items-center justify-between gap-3 p-3 text-xs"
          >
            <div className="min-w-0 flex-1">
              <p className="font-bold text-[#11131a] dark:text-white">
                {req.issueTitle}
              </p>
              <p className="mt-0.5 text-[11px] text-slate-600 dark:text-slate-300">
                {translateDepartment(req.fromDepartment, language)} →{' '}
                <strong>
                  {translateDepartment(req.toDepartment, language)}
                </strong>{' '}
                · {req.reason} ({req.requestedBy})
              </p>
            </div>

            {scopedDepartment === null ? (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void onDecision(req, 'Approved')}
                  className="press-feedback inline-flex min-h-[34px] items-center gap-1 rounded-full bg-[#11131a] px-3 py-1 text-[11px] font-bold text-white hover:bg-slate-800 dark:bg-white dark:text-[#11131a]"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Approve &amp; Reassign</span>
                </button>
                <button
                  type="button"
                  onClick={() => void onDecision(req, 'Rejected')}
                  className="press-feedback inline-flex min-h-[34px] items-center gap-1 rounded-full border border-slate-300 bg-white px-3 py-1 text-[11px] font-bold text-red-700 hover:bg-red-50 dark:border-slate-700 dark:bg-slate-900 dark:text-red-300"
                >
                  <XCircle className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Reject</span>
                </button>
              </div>
            ) : (
              <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-bold text-amber-900 dark:bg-amber-950/70 dark:text-amber-200">
                Pending City Ops Approval
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
