# PROJECT_MEMORY — CivicResolve

## Status
- **Current Phase:** Phase 5 Complete — Code Quality Modularization, Security Hardening (Web Crypto CSPRNG `secureId.ts` with zero `Math.random()`, strict password-bypass closure in `emailAuthHandler.ts`, `referrer` meta policy), and WCAG 2.1 AA Accessibility Audit (Skip-to-main-content landmark, dynamic `document.documentElement.lang` sync across EN/HI/TA, keyboard-native card controls, Escape-dismissible dialogs/drawers, `role="progressbar"` & `role="img"` on charts) verified (**217/217 automated tests passing**: 99 unit/UI/security + 118 E2E, 0 TypeScript errors, 0 ESLint warnings, 0 `npm audit` vulnerabilities, `vite build` 673ms).

## Workspace File Inventory (Excluding `node_modules` / `dist`)
- **Config & Rules:**
  - `AGENTS.md`, `PROJECT_MEMORY.md`, `README.md`, `ARCHITECTURE.md`, `.agents/skills/civic-evaluator-guard/SKILL.md`
  - `shared/index.ts`, `src/lib/index.ts`, `src/components/layout/ErrorBoundary.tsx`
  - `package.json`, `tsconfig.json`, `vite.config.ts`, `eslint.config.mjs`, `vitest.config.ts`, `vercel.json`, `index.html`, `.env.example`, `.env` (git-ignored), `.gitignore`
  - `.firebaserc` (`civic-sense-43d74`), `firebase.json`, `firestore.rules`, `firestore.indexes.json`
- **Shared Contracts & Zod Schemas (`shared/`):**
  - `shared/types/civic.ts`, `shared/schemas/triage.ts`, `shared/schemas/issue.ts`
- **Serverless API & AI Triage Engine (`api/` & `server/`):**
  - `api/health.ts`, `api/triage.ts`, `api/_lib/env.ts`, `api/_lib/http.ts`
  - `api/_lib/middleware/authGuard.ts`, `cors.ts`, `rateLimit.ts`, `sanitize.ts`, `securityHeaders.ts`
  - `api/_lib/triage/triageService.ts`, `geminiTriage.ts`, `heuristicTriage.ts`, `triageCache.ts`, `duplicateDetector.ts`
  - `server/devServer.ts`
- **Frontend UI & Client Services (`src/`):**
  - `src/main.tsx`, `src/App.tsx`, `src/styles/index.css`, `src/hooks/useScrollAtmosphere.ts`
  - `src/components/layout/TopNav.tsx`, `BionisSidebar.tsx`, `ErrorBoundary.tsx`
  - `src/components/auth/PortalLoginView.tsx`, `CitizenPortalCard.tsx`, `AdminPortalCard.tsx`
  - `src/components/report/ReportIssueView.tsx`, `samplePresets.ts`, `TriagePreviewPanel.tsx`
  - `src/components/dashboard/TrackIssuesView.tsx`, `TrackIssueCard.tsx`, `BionisAnalyticsRow.tsx`
  - `src/components/admin/AdminDashboardView.tsx`, `AdminQueueFilters.tsx`, `AdminHandoverQueue.tsx`, `AdminAuditLogPanel.tsx`, `AdminIssueCard.tsx`
  - `src/components/map/CivicMap.tsx`, `mapGeocoding.ts`, `LeafletFallbackMap.tsx`
  - `src/components/spec/DimensionalSpecModal.tsx`
  - `src/lib/api/triageClient.ts`
  - `src/lib/firebase/config.ts`
  - `src/lib/auth/authService.ts`, `authTypes.ts`, `authErrorMapper.ts`, `localAuthStore.ts`, `emailAuthHandler.ts`, `officerAuthHandler.ts`, `passwordHasher.ts`, `departmentRoster.ts`
  - `src/lib/admin/adminWorkflowStore.ts`
  - `src/lib/i18n/translations.ts`, `types.ts`, `locales/en.ts`, `locales/hi.ts`, `locales/ta.ts`
  - `src/lib/export/civicExport.ts`
  - `src/lib/media/imageValidation.ts`, `imageCompressor.ts`
  - `src/lib/voice/useSpeechToText.ts`
  - `src/lib/utils/secureId.ts`, `issueDisplay.ts`, `analyticsMetrics.ts`, `slaUtils.ts`
  - `src/lib/repositories/issueRepository.ts`, `firestoreIssueRepository.ts`, `localIssueRepository.ts`, `hybridIssueRepository.ts`, `seedIssues.ts`
- **Automated Tests (`tests/` — 217 tests total):**
  - Unit, Integration, UI & 17-Point Security Audit (`99 tests`): `tests/shared/schemas.test.ts`, `tests/api/triageHandler.test.ts`, `tests/api/middleware.test.ts`, `tests/api/securityPosture.test.ts`, `tests/api/full17PointSecurityAudit.test.ts`, `tests/api/devServer.test.ts`, `tests/lib/authService.test.ts`, `tests/lib/firestoreRules.test.ts`, `tests/lib/imageValidation.test.ts`, `tests/lib/issueRepository.test.ts`, `tests/ui/app.ui.test.tsx`
  - E2E (`118 tests`): `tests/e2e/f1-f2-contracts.e2e.test.ts`, `f3-http-endpoints.e2e.test.ts`, `f4-f6-ai-triage.e2e.test.ts`, `f7-security-posture.e2e.test.ts`, `f8-f10-data-auth.e2e.test.ts`, `t3-t4-scenarios.e2e.test.ts`
