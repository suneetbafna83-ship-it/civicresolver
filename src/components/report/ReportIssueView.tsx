import React, { useCallback, useState } from 'react';
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  Clock,
  Mic,
  MicOff,
  Send,
  Sparkles,
  ThumbsUp,
  Trash2,
} from 'lucide-react';
import {
  ISSUE_CATEGORIES,
  type CivicIssue,
  type IssueCategory,
  type IssueCreateInput,
  type IssueLocation,
  type PriorityLevel,
  type TriageResponse,
  type UploadImageMimeType,
} from '../../../shared/types/civic.js';
import {
  analyzeCivicIssue,
  buildNearbyContextFromIssues,
} from '../../lib/api/triageClient.js';
import {
  getUiStrings,
  type AppLanguage,
} from '../../lib/i18n/translations.js';
import {
  compressImageFileToWebp,
  getSamplePresetWebp,
  type CompressedWebpPayload,
} from '../../lib/media/imageCompressor.js';
import { useSpeechToText } from '../../lib/voice/useSpeechToText.js';
import { CivicMap, NEIGHBORHOOD_PRESETS } from '../map/CivicMap.js';

interface SamplePreset {
  readonly id: string;
  readonly badge: string;
  readonly title: string;
  readonly description: string;
  readonly location: IssueLocation;
  readonly presetIndex: number;
}

const JUDGE_SAMPLE_PRESETS: ReadonlyArray<SamplePreset> = [
  {
    id: 'preset-pothole',
    badge: 'Sample 1: Deep Pothole',
    title: 'Deep pothole near Central Market intersection',
    description:
      'A wide water-filled pothole has opened across the eastbound lane outside Central Market, forcing two-wheelers and cars to swerve sharply.',
    location: {
      lat: 37.7749,
      lng: -122.4194,
      address: '240 Market St, Downtown District',
    },
    presetIndex: 1,
  },
  {
    id: 'preset-water',
    badge: 'Sample 2: Burst Water Pipe',
    title: 'Pressurized water pipe leaking across Civic Center sidewalk',
    description:
      'Clean water is spraying from a ruptured underground valve near the Oakwood bus stop and flooding the pedestrian crossing.',
    location: {
      lat: 37.7795,
      lng: -122.4151,
      address: '92 Oakwood Ave, Civic Center',
    },
    presetIndex: 2,
  },
  {
    id: 'preset-streetlight',
    badge: 'Sample 3: Broken Streetlight',
    title: 'Damaged streetlight pole with exposed wire near Elm Park',
    description:
      'Streetlight pole #18 is dark and its junction box cover is open with low-hanging cable near the evening walking path.',
    location: {
      lat: 37.7685,
      lng: -122.4261,
      address: '512 Elm Park North Path',
    },
    presetIndex: 3,
  },
  {
    id: 'preset-garbage',
    badge: 'Sample 4: Overflowing Bins',
    title: 'Uncollected overflowing garbage dumpsters at Harbor Alley',
    description:
      'Three municipal waste bins have been overflowing onto the pavement for four days, causing strong odor and blocked walkway access.',
    location: {
      lat: 37.7841,
      lng: -122.4072,
      address: '19 Harbor Plaza Service Alley',
    },
    presetIndex: 4,
  },
];

function getPriorityIndicatorDot(priority: PriorityLevel): string {
  switch (priority) {
    case 'Critical':
      return 'bg-red-600';
    case 'High':
      return 'bg-amber-600';
    case 'Medium':
      return 'bg-indigo-700';
    case 'Low':
    default:
      return 'bg-slate-500';
  }
}

export interface ReportIssueViewProps {
  readonly existingIssues: ReadonlyArray<CivicIssue>;
  readonly darkTheme: boolean;
  readonly language: AppLanguage;
  readonly getIdToken: () => Promise<string | null>;
  readonly onCreateIssue: (input: IssueCreateInput) => Promise<CivicIssue>;
  readonly onUpvoteDuplicate: (issueId: string) => Promise<void>;
}

export function ReportIssueView({
  existingIssues,
  darkTheme,
  language,
  getIdToken,
  onCreateIssue,
  onUpvoteDuplicate,
}: ReportIssueViewProps): React.ReactElement {
  const t = getUiStrings(language);
  const defaultLoc = NEIGHBORHOOD_PRESETS[0]!;
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [categoryOverride, setCategoryOverride] = useState<
    IssueCategory | 'AUTO'
  >('AUTO');
  const [location, setLocation] = useState<IssueLocation>({
    lat: defaultLoc.lat,
    lng: defaultLoc.lng,
    address: defaultLoc.address,
  });

  const [photoPayload, setPhotoPayload] = useState<{
    readonly dataUrl: string;
    readonly mimeType: UploadImageMimeType;
    readonly originalBytes: number;
    readonly compressedBytes: number;
    readonly label: string;
  } | null>(null);

  const [triageResponse, setTriageResponse] = useState<TriageResponse | null>(
    null,
  );
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleVoiceTranscript = useCallback((transcript: string) => {
    setDescription((prev) =>
      prev.trim().length > 0 ? `${prev.trim()} ${transcript}` : transcript,
    );
    setTitle((prev) => (prev.trim().length > 0 ? prev : transcript.slice(0, 72)));
  }, []);

  const speech = useSpeechToText({
    onTranscript: handleVoiceTranscript,
    lang: t.speechLang,
  });

  const runTriageAnalysis = useCallback(
    async (
      currentTitle: string,
      currentDescription: string,
      currentLocation: IssueLocation,
      currentPhoto: typeof photoPayload,
    ): Promise<TriageResponse | null> => {
      const cleanTitle = currentTitle.trim();
      const cleanDesc = currentDescription.trim();
      if (cleanTitle.length < 5 || cleanDesc.length < 10) {
        setErrorMessage(
          'Please enter a short title (at least 5 characters) and description (at least 10 characters).',
        );
        return null;
      }

      setErrorMessage(null);
      setIsAnalyzing(true);
      try {
        const token = await getIdToken();
        const result = await analyzeCivicIssue(
          {
            title: cleanTitle,
            description: cleanDesc,
            location: {
              lat: currentLocation.lat,
              lng: currentLocation.lng,
              address: currentLocation.address,
            },
            nearbyIssues: buildNearbyContextFromIssues(existingIssues),
            ...(currentPhoto
              ? {
                  imageBase64: currentPhoto.dataUrl,
                  imageMimeType: currentPhoto.mimeType,
                }
              : {}),
          },
          token,
        );
        setTriageResponse(result);
        return result;
      } finally {
        setIsAnalyzing(false);
      }
    },
    [existingIssues, getIdToken],
  );

  const handleSelectSamplePreset = useCallback(
    async (preset: SamplePreset) => {
      setTitle(preset.title);
      setDescription(preset.description);
      setLocation(preset.location);
      setCategoryOverride('AUTO');
      const webpSample = getSamplePresetWebp(preset.presetIndex);
      const nextPhoto = {
        dataUrl: webpSample.dataUrl,
        mimeType: webpSample.mimeType,
        originalBytes: 420_000,
        compressedBytes: webpSample.compressedBytes,
        label: `${preset.id}.webp`,
      };
      setPhotoPayload(nextPhoto);
      await runTriageAnalysis(
        preset.title,
        preset.description,
        preset.location,
        nextPhoto,
      );
    },
    [runTriageAnalysis],
  );

  const handleFileChange = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) {
        return;
      }
      setErrorMessage(null);
      try {
        const compressed: CompressedWebpPayload =
          await compressImageFileToWebp(file);
        setPhotoPayload({
          dataUrl: compressed.dataUrl,
          mimeType: compressed.mimeType,
          originalBytes: compressed.originalBytes,
          compressedBytes: compressed.compressedBytes,
          label: file.name,
        });
      } catch (err) {
        setErrorMessage(
          err instanceof Error
            ? err.message
            : 'Could not process image. Choose JPEG, PNG, or WebP under 5 MB.',
        );
      }
    },
    [],
  );

  const handleSubmitReport = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      setErrorMessage(null);

      let activeTriage = triageResponse;
      if (activeTriage === null) {
        activeTriage = await runTriageAnalysis(
          title,
          description,
          location,
          photoPayload,
        );
      }
      if (activeTriage === null) {
        return;
      }

      setIsSubmitting(true);
      try {
        const finalCategory: IssueCategory =
          categoryOverride === 'AUTO'
            ? activeTriage.triage.category
            : categoryOverride;

        await onCreateIssue({
          title: title.trim(),
          description: description.trim(),
          category: finalCategory,
          location: {
            lat: location.lat,
            lng: location.lng,
            address: location.address.trim() || 'Municipal Sector',
          },
          priorityLevel: activeTriage.triage.priorityLevel,
          urgencyScore: activeTriage.triage.urgencyScore,
          recommendedDepartment: activeTriage.triage.recommendedDepartment,
          assignedDepartment: activeTriage.triage.recommendedDepartment,
          slaEstimateHours: activeTriage.triage.slaEstimateHours,
          slaSummary: activeTriage.triage.slaEstimateText,
          triageMeta: {
            engine: activeTriage.metadata.engine,
            model: activeTriage.metadata.model,
            cacheHit: activeTriage.metadata.cacheHit,
            authenticityStatus: activeTriage.triage.authenticityCheck.status,
            authenticityReason: activeTriage.triage.authenticityCheck.reason,
            potentialDuplicateIds:
              activeTriage.triage.duplicateDetection.matchedIssueIds,
            highestSimilarity:
              activeTriage.triage.duplicateDetection.highestSimilarity,
          },
          imageDataUrl:
            photoPayload?.mimeType === 'image/webp'
              ? photoPayload.dataUrl
              : null,
        });
      } catch (err) {
        setErrorMessage(
          err instanceof Error
            ? err.message
            : 'Unable to save report. Please check your inputs and try again.',
        );
      } finally {
        setIsSubmitting(false);
      }
    },
    [
      categoryOverride,
      description,
      location,
      onCreateIssue,
      photoPayload,
      runTriageAnalysis,
      title,
      triageResponse,
    ],
  );

  const duplicateMatchedIssue =
    triageResponse?.triage.duplicateDetection.isLikelyDuplicate
      ? existingIssues.find((issue) =>
          triageResponse.triage.duplicateDetection.matchedIssueIds.includes(
            issue.id,
          ),
        ) ?? null
      : null;

  return (
    <section
      aria-labelledby="report-heading"
      className="mx-auto flex h-full max-w-6xl flex-col justify-center px-4 py-3 sm:px-8"
    >
      {/* Compact Single-Screen Header + Quick Demo Presets */}
      <div className="mb-3 flex flex-col justify-between gap-2.5 lg:flex-row lg:items-center">
        <div>
          <h1
            id="report-heading"
            className="text-lg font-bold tracking-tight sm:text-xl"
          >
            <span className="text-slate-500 dark:text-slate-400">
              {t.reportLead}{' '}
            </span>
            <span className="text-[#11131a] dark:text-white">
              {t.reportTitle}
            </span>
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {JUDGE_SAMPLE_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => void handleSelectSamplePreset(preset)}
              className="press-feedback rounded-full border border-indigo-200 bg-indigo-50/90 px-3 py-1.5 text-[11px] font-bold text-[#3730a3] hover:bg-indigo-100 dark:border-indigo-800 dark:bg-indigo-950/70 dark:text-indigo-200"
            >
              {preset.badge}
            </button>
          ))}
        </div>
      </div>

      {/* Single-Page Non-Scrolling Desktop Grid (Stacks Cleanly on Mobile) */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        {/* Left Column: Citizen Form (7 cols) */}
        <form
          onSubmit={(e) => void handleSubmitReport(e)}
          className="surface-card flex flex-col justify-between gap-3 p-4 sm:p-5 lg:col-span-7"
        >
          {/* Step 1: Deep Plum Add Photo + Voice Bar */}
          <div className="surface-well flex flex-wrap items-center justify-between gap-2 p-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <label
                htmlFor="civic-photo-upload"
                className="press-feedback inline-flex min-h-[36px] cursor-pointer items-center gap-1.5 rounded-full bg-[#581c87] px-4 py-1.5 text-xs font-semibold text-white shadow-2xs hover:bg-[#4c1d95]"
              >
                <Camera className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{photoPayload ? t.changePhoto : t.addPhoto}</span>
                <input
                  id="civic-photo-upload"
                  type="file"
                  accept="image/webp,image/jpeg,image/png"
                  onChange={(e) => void handleFileChange(e)}
                  className="sr-only"
                />
              </label>

              <button
                type="button"
                onClick={speech.toggleListening}
                className={`press-feedback inline-flex min-h-[36px] items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-semibold ${
                  speech.isListening
                    ? 'border-red-600 bg-red-600 text-white'
                    : 'border-slate-300 bg-white text-[#11131a] hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-white'
                }`}
              >
                {speech.isListening ? (
                  <>
                    <MicOff className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>{t.stopSpeaking}</span>
                  </>
                ) : (
                  <>
                    <Mic className="h-3.5 w-3.5 text-[#581c87] dark:text-purple-300" aria-hidden="true" />
                    <span>{t.speakIssue}</span>
                  </>
                )}
              </button>
            </div>

            {photoPayload ? (
              <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-800 dark:text-emerald-300">
                <span className="tabular-nums rounded-full bg-emerald-500/15 px-2.5 py-0.5">
                  WebP ({Math.max(1, Math.round(photoPayload.compressedBytes / 1024))} KB)
                </span>
                <button
                  type="button"
                  onClick={() => setPhotoPayload(null)}
                  aria-label="Remove attached photo"
                  className="press-feedback rounded-full p-1 text-slate-600 hover:bg-slate-200 dark:text-slate-300"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </div>
            ) : (
              <span className="text-[11px] font-medium text-slate-600 dark:text-slate-300">
                Auto WebP &lt; 120 KB
              </span>
            )}
          </div>

          {speech.statusMessage && (
            <p
              className="text-xs font-semibold text-[#3730a3] dark:text-indigo-300"
              aria-live="polite"
            >
              {speech.statusMessage}
            </p>
          )}

          {/* Step 2: Issue Title */}
          <div>
            <label
              htmlFor="issue-title-input"
              className="block text-xs font-bold text-[#11131a] dark:text-white"
            >
              {t.issueTitleLabel} <span className="text-red-600">*</span>
            </label>
            <input
              id="issue-title-input"
              type="text"
              required
              minLength={5}
              maxLength={140}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Deep pothole near Central Market intersection"
              className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-[#11131a] placeholder:text-slate-500 focus:border-[#3730a3] sm:text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:placeholder:text-slate-400"
            />
          </div>

          {/* Step 3: Detailed Description */}
          <div>
            <label
              htmlFor="issue-description-input"
              className="block text-xs font-bold text-[#11131a] dark:text-white"
            >
              {t.issueDescLabel} <span className="text-red-600">*</span>
            </label>
            <textarea
              id="issue-description-input"
              required
              minLength={10}
              maxLength={2000}
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe the size, landmark, or safety risk..."
              className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-[#11131a] placeholder:text-slate-500 focus:border-[#3730a3] sm:text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:placeholder:text-slate-400"
            />
          </div>

          {/* Step 4: Street Address & Category */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label
                htmlFor="issue-address-input"
                className="block text-xs font-bold text-[#11131a] dark:text-white"
              >
                {t.streetAddressLabel}
              </label>
              <input
                id="issue-address-input"
                type="text"
                value={location.address}
                onChange={(e) =>
                  setLocation((prev) => ({ ...prev, address: e.target.value }))
                }
                placeholder="240 Market St, Downtown"
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-[#11131a] dark:border-slate-700 dark:bg-slate-900 dark:text-white"
              />
            </div>

            <div>
              <label
                htmlFor="issue-category-select"
                className="block text-xs font-bold text-[#11131a] dark:text-white"
              >
                {t.categoryLabel}
              </label>
              <select
                id="issue-category-select"
                value={categoryOverride}
                onChange={(e) =>
                  setCategoryOverride(e.target.value as IssueCategory | 'AUTO')
                }
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-[#11131a] dark:border-slate-700 dark:bg-slate-900 dark:text-white"
              >
                <option value="AUTO">{t.autoDetectAi}</option>
                {ISSUE_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {errorMessage && (
            <div
              role="alert"
              className="rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-xs font-semibold text-red-900 dark:border-red-900/60 dark:bg-red-950/60 dark:text-red-200"
            >
              {errorMessage}
            </div>
          )}

          {/* Action Buttons: Black Submit Official Report */}
          <div className="flex flex-wrap items-center justify-end gap-2.5 border-t border-slate-200/80 pt-3 dark:border-slate-800">
            <button
              type="button"
              disabled={isAnalyzing || isSubmitting}
              onClick={() =>
                void runTriageAnalysis(
                  title,
                  description,
                  location,
                  photoPayload,
                )
              }
              className="press-feedback inline-flex min-h-[38px] items-center gap-1.5 rounded-full border border-indigo-200 bg-indigo-50 px-4 py-2 text-xs font-bold text-[#3730a3] hover:bg-indigo-100 disabled:opacity-50 dark:border-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-200"
            >
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{isAnalyzing ? t.analyzingLabel : t.analyzeAi}</span>
            </button>

            <button
              type="submit"
              disabled={isSubmitting || isAnalyzing}
              className="press-feedback inline-flex min-h-[38px] items-center gap-1.5 rounded-full bg-[#11131a] px-5 py-2 text-xs font-bold text-white shadow-xs hover:bg-slate-800 disabled:opacity-50 dark:bg-white dark:text-[#11131a] dark:hover:bg-slate-200"
            >
              <Send className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{isSubmitting ? t.submittingLabel : t.submitReport}</span>
            </button>
          </div>
        </form>

        {/* Right Column: Bigger Map + Compact Gemini AI Triage Card (5 cols) */}
        <div className="flex flex-col gap-4 lg:col-span-5">
          <div className="surface-card p-3.5 sm:p-4">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-bold text-[#11131a] dark:text-white">
                {t.pinLocationTitle}
              </h2>
              <span className="text-[11px] font-medium text-slate-600 dark:text-slate-300">
                {t.pinLocationHint}
              </span>
            </div>
            <CivicMap
              mode="picker"
              darkTheme={darkTheme}
              language={language}
              selectedLocation={location}
              onSelectLocation={setLocation}
              issues={existingIssues}
              heightClassName="h-56 sm:h-64"
            />
          </div>

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
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                      <span>
                        Similar report nearby ({duplicateMatchedIssue.upvoteCount} affected)
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        void onUpvoteDuplicate(duplicateMatchedIssue.id)
                      }
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
                        className={`h-2 w-2 rounded-full ${getPriorityIndicatorDot(
                          triageResponse.triage.priorityLevel,
                        )}`}
                      />
                      <span className="font-bold text-[#11131a] dark:text-white">
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
                  <span className="truncate max-w-[220px] text-slate-600 dark:text-slate-300">
                    {triageResponse.triage.summary}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
