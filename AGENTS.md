# CivicResolve — Workspace Guardrails

## Communication & Token Efficiency
- Respond crisply and directly; avoid slang, filler, or verbose narration.
- Always read and update `PROJECT_MEMORY.md` at the workspace root before scanning directories.

## Architecture (Locked)
- **Frontend:** Vite + React + TypeScript (strict, zero `any`) + Tailwind CSS.
- **API Proxy:** Vercel-compatible `/api/*` serverless functions (with local Node dev server) guarding `GEMINI_API_KEY` server-side (never expose via `VITE_` prefixes).
- **AI Engine:** Official `@google/genai` SDK (`gemini-2.5-flash`) with structured JSON `responseSchema` for multimodal image/text triage, urgency scoring (1-10), priority level, department routing, SLA estimation, authenticity checks, and nearby duplicate detection.
- **Database & Auth (100% Free — No Credit Card):** Firebase Spark Plan (Firestore + Auth: Google/Email + Guest Citizen + 1-click Demo Admin Mode) with hardened `firestore.rules` and capped queries (`limit(50)`).
- **Zero-Cost Media Constraint:** NEVER use Firebase Cloud Storage or Cloud Functions (Blaze/card required). Compress uploaded images client-side via Canvas to WebP (< 120 KB) and store directly inside Firestore documents.
- **Maps & Accessibility:** Google Maps Platform (`@vis.gl/react-google-maps` + `AdvancedMarkerElement` + `mapId="DEMO_MAP_ID"`) via free Maps Demo Key; native Web Speech API voice-to-report; Dual Theme (Light Citizen Portal + toggleable Dark Admin Command Center), WCAG 2.1 AA contrast in both.

## Resilient Dual-Engine Failover (Zero Downtime)
- **Maps:** Primary = Google Maps Platform; auto-failover to Leaflet + OpenStreetMap (unlimited, no key) on missing key, load error, or quota/auth failure (`gm_authFailure`). Cache reverse-geocoded coordinates locally.
- **AI Triage:** Primary = `@google/genai` with hash-based response cache; auto-failover on `429`/quota/missing key to deterministic civic NLP heuristics (transparently tagged in response metadata).
- **Database:** Primary = Firebase Firestore; auto-failover to browser `localStorage` seeded with sample civic issues when Firebase env vars are unset or offline.

## Execution & Frontend Design Rules (Locked)
- **Solo Execution Only:** Execute tasks directly in the main agent (do NOT invoke `/teamwork` or multi-agent swarms unless explicitly requested).
- **45-yo Citizen Clarity (`impeccable` Operate + `oil-ui`):** Open directly into the task workspace with numbered plain-English tabs (`1. Report Issue`, `2. Track Complaints`, `3. Admin Desk`), explicit text labels on all buttons, 1-click sample issue presets, and a 3-step visual progress bar (`Reported` -> `In Progress` -> `Resolved`).
- **Color Restraint (Zero Rainbow Clutter):** 90% monochrome slate-on-alabaster (`#F8FAFC`/`#FFFFFF`/`#0F172A` in Light; `#0B0F17`/`#111827`/`#F8FAFC` in Dark) + 1 brand accent (Civic Cobalt `#1D4ED8`). Represent priority and status with quiet neutral pills and 6px semantic indicator dots.
- **Selective Translucent Glass (`apple-design` + `emil-design-eng`):** Use frosted glass (`backdrop-blur-md bg-white/80 dark:bg-slate-900/80`) only on floating layers (sticky top bar, map address HUD, AI triage preview); keep data lists solid for high contrast and 60fps performance. Use `150ms cubic-bezier(0.23, 1, 0.32, 1)` and `active:scale-[0.98]` press feedback.
- **Concentric Geometry (`dimensional-drawing`):** Enforce nested border radii (`R_inner = R_outer - border - inset`, e.g. `16px` outer card -> `10px` inner well) and `tabular-nums` on all scores, SLAs, and coordinates.
