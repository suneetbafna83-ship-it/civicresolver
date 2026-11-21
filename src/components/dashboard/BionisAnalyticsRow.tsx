import React, { useMemo } from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Sparkles,
  TrendingUp,
} from 'lucide-react';
import {
  DEPARTMENTS,
  type CivicIssue,
  type Department,
  type PriorityLevel,
} from '../../../shared/types/civic.js';
import { computeSlaStatus } from '../../lib/utils/slaUtils.js';

export interface BionisAnalyticsRowProps {
  readonly issues: ReadonlyArray<CivicIssue>;
  readonly scopeLabel: string;
  readonly accent: 'teal' | 'plum';
  readonly scopedDepartment?: Department | null;
  readonly actionSlot?: React.ReactNode;
}

interface DaySeriesPoint {
  readonly label: string;
  readonly reported: number;
  readonly resolved: number;
}

const PRIORITY_LEVELS: ReadonlyArray<PriorityLevel> = [
  'Critical',
  'High',
  'Medium',
  'Low',
];

function getPriorityBarColor(level: PriorityLevel): string {
  switch (level) {
    case 'Critical':
      return '#dc2626';
    case 'High':
      return '#d97706';
    case 'Medium':
      return '#3730a3';
    case 'Low':
      return '#0f766e';
  }
}

export function BionisAnalyticsRow({
  issues,
  scopeLabel,
  accent,
  scopedDepartment = null,
  actionSlot,
}: BionisAnalyticsRowProps): React.ReactElement {
  const metrics = useMemo(() => {
    const total = issues.length;
    let resolved = 0;
    let inProgress = 0;
    let overdue = 0;
    let urgencySum = 0;
    let totalUpvotes = 0;
    let topPriorityIssue: CivicIssue | null = null;

    const priorityCounts = new Map<PriorityLevel, number>([
      ['Critical', 0],
      ['High', 0],
      ['Medium', 0],
      ['Low', 0],
    ]);

    for (const issue of issues) {
      urgencySum += issue.urgencyScore;
      totalUpvotes += issue.upvoteCount;
      priorityCounts.set(
        issue.priorityLevel,
        (priorityCounts.get(issue.priorityLevel) ?? 0) + 1,
      );

      if (issue.status === 'Resolved') {
        resolved += 1;
      } else {
        if (issue.status === 'In Progress') {
          inProgress += 1;
        }
        const sla = computeSlaStatus(issue);
        if (sla.isOverdue) {
          overdue += 1;
        }
        if (
          topPriorityIssue === null ||
          issue.urgencyScore > topPriorityIssue.urgencyScore
        ) {
          topPriorityIssue = issue;
        }
      }
    }

    const open = total - resolved;
    const resolutionRate = total > 0 ? Math.round((resolved / total) * 100) : 100;
    const avgUrgency =
      total > 0 ? (urgencySum / total).toFixed(1) : '0.0';
    const onTimeOpen = Math.max(0, open - overdue);
    const slaHealthScore =
      total === 0
        ? 100
        : Math.max(
            18,
            Math.min(
              100,
              Math.round(
                52 +
                  resolutionRate * 0.42 +
                  (open > 0 ? (onTimeOpen / open) * 12 : 12) -
                  overdue * 7,
              ),
            ),
          );

    // 7-day trend buckets ending at latest issue timestamp (deterministic for SSR/tests)
    const maxCreatedMs = issues.reduce((max, item) => {
      const parsed = Date.parse(item.createdAt);
      return Number.isFinite(parsed) && parsed > max ? parsed : max;
    }, Date.UTC(2026, 10, 21));

    const trendPoints: DaySeriesPoint[] = [];
    for (let offset = 5; offset >= 0; offset -= 1) {
      const dayEnd = maxCreatedMs - offset * 24 * 60 * 60 * 1000;
      const dayStart = dayEnd - 24 * 60 * 60 * 1000;
      let rep = 0;
      let res = 0;
      for (const item of issues) {
        const createdMs = Date.parse(item.createdAt);
        if (createdMs > dayStart && createdMs <= dayEnd) {
          rep += 1;
        }
        if (item.resolvedAt) {
          const resolvedMs = Date.parse(item.resolvedAt);
          if (resolvedMs > dayStart && resolvedMs <= dayEnd) {
            res += 1;
          }
        }
      }
      const d = new Date(dayEnd);
      const label = `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
      trendPoints.push({ label, reported: rep, resolved: res });
    }

    // Department share inside current scope
    const deptCounts = (
      scopedDepartment ? [scopedDepartment] : DEPARTMENTS
    ).map((dept) => {
      const count = issues.filter((i) => i.assignedDepartment === dept).length;
      return { dept, count };
    });

    return {
      total,
      open,
      inProgress,
      resolved,
      overdue,
      resolutionRate,
      avgUrgency,
      totalUpvotes,
      slaHealthScore,
      topPriorityIssue,
      priorityCounts,
      trendPoints,
      deptCounts,
    };
  }, [issues, scopedDepartment]);

  // SVG Ring Gauge geometry (r=42 -> C=263.89)
  const ringRadius = 42;
  const ringCircumference = 2 * Math.PI * ringRadius;
  const ringDashOffset =
    ringCircumference -
    (metrics.slaHealthScore / 100) * ringCircumference;

  // Dual-line SVG spline points
  const chartMaxVal = Math.max(
    2,
    ...metrics.trendPoints.map((p) => Math.max(p.reported, p.resolved)),
  );
  const svgW = 320;
  const svgH = 104;
  const padX = 16;
  const padY = 12;
  const plotW = svgW - padX * 2;
  const plotH = svgH - padY * 2;

  const buildCoords = (values: ReadonlyArray<number>): string =>
    values
      .map((val, idx) => {
        const x =
          values.length > 1
            ? padX + (idx / (values.length - 1)) * plotW
            : padX + plotW / 2;
        const y = padY + plotH - (val / chartMaxVal) * plotH;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');

  const reportedPoints = buildCoords(
    metrics.trendPoints.map((p) => p.reported),
  );
  const resolvedPoints = buildCoords(
    metrics.trendPoints.map((p) => p.resolved),
  );

  const ringStroke = accent === 'plum' ? '#7c3aed' : '#0f766e';

  return (
    <div className="mb-6 flex flex-col gap-4">
      {/* Row 1: Bionis Hero SLA Summary + Circular Ring Gauge + 4-Col KPI Strip */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        {/* Hero SLA Ring Card (4 Cols on xl) */}
        <div className="surface-card flex items-center justify-between gap-4 p-4 sm:p-5 xl:col-span-5">
          <div className="flex min-w-0 flex-col gap-1.5">
            <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-indigo-50 px-2.5 py-0.5 text-[11px] font-bold text-[#3730a3] dark:bg-indigo-950/70 dark:text-indigo-200">
              <Activity className="h-3 w-3" aria-hidden="true" />
              {scopeLabel}
            </span>
            <h2 className="text-base font-bold tracking-tight text-[#11131a] sm:text-lg dark:text-white">
              SLA Health &amp; Readiness
            </h2>
            <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-300">
              {metrics.overdue > 0
                ? `${metrics.overdue} SLA breach risk${metrics.overdue === 1 ? ' requires' : 's require'} dispatch prioritization.`
                : 'All active civic queues are operating inside SLA targets.'}
            </p>
            {actionSlot && <div className="mt-1">{actionSlot}</div>}
          </div>

          <div className="relative flex h-24 w-24 shrink-0 items-center justify-center">
            <svg
              viewBox="0 0 104 104"
              className="h-24 w-24 -rotate-90"
              aria-label={`SLA Health Score ${metrics.slaHealthScore} out of 100`}
            >
              <circle
                cx="52"
                cy="52"
                r={ringRadius}
                fill="none"
                stroke="currentColor"
                strokeWidth="9"
                className="text-slate-200 dark:text-slate-800"
              />
              <circle
                cx="52"
                cy="52"
                r={ringRadius}
                fill="none"
                stroke={ringStroke}
                strokeWidth="9"
                strokeLinecap="round"
                strokeDasharray={ringCircumference.toFixed(1)}
                strokeDashoffset={ringDashOffset.toFixed(1)}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
              <span className="tabular-nums text-xl font-extrabold text-[#11131a] dark:text-white">
                {metrics.slaHealthScore}
              </span>
              <span className="text-[9px] font-bold tracking-wider text-slate-500 uppercase dark:text-slate-400">
                SLA Score
              </span>
            </div>
          </div>
        </div>

        {/* 4-Card KPI Strip (7 Cols on xl, 2x2 on mobile/tablet, 4x1 on sm+) */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:col-span-7">
          <div className="surface-card flex flex-col justify-between p-4">
            <span className="text-[11px] font-bold tracking-wide text-slate-500 uppercase dark:text-slate-400">
              Total Scope
            </span>
            <div className="mt-2 flex items-baseline justify-between gap-2">
              <span className="tabular-nums text-2xl font-extrabold text-[#11131a] dark:text-white">
                {metrics.total}
              </span>
              <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-bold text-[#3730a3] dark:bg-indigo-950/70 dark:text-indigo-200">
                Verified
              </span>
            </div>
          </div>

          <div className="surface-card flex flex-col justify-between p-4">
            <span className="text-[11px] font-bold tracking-wide text-slate-500 uppercase dark:text-slate-400">
              Active Queue
            </span>
            <div className="mt-2 flex items-baseline justify-between gap-2">
              <span className="tabular-nums text-2xl font-extrabold text-[#11131a] dark:text-white">
                {metrics.open}
              </span>
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-900 dark:bg-amber-950/70 dark:text-amber-200">
                {metrics.inProgress} active
              </span>
            </div>
          </div>

          <div className="surface-card flex flex-col justify-between p-4">
            <span className="text-[11px] font-bold tracking-wide text-slate-500 uppercase dark:text-slate-400">
              Overdue SLA
            </span>
            <div className="mt-2 flex items-baseline justify-between gap-2">
              <span className="tabular-nums text-2xl font-extrabold text-[#11131a] dark:text-white">
                {metrics.overdue}
              </span>
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                  metrics.overdue > 0
                    ? 'bg-red-100 text-red-900 dark:bg-red-950/70 dark:text-red-200'
                    : 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950/70 dark:text-emerald-200'
                }`}
              >
                {metrics.overdue > 0 ? 'Escalate' : 'Healthy'}
              </span>
            </div>
          </div>

          <div className="surface-card flex flex-col justify-between p-4">
            <span className="text-[11px] font-bold tracking-wide text-slate-500 uppercase dark:text-slate-400">
              Resolved Rate
            </span>
            <div className="mt-2 flex items-baseline justify-between gap-2">
              <span className="tabular-nums text-2xl font-extrabold text-[#11131a] dark:text-white">
                {metrics.resolutionRate}%
              </span>
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-900 dark:bg-emerald-950/70 dark:text-emerald-200">
                {metrics.resolved} done
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Row 2: Bionis 2-Col Analytics Charts (Priority Distribution Bar + Intake vs Resolution Line) */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="surface-card p-4 sm:p-5">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div>
              <h3 className="text-xs font-bold tracking-wide text-[#11131a] uppercase dark:text-white">
                Severity &amp; Workload Breakdown
              </h3>
              <p className="text-[11px] text-slate-600 dark:text-slate-400">
                Distribution across AI triage priority levels
              </p>
            </div>
            <span className="tabular-nums rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-bold text-[#11131a] dark:bg-slate-800 dark:text-slate-200">
              Avg Urgency {metrics.avgUrgency}/10
            </span>
          </div>

          <div className="flex flex-col gap-2.5">
            {PRIORITY_LEVELS.map((level) => {
              const count = metrics.priorityCounts.get(level) ?? 0;
              const pct =
                metrics.total > 0 ? Math.round((count / metrics.total) * 100) : 0;
              return (
                <div key={level} className="flex items-center gap-3 text-xs">
                  <span className="w-16 shrink-0 font-semibold text-slate-700 dark:text-slate-300">
                    {level}
                  </span>
                  <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-200/80 dark:bg-slate-800">
                    <div
                      className="h-full rounded-full transition-all duration-300"
                      style={{
                        width: `${Math.max(pct, count > 0 ? 8 : 0)}%`,
                        backgroundColor: getPriorityBarColor(level),
                      }}
                    />
                  </div>
                  <span className="tabular-nums w-12 text-right font-mono text-[11px] font-bold text-[#11131a] dark:text-white">
                    {count} ({pct}%)
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="surface-card p-4 sm:p-5">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div>
              <h3 className="text-xs font-bold tracking-wide text-[#11131a] uppercase dark:text-white">
                6-Day Intake vs. Resolution Trend
              </h3>
              <p className="text-[11px] text-slate-600 dark:text-slate-400">
                Daily reported complaints (indigo) vs resolved repairs (teal)
              </p>
            </div>
            <div className="flex items-center gap-3 text-[11px] font-bold">
              <span className="inline-flex items-center gap-1 text-[#3730a3] dark:text-indigo-300">
                <span className="h-2 w-2 rounded-full bg-[#3730a3]" />
                Reported
              </span>
              <span className="inline-flex items-center gap-1 text-[#0f766e] dark:text-teal-300">
                <span className="h-2 w-2 rounded-full bg-[#0f766e]" />
                Resolved
              </span>
            </div>
          </div>

          <div className="surface-well p-2">
            <svg
              viewBox={`0 0 ${svgW} ${svgH}`}
              className="h-24 w-full overflow-visible"
              aria-label="6-day reported vs resolved trend chart"
            >
              <line
                x1={padX}
                y1={padY + plotH / 2}
                x2={svgW - padX}
                y2={padY + plotH / 2}
                stroke="currentColor"
                strokeDasharray="3 4"
                className="text-slate-300 dark:text-slate-700"
              />
              <polyline
                fill="none"
                stroke="#3730a3"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                points={reportedPoints}
              />
              <polyline
                fill="none"
                stroke="#0f766e"
                strokeWidth="2.5"
                strokeDasharray="5 3"
                strokeLinecap="round"
                strokeLinejoin="round"
                points={resolvedPoints}
              />
            </svg>
            <div className="mt-1 flex items-center justify-between px-2 text-[10px] font-semibold text-slate-500 dark:text-slate-400">
              {metrics.trendPoints.map((pt) => (
                <span key={pt.label} className="tabular-nums">
                  {pt.label}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Row 3: Bionis 3-Col Tinted AI Insights / Vitals / Quick Dispatch Cards */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-[20px] border border-indigo-200/80 bg-indigo-500/[0.08] p-4 dark:border-indigo-900/60 dark:bg-indigo-500/15">
          <div className="flex items-center gap-2 text-xs font-bold text-[#3730a3] dark:text-indigo-200">
            <Sparkles className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>AI Priority Spotlight</span>
          </div>
          <p className="mt-1.5 text-xs font-semibold text-[#11131a] dark:text-white">
            {metrics.topPriorityIssue
              ? `${metrics.topPriorityIssue.title} (Urgency ${metrics.topPriorityIssue.urgencyScore}/10)`
              : 'All tracked civic reports in scope are resolved.'}
          </p>
        </div>

        <div className="rounded-[20px] border border-teal-200/80 bg-teal-500/[0.08] p-4 dark:border-teal-900/60 dark:bg-teal-500/15">
          <div className="flex items-center gap-2 text-xs font-bold text-[#0f766e] dark:text-teal-200">
            <TrendingUp className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>Civic Vitals &amp; Engagement</span>
          </div>
          <p className="tabular-nums mt-1.5 text-xs font-semibold text-[#11131a] dark:text-white">
            {metrics.totalUpvotes} citizen impact votes · {metrics.deptCounts.length} active department queue{metrics.deptCounts.length > 1 ? 's' : ''}
          </p>
        </div>

        <div className="rounded-[20px] border border-purple-200/80 bg-purple-500/[0.08] p-4 dark:border-purple-900/60 dark:bg-purple-500/15">
          <div className="flex items-center gap-2 text-xs font-bold text-[#581c87] dark:text-purple-200">
            {metrics.overdue > 0 ? (
              <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
            ) : metrics.open > 0 ? (
              <Clock className="h-4 w-4 shrink-0" aria-hidden="true" />
            ) : (
              <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
            )}
            <span>Next Operational Step</span>
          </div>
          <p className="mt-1.5 text-xs font-semibold text-[#11131a] dark:text-white">
            {metrics.overdue > 0
              ? `Dispatch field crews to ${metrics.overdue} overdue SLA ticket${metrics.overdue > 1 ? 's' : ''} and upload proof.`
              : metrics.open > 0
                ? `${metrics.open} open ticket${metrics.open > 1 ? 's' : ''} progressing inside active SLA window.`
                : 'Zero open backlog. Download official audit records anytime.'}
          </p>
        </div>
      </div>
    </div>
  );
}
