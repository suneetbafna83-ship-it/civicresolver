import React from 'react';
import { History } from 'lucide-react';
import type { MunicipalAuditEntry } from '../../lib/admin/adminWorkflowStore.js';
import { getUiStrings, type AppLanguage } from '../../lib/i18n/translations.js';

export interface AdminAuditLogPanelProps {
  readonly entries: ReadonlyArray<MunicipalAuditEntry>;
  readonly language: AppLanguage;
}

export function AdminAuditLogPanel({
  entries,
  language,
}: AdminAuditLogPanelProps): React.ReactElement {
  const t = getUiStrings(language);

  return (
    <div className="surface-card mb-5 p-4">
      <div className="mb-2.5 flex items-center justify-between">
        <h2 className="inline-flex items-center gap-1.5 text-xs font-bold tracking-wide text-[#11131a] uppercase dark:text-white">
          <History className="h-4 w-4 text-[#3730a3]" aria-hidden="true" />
          <span>{t.auditLogTitle}</span>
        </h2>
        <span className="text-[11px] font-medium text-slate-500">
          Append-Only Session Trail
        </span>
      </div>

      {entries.length === 0 ? (
        <p className="text-xs text-slate-600 dark:text-slate-300">
          No administrative mutations logged yet. Status changes, dispatch notes, proof uploads, and handovers appear here automatically.
        </p>
      ) : (
        <div className="flex max-h-48 flex-col gap-1.5 overflow-y-auto">
          {entries.slice(0, 15).map((entry) => (
            <div
              key={entry.id}
              className="surface-well flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-[11px]"
            >
              <div className="min-w-0">
                <span className="font-mono font-bold text-[#3730a3] dark:text-indigo-300">
                  [{entry.action}]
                </span>{' '}
                <strong className="text-[#11131a] dark:text-white">
                  {entry.issueTitle}
                </strong>{' '}
                — {entry.details}
              </div>
              <span className="tabular-nums shrink-0 text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                {entry.actorName} · {entry.timestamp.slice(11, 19)}Z
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
