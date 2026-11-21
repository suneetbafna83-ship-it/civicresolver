// @vitest-environment jsdom
import React from 'react';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { App } from '../../src/App.js';
import {
  buildIssuesCsv,
  buildOfficialReceiptText,
  escapeCsvCell,
} from '../../src/lib/export/civicExport.js';
import { computeSlaStatus } from '../../src/lib/utils/slaUtils.js';
import { createSeedIssues } from '../../src/lib/repositories/seedIssues.js';

afterEach(() => {
  cleanup();
});

describe('CivicResolve Phase 2 Frontend UI, Dual-Portal Login & Strict Workspace Isolation', () => {
  it('renders the initial Dual-Portal Login screen separating Citizen Sign-In and Municipal Admin Sign-In', () => {
    render(<App />);

    expect(screen.getByRole('banner')).toBeDefined();
    expect(screen.getByRole('main')).toBeDefined();

    expect(
      screen.getByRole('heading', { name: /Citizen Portal Sign In/i }),
    ).toBeDefined();
    expect(
      screen.getByRole('heading', { name: /Municipal Admin Sign In/i }),
    ).toBeDefined();

    // Neither workspace tabs are exposed before role sign-in
    expect(
      screen.queryByRole('button', { name: /1\. Report Issue/i }),
    ).toBeNull();
    expect(
      screen.queryByRole('button', { name: /Municipal Admin Desk/i }),
    ).toBeNull();
  });

  it('signs into Citizen Workspace only (hiding Admin Desk), runs 1-click Sample Preset AI triage, and submits report', async () => {
    render(<App />);

    const citizenEntryBtn = screen.getByRole('button', {
      name: /Enter Citizen Workspace/i,
    });
    fireEvent.click(citizenEntryBtn);

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /1\. Report Issue/i }),
      ).toBeDefined();
      expect(
        screen.getByRole('button', { name: /2\. Track Complaints/i }),
      ).toBeDefined();
    });

    // Strict Workspace Isolation: Citizen cannot see or access Admin Desk tab
    expect(
      screen.queryByRole('button', { name: /Municipal Admin Desk/i }),
    ).toBeNull();

    const sampleBtn = await screen.findByRole('button', {
      name: /Sample 2: Burst Water Pipe/i,
    });
    fireEvent.click(sampleBtn);

    await waitFor(() => {
      expect(
        screen.getAllByText(/Water Leak & Sewage/i).length,
      ).toBeGreaterThan(1);
      expect(screen.getAllByText(/Water & Sewage/i).length).toBeGreaterThan(0);
    });

    // Verify 2. Pin Point on Map interactive coordinate/street pinning updates location address
    const pinModeBtn = screen.getByRole('button', {
      name: /2\. Pin Point on Map/i,
    });
    fireEvent.click(pinModeBtn);
    const pinInput = screen.getByLabelText(/Pin street name or coordinates/i);
    fireEvent.change(pinInput, {
      target: { value: '37.7812, -122.4115' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^Pin Here$/i }));
    expect(
      screen.getByDisplayValue(/37\.7812, -122\.4115|Near Civic Center/i),
    ).toBeDefined();

    const submitBtn = screen.getByRole('button', {
      name: /2\. Submit Official Report/i,
    });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(
        screen.getByRole('heading', {
          name: /Citizen Issue Tracking Dashboard/i,
        }),
      ).toBeDefined();
      expect(
        screen.getByText(
          /Pressurized water pipe leaking across Civic Center sidewalk/i,
        ),
      ).toBeDefined();
    });
  });

  it('signs into Municipal Admin Workspace only (hiding Citizen Reporting) and allows switching portals via Sign Out', async () => {
    render(<App />);

    const adminEntryBtn = screen.getByRole('button', {
      name: /Enter Admin Command Desk \(1-Click Demo Admin\)/i,
    });
    fireEvent.click(adminEntryBtn);

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: /Municipal Admin Command Desk/i }),
      ).toBeDefined();
      expect(
        screen.getByRole('button', { name: /Municipal Admin Desk/i }),
      ).toBeDefined();
    });

    // Strict Workspace Isolation: Admin cannot see Citizen Reporting or Citizen Tracking tabs
    expect(
      screen.queryByRole('button', { name: /1\. Report Issue/i }),
    ).toBeNull();
    expect(
      screen.queryByRole('button', { name: /2\. Track Complaints/i }),
    ).toBeNull();

    // Sign out returns to Dual-Portal Login Gate
    const signOutBtn = screen.getByRole('button', {
      name: /Sign Out \/ Switch Portal/i,
    });
    fireEvent.click(signOutBtn);

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: /Citizen Portal Sign In/i }),
      ).toBeDefined();
    });
  });

  it('opens the Apple-style monochrome Dimensional Drawing Spec Sheet (CAD) modal from the footer', async () => {
    render(<App />);

    const specBtn = screen.getByRole('button', {
      name: /UI Spec Sheet \(CAD\)/i,
    });
    fireEvent.click(specBtn);

    await waitFor(() => {
      expect(
        screen.getByRole('dialog', {
          name: /APPLE-STYLE MONOCHROME DIMENSIONAL DRAWING/i,
        }),
      ).toBeDefined();
      expect(
        screen.getByText(/CONCENTRIC INNER RADIUS FORMULA/i),
      ).toBeDefined();
    });
  });

  it('verifies CSV formula-injection protection, official receipt generation, live SLA countdown, and EN/Hindi language toggle', async () => {
    // OWASP CSV Injection defense check
    expect(escapeCsvCell('=CMD|"/C calc"!A0')).toBe(`"'=CMD|""/C calc""!A0"`);
    expect(escapeCsvCell('+1234')).toBe(`"'+1234"`);

    const seed = createSeedIssues();
    const first = seed[0]!;
    const csv = buildIssuesCsv(seed);
    expect(csv).toContain('Tracking ID');
    expect(csv).toContain(first.title);

    const receipt = buildOfficialReceiptText(first);
    expect(receipt).toContain('OFFICIAL MUNICIPAL RECEIPT');
    expect(receipt).toContain(first.id);

    const overdueSla = computeSlaStatus(
      {
        createdAt: '2026-11-18T00:00:00.000Z',
        slaEstimateHours: 4,
        status: 'Reported',
        resolvedAt: null,
      },
      Date.parse('2026-11-21T00:00:00.000Z'),
    );
    expect(overdueSla.isOverdue).toBe(true);
    expect(overdueSla.label).toContain('OVERDUE');

    render(<App />);
    const langBtn = screen.getByRole('button', {
      name: /Toggle language between English and Hindi/i,
    });
    fireEvent.click(langBtn);

    fireEvent.click(
      screen.getByRole('button', { name: /नागरिक कार्यक्षेत्र में प्रवेश करें/i }),
    );
    await waitFor(() => {
      expect(screen.getByText(/स्थानीय समस्या की रिपोर्ट करें/i)).toBeDefined();
    });
  });

  it('scopes Water & Sewage Staff via PBKDF2 passkey login exclusively to Water & Sewage tasks, verifies Tamil translation, and renders mobile drawer controls', async () => {
    render(<App />);

    // Cycle language EN -> HI -> TA and verify Tamil UI rendering on Login Gate
    const langBtn = screen.getByRole('button', {
      name: /Toggle language between English and Hindi/i,
    });
    fireEvent.click(langBtn); // HI
    fireEvent.click(langBtn); // TA
    expect(
      screen.getByText(/CivicResolve-க்கு வரவேற்கிறோம்/i),
    ).toBeDefined();
    fireEvent.click(langBtn); // back to EN

    // Confirm staff 1-click demo button is removed while 1-click Demo Admin remains
    expect(
      screen.queryByRole('button', { name: /Water Dept Staff Only \(Demo\)/i }),
    ).toBeNull();
    expect(
      screen.getByRole('button', {
        name: /Enter Admin Command Desk \(1-Click Demo Admin\)/i,
      }),
    ).toBeDefined();

    // Sign in as Water & Sewage Officer with verified PBKDF2 passkey
    fireEvent.change(screen.getByLabelText(/Officer Email/i), {
      target: { value: 'water.staff@civicresolve.gov' },
    });
    fireEvent.change(screen.getByLabelText(/Department Passkey/i), {
      target: { value: 'Water#2026' },
    });
    fireEvent.click(
      screen.getByRole('button', {
        name: /Sign In as Department Officer \(Water & Sewage\)/i,
      }),
    );

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: /Municipal Admin Command Desk/i }),
      ).toBeDefined();
      expect(
        screen.getAllByText(/Water & Sewage/i).length,
      ).toBeGreaterThan(0);
    });

    // Mobile drawer navigation button exists in DOM
    expect(
      screen.getByRole('button', { name: /Open navigation menu/i }),
    ).toBeDefined();

    // Non-Water issues from seeded dataset (Roads, Sanitation) MUST NOT be shown to Water & Sewage staff
    expect(
      screen.queryByText(/Deep cratered pothole on Oak & 5th intersection/i),
    ).toBeNull();
    expect(
      screen.queryByText(/Uncollected overflowing waste bins near Pier 3 market/i),
    ).toBeNull();

    // Multi-department filter buttons (All Departments / Roads & Infrastructure tabs) MUST NOT be exposed
    expect(
      screen.queryByRole('button', { name: /^All Departments$/i }),
    ).toBeNull();
    expect(
      screen.queryByRole('button', { name: /^Roads & Infrastructure$/i }),
    ).toBeNull();

    // Cross-department handover request trigger & Audit Log toggle are available
    expect(
      screen.getAllByRole('button', { name: /Request Dept Handover/i }).length,
    ).toBeGreaterThan(0);
    expect(
      screen.getByRole('button', { name: /Immutable Municipal Audit Log/i }),
    ).toBeDefined();
  });

  it('enforces WCAG 2.1 AA landmarks, skip-to-content link, dynamic html lang sync, and semantic chart/progress roles', async () => {
    render(<App />);

    // 1. Skip-to-main-content bypass link and #main-content landmark
    const skipLink = screen.getByRole('link', { name: /Skip to main content/i });
    expect(skipLink.getAttribute('href')).toBe('#main-content');
    expect(document.getElementById('main-content')?.tagName).toBe('MAIN');

    // 2. Dynamic document.documentElement.lang synchronization across EN -> HI -> TA -> EN
    expect(document.documentElement.lang).toBe('en');
    const langBtn = screen.getByRole('button', {
      name: /Toggle language between English and Hindi/i,
    });
    fireEvent.click(langBtn);
    expect(document.documentElement.lang).toBe('hi');
    fireEvent.click(langBtn);
    expect(document.documentElement.lang).toBe('ta');
    fireEvent.click(langBtn);
    expect(document.documentElement.lang).toBe('en');

    // 3. Citizen Track view exposes accessible SVG role="img" charts and role="progressbar" step tracks
    fireEvent.click(
      screen.getByRole('button', { name: /Enter Citizen Workspace/i }),
    );
    fireEvent.click(
      await screen.findByRole('button', { name: /2\. Track Complaints/i }),
    );
    await waitFor(() => {
      expect(
        screen.getAllByRole('progressbar').length,
      ).toBeGreaterThan(0);
      expect(
        screen.getByRole('img', { name: /SLA Health Score/i }),
      ).toBeDefined();
      expect(
        screen.getByRole('img', { name: /6-day reported vs resolved trend chart/i }),
      ).toBeDefined();
    });
  });
});
