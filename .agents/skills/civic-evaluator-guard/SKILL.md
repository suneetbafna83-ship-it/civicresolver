---
name: civic-evaluator-guard
description: >-
  Audit and verify CivicResolve against the 7 hackathon AI evaluation rubric
  parameters (Code Quality, Security, Efficiency, Testing, Accessibility,
  Google Services, Problem Statement Alignment). Use before completing any
  major milestone or before final hackathon submission.
---

# CivicResolve Hackathon Evaluator Guard

Run this checklist before declaring any feature milestone or final build complete.

## 1. Problem Statement Alignment
- Verify all 6 required features exist and work end-to-end:
  1. Citizen Issue Reporting (title, description, location/GPS pin, category, optional image + voice input).
  2. AI-Powered Classification via Google Gemini (`@google/genai`).
  3. Priority Detection (`Low`, `Medium`, `High`, `Critical` + 1-10 urgency score).
  4. Department Recommendation (`Roads & Infrastructure`, `Sanitation & Waste`, `Electrical & Streetlights`, `Water & Sewage`, `Public Safety`).
  5. Issue Tracking Dashboard (`Reported` -> `In Progress` -> `Resolved`, live filters, duplicate upvote boost).
  6. Admin Dashboard (priority queue, department filters, status transitions, resolution notes).

## 2. Google Services Verification
- Confirm official `@google/genai` SDK is imported and used with `responseSchema` structured output.
- Confirm Google Maps Platform (`@vis.gl/react-google-maps` + `AdvancedMarkerElement` + `internalUsageAttributionIds={["gmp_git_agentskills_v1"]}`) and Firebase modular SDK (`firebase/app`, `firebase/firestore`, `firebase/auth`) + `firestore.rules` are present, with resilient unlimited fallbacks.

## 3. Security Checklist
- Confirm `GEMINI_API_KEY` is read ONLY on server/serverless routes (`api/`), never exposed via `VITE_` prefixes.
- Confirm `.env.example` exists and `.env` is in `.gitignore`.
- Confirm Zod validation on API inputs, MIME/size checks on uploaded images (`<= 5 MB` pre-compression, image types only), and zero `dangerouslySetInnerHTML`.
- Author and audit `firestore.rules` using the `firestore-rules-author` subagent and `firebase-security-rules-auditor` skill.

## 4. Accessibility (WCAG 2.1 AA)
- Verify semantic landmarks (`<header>`, `<nav>`, `<main>`, `<section>`), explicit `<label htmlFor>` bindings, visible keyboard focus rings, `aria-live="polite"` status announcements, and WCAG AA contrast in both Light Citizen and Dark Admin themes.

## 5. Efficiency & Code Quality
- Verify client-side WebP compression (`< 120 KB`), `useMemo`/`useCallback` for dashboard sorting/filtering, strict TypeScript (`tsc --noEmit` with 0 errors), and clean ESLint pass (`eslint-plugin-security` + `eslint-plugin-jsx-a11y`).

## 6. Automated Testing Verification
- Run `npm run test` (Vitest + React Testing Library + axe a11y assertions) covering AI schema parsing, fallback heuristics, image validator, duplicate detector, citizen submission flow, and admin status updates.
- Verify live rendering, DOM accessibility, and zero console errors via Chrome DevTools before final sign-off.
