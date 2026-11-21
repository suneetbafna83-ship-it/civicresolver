# PROJECT_MEMORY — CivicResolve

## Status
- **Current Phase:** Phase 3 Complete — Full Backend + 60/30/10 Scroll-Reactive Lavender Frontend + Dual-Portal Workspace Isolation + 17-Point Security Lockdown & Audit verified (**211/211 automated tests passing**: 93 unit/UI/security + 118 E2E, 0 TypeScript errors, 0 ESLint warnings, 0 `npm audit` vulnerabilities, live `firestore.rules` deployed to `civic-sense-43d74`).

## Workspace File Inventory (Excluding `node_modules` / `dist`)
- **Config & Rules:**
  - `AGENTS.md`, `PROJECT_MEMORY.md`, `.agents/skills/civic-evaluator-guard/SKILL.md`
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
  - `src/main.tsx`, `src/App.tsx`, `src/styles/index.css`
  - `src/components/layout/TopNav.tsx`
  - `src/components/auth/PortalLoginView.tsx`
  - `src/components/report/ReportIssueView.tsx`
  - `src/components/dashboard/TrackIssuesView.tsx`
  - `src/components/admin/AdminDashboardView.tsx`
  - `src/components/map/CivicMap.tsx`
  - `src/components/spec/DimensionalSpecModal.tsx`
  - `src/lib/api/triageClient.ts`
  - `src/lib/firebase/config.ts`, `src/lib/auth/authService.ts`, `src/lib/auth/passwordHasher.ts`
  - `src/lib/media/imageValidation.ts`, `src/lib/media/imageCompressor.ts`
  - `src/lib/voice/useSpeechToText.ts`
  - `src/lib/repositories/issueRepository.ts`, `firestoreIssueRepository.ts`, `localIssueRepository.ts`, `hybridIssueRepository.ts`, `seedIssues.ts`
- **Automated Tests (`tests/` — 211 tests total):**
  - Unit, Integration, UI & 17-Point Security Audit (`93 tests`): `tests/shared/schemas.test.ts`, `tests/api/triageHandler.test.ts`, `tests/api/middleware.test.ts`, `tests/api/securityPosture.test.ts`, `tests/api/full17PointSecurityAudit.test.ts`, `tests/api/devServer.test.ts`, `tests/lib/authService.test.ts`, `tests/lib/firestoreRules.test.ts`, `tests/lib/imageValidation.test.ts`, `tests/lib/issueRepository.test.ts`, `tests/ui/app.ui.test.tsx`
  - E2E (`118 tests`): `tests/e2e/f1-f2-contracts.e2e.test.ts`, `f3-http-endpoints.e2e.test.ts`, `f4-f6-ai-triage.e2e.test.ts`, `f7-security-posture.e2e.test.ts`, `f8-f10-data-auth.e2e.test.ts`, `t3-t4-scenarios.e2e.test.ts`
