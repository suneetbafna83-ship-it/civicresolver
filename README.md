# CivicResolve — AI-Powered Smart Civic Issue Reporting & Municipal Command Platform

CivicResolve is a zero-cost, resilient municipal issue reporting, multimodal AI triage, and department-scoped dispatch command platform built with **React 19 + TypeScript (strict, 0 `any`) + Tailwind CSS**, **Google Gemini (`@google/genai`)**, **Firebase Spark Plan (`firebase/auth` + `firebase/firestore` + hardened `firestore.rules`)**, and **Google Maps Platform (`@vis.gl/react-google-maps` + `AdvancedMarkerElement`)**.

- **Live Cloud Deployment (Firebase Hosting):** https://civic-sense-43d74.web.app
- **GitHub Repository:** https://github.com/suneetbafna83-ship-it/civicresolver
- **Complete Codebase & Security Map:** [ARCHITECTURE.md](./ARCHITECTURE.md)

---

## Instant 1-Click Demo Mode (Both Citizen & Municipal Admin — Zero Setup Required)
Evaluators and judges can test the entire platform immediately with **zero login credentials or API keys required**:
- **Citizen Demo Mode:** Click **`Enter Citizen Workspace (1-Click Demo Citizen)`** on the Citizen Portal card (or enter any valid email ID + 6-char password to auto-register). Includes 4 1-click sample issue presets (`Deep Pothole`, `Burst Water Pipe`, `Broken Streetlight`, `Overflowing Bins`), interactive GPS + Pin-Point map, AI triage preview, live SLA tracker, before/after proof viewer, and downloadable receipts.
- **Municipal Admin Demo Mode:** Click **`Enter Admin Command Desk (1-Click Demo Admin)`** on the Municipal Admin card for full city-wide operations, urgency queue (`10 → 1`), after-repair photo uploads, CSV export, and cross-department transfer approvals.
- **Scoped Department Staff RBAC Login:** Use any department officer email & passkey below (e.g., `water.staff@civicresolve.gov` / `Water#2026`) to verify strict department-only isolation.

---

## 7-Parameter Hackathon Evaluation Rubric Alignment

### 1. Problem Statement Alignment (6/6 Core Flows Verified End-to-End)
1. **Citizen Issue Reporting (`src/components/report/ReportIssueView.tsx`):**
   - Title, detailed impact description, street address, category selector (`Auto-Detect with Gemini AI` or manual), WebP photo compression (`< 120 KB`), native Web Speech API voice-to-report (`en-IN`, `hi-IN`, `ta-IN`), and interactive **GPS + Pin-Point on Map** coordinate picker.
2. **Multimodal AI Classification (`api/triage.ts`, `api/_lib/triage/geminiTriage.ts`):**
   - Server-side `@google/genai` SDK using structured `responseSchema` (`TRIAGE_RESPONSE_SCHEMA`) to classify category, urgency score (`1–10`), priority level, recommended department, SLA target hours, image/text authenticity check, and nearby duplicate detection.
3. **Priority & Urgency Detection (`shared/schemas/triage.ts`):**
   - Strictly validated `Low | Medium | High | Critical` priority + integer `1..10` urgency score + live SLA countdown timer (`src/lib/utils/slaUtils.js`).
4. **Department Recommendation & Routing (`shared/types/civic.ts`):**
   - Automatically routes issues across 5 municipal departments: `Roads & Infrastructure`, `Sanitation & Waste`, `Electrical & Streetlights`, `Water & Sewage`, and `Public Safety`.
5. **Citizen Issue Tracking Dashboard (`src/components/dashboard/TrackIssuesView.tsx`):**
   - 3-step visual progress tracker (`1. Reported` → `2. In Progress` → `3. Resolved`), multi-token search across all fields, status/category filters, `+1 Affected` duplicate upvote boost, Before & After repair photo proof viewer, and downloadable official receipt (`src/lib/export/civicExport.ts`).
6. **Municipal Admin Command Desk (`src/components/admin/AdminDashboardView.tsx`):**
   - AI urgency-sorted queue (`10 → 1`), strict **Department-Scoped RBAC** (e.g., Water & Sewage staff can only view and update Water & Sewage tasks), Cross-Department Handover Request & Approval Queue, Auto-Escalation Overdue SLA alerts, After-Repair WebP photo proof upload, Immutable Municipal Audit Log, and OWASP formula-safe CSV export.

### 2. Google Developer Services Integration & Resilient Dual-Engine Failover
- **Google Gemini API (`@google/genai`):**
  - Server-only `GEMINI_API_KEY` proxy (`/api/triage`, `/api/health`) with SHA-256 request caching (`api/_lib/triage/triageCache.ts`), automatic live Flash model cascade, and deterministic civic NLP failover (`api/_lib/triage/heuristicTriage.ts`) on quota/network outage.
- **Firebase Spark Plan (`src/lib/firebase/config.ts`, `firestore.rules`):**
  - Firebase Authentication (Google OAuth, Email/Password, Anonymous Guest, and PBKDF2-SHA256 verified Department Officer passkeys) + Cloud Firestore (`issues/{issueId}`, `issue_votes/{voteId}`, `admins/{uid}`) with automatic offline failover to `LocalIssueRepository` via `HybridIssueRepository`.
- **Google Maps Platform (`src/components/map/CivicMap.tsx`):**
  - `@vis.gl/react-google-maps` (`<APIProvider>`, `<Map mapId="DEMO_MAP_ID" internalUsageAttributionIds={['gmp_git_agentskills_v1']}>`, draggable `<AdvancedMarker>`) with automatic zero-downtime failover to Leaflet + OpenStreetMap + Nominatim reverse geocoding.

### 3. 17-Point Security Posture & Department RBAC (`tests/api/full17PointSecurityAudit.test.ts`)
- **Server-Only Secrets:** `GEMINI_API_KEY` is never exposed to client bundles (`VITE_` prefix check enforced in E2E tests).
- **Department-Level RBAC:** Enforced across `AuthService.signInDepartmentOfficer`, `IssueRepository` (`applyDepartmentReadScope`, `assertDepartmentReadAccess`, `assertDepartmentWriteScope`), `AdminDashboardView`, and `firestore.rules` (`getAdminDepartment()`, `isAuthorizedAdminDepartment()`, `isAuthorizedAdminListScope()`).
- **Cryptographic Passkey Hashing (`src/lib/auth/passwordHasher.ts`, `src/lib/auth/departmentRoster.ts`):** Web Crypto `PBKDF2-HMAC-SHA256` (`100,000` iterations, unique 16-byte salt, constant-time byte comparison).
- **HTTP Hardening (`api/_lib/middleware/`):** Strict CSP, HSTS, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, CORS allowlist, sliding-window IP rate limiter (`429` + `Retry-After`), control-character & XSS input sanitization, and OWASP CSV formula injection neutralization.

### 4. Efficiency & Zero-Cost Architecture
- **Zero Blaze / Zero Credit Card:** Stores client-compressed WebP images (`< 120 KB`, validated by RIFF/WEBP magic bytes in `src/lib/media/imageValidation.ts`) directly in Firestore documents without Cloud Storage or Cloud Functions.
- **Bounded Queries:** Every Firestore and local query is capped at `MAX_ISSUES_LIMIT = 50` (`firestore.rules` enforces `request.query.limit >= 1 && request.query.limit <= 50`).

### 5. Accessibility (WCAG 2.1 AA) & Tri-Lingual Localization
- **Tri-Lingual UI & Voice (`src/lib/i18n/translations.ts`):** Full localization across **English (`EN`)**, **Hindi (`हिंदी`)**, and **Tamil (`தமிழ்`)**.
- **Responsive Desktop & Mobile (`390x844` & `1440x900`):** Bionis-inspired workspace shell with sticky desktop sidebar rail, mobile slide-over drawer, scroll-driven lavender/sandy atmospheric backdrop, and Dual Theme (Light & Dark) contrast compliance.

### 6. Automated Test Verification (`215/215` Passing Tests)
- **Unit, UI & 17-Point Security Audit (`11` suites, `97` tests):** `npm run test`
- **End-to-End Integration & Security Scenarios (`6` suites, `118` tests):** `npm run test:e2e`
- **Static Quality Gates:** `npm run typecheck` (`tsc --noEmit`, 0 errors), `npm run lint` (`eslint . --max-warnings 0`), `npm audit --omit=dev` (0 vulnerabilities).

---

## Quick Start & Deployment

```bash
# 1. Install dependencies
npm install

# 2. Configure environment (.env)
cp .env.example .env

# 3. Start full-stack dev server (Vite + embedded /api/health and /api/triage middleware)
npm run dev

# 4. Run full verification suite
npm run typecheck
npm run lint
npm run test
npm run test:e2e
npm run build:ui
```

### Verified Department Officer Passkeys
| Department Scope | Officer Email | Passkey |
| :--- | :--- | :--- |
| **Water & Sewage** *(Scoped)* | `water.staff@civicresolve.gov` | `Water#2026` |
| **Roads & Infrastructure** *(Scoped)* | `roads.staff@civicresolve.gov` | `Roads#2026` |
| **Sanitation & Waste** *(Scoped)* | `sanitation.staff@civicresolve.gov` | `Clean#2026` |
| **Electrical & Streetlights** *(Scoped)* | `electrical.staff@civicresolve.gov` | `Power#2026` |
| **Public Safety** *(Scoped)* | `safety.staff@civicresolve.gov` | `Safe#2026` |
| **All Departments (City Ops Super Admin)** | `director@civicresolve.gov` | `CivicOps#2026` |
