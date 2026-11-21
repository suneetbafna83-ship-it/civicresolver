import React from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Sparkles,
  ThumbsUp,
} from 'lucide-react';
import type {
  CivicIssue,
  TriageResponse,
} from '../../../shared/types/civic.js';
import { getUiStrings, type AppLanguage } from '../../lib/i18n/translations.js';
import { getPriorityDotClass } from '../../lib/utils/issueDisplay.js';

export interface TriagePreviewPanelProps {
  readonly triageResponse: TriageResponse | null;
  readonly duplicateMatchedIssue: CivicIssue | null;
  readonly language: AppLanguage;
  readonly onUpvoteDuplicate: (issueId: string) => Promise<void>;
}

export function TriagePreviewPanel({
  triageResponse,
  duplicateMatchedIssue,
  language,
  onUpvoteDuplicate,
}: TriagePreviewPanelProps): React.ReactElement {
  const t = getUiStrings(language);

  return (
    <div aria-live="polite" className="surface-card p-4">
      <div className="flex items-center justify-between border-b border-slate-200/80 pb-2 dark:border-slate-800">
        <div className="flex items-center gap-1.5">
          <Sparkles
            className="h-4 w-4 text-[#3730a3] dark:text-indigo-300"
            aria-hidden="true"
          />
          <h2 className="text-sm font-bold text-[#11131a] dark:text-white">
            {t.aiRoutingTitle}
          </h2>
        </div>
        {triageResponse && (
          <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-[11px] font-bold text-[#3730a3] dark:bg-indigo-950 dark:text-indigo-200">
            {triageResponse.metadata.engine === 'gemini'
              ? 'Gemini Live'
              : 'Civic NLP'}
          </span>
        )}
      </div>

      {!triageResponse ? (
        <p className="py-3 text-center text-xs text-slate-600 dark:text-slate-300">
          {t.aiPreviewHint}
        </p>
      ) : (
        <div className="mt-2.5 flex flex-col gap-2 text-xs">
          {duplicateMatchedIssue && (
            <div className="surface-well flex flex-col gap-1.5 border-amber-400 bg-amber-50/90 p-2.5 dark:border-amber-700 dark:bg-amber-950/50">
              <div className="flex items-center gap-1.5 font-bold text-amber-950 dark:text-amber-100">
                <AlertTriangle
                  className="h-3.5 w-3.5 shrink-0"
                  aria-hidden="true"
                />
                <span>
                  Similar report nearby ({duplicateMatchedIssue.upvoteCount}{' '}
                  affected)
                </span>
              </div>
              <button
                type="button"
                onClick={() => void onUpvoteDuplicate(duplicateMatchedIssue.id)}
                className="press-feedback inline-flex items-center justify-center gap-1.5 rounded-full bg-[#3730a3] px-3 py-1.5 text-[11px] font-semibold text-white"
              >
                <ThumbsUp className="h-3 w-3" aria-hidden="true" />
                <span>+1 Upvote Existing Report Instead</span>
              </button>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <div className="surface-well p-2.5">
              <span className="text-[11px] text-slate-600 dark:text-slate-300">
                Category
              </span>
              <p className="font-bold text-[#11131a] dark:text-white">
                {triageResponse.triage.category}
              </p>
            </div>

            <div className="surface-well p-2.5">
              <span className="text-[11px] text-slate-600 dark:text-slate-300">
                Department
              </span>
              <p className="font-bold text-[#3730a3] dark:text-indigo-300">
                {triageResponse.triage.recommendedDepartment}
              </p>
            </div>

            <div className="surface-well p-2.5">
              <span className="text-[11px] text-slate-600 dark:text-slate-300">
                Priority &amp; Urgency
              </span>
              <div className="mt-0.5 flex items-center gap-1.5">
                <span
                  aria-hidden="true"
                  className={`h-2 w-2 rounded-full ${getPriorityDotClass(
                    triageResponse.triage.priorityLevel,
                  )}`}
                />
                <span className="tabular-nums font-bold text-[#11131a] dark:text-white">
                  {triageResponse.triage.priorityLevel} ·{' '}
                  {triageResponse.triage.urgencyScore}/10
                </span>
              </div>
            </div>

            <div className="surface-well p-2.5">
              <span className="text-[11px] text-slate-600 dark:text-slate-300">
                Target SLA
              </span>
              <p className="tabular-nums mt-0.5 flex items-center gap-1 font-bold text-[#11131a] dark:text-white">
                <Clock className="h-3 w-3" aria-hidden="true" />
                <span>{triageResponse.triage.slaEstimateHours} hrs</span>
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between text-[11px] font-semibold text-emerald-800 dark:text-emerald-300">
            <span className="inline-flex items-center gap-1">
              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
              Authentic (
              {Math.round(
                triageResponse.triage.authenticityCheck.confidence * 100,
              )}
              %)
            </span>
            <span className="max-w-[220px] truncate text-slate-600 dark:text-slate-300">
              {triageResponse.triage.summary}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
