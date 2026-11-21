import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { CheckCircle2, Compass } from 'lucide-react';
import type {
  CivicIssue,
  CivicSession,
  Department,
  IssueAdminUpdateInput,
  IssueCreateInput,
  StorageMode,
} from '../shared/types/civic.js';
import { fetchApiHealth } from './lib/api/triageClient.js';
import { authService } from './lib/auth/authService.js';
import {
  loadResolutionPhotosMap,
  saveResolutionPhoto,
} from './lib/export/civicExport.js';
import type { AppLanguage } from './lib/i18n/translations.js';
import { createDefaultIssueRepository } from './lib/repositories/hybridIssueRepository.js';
import { AdminDashboardView } from './components/admin/AdminDashboardView.js';
import { PortalLoginView } from './components/auth/PortalLoginView.js';
import { TrackIssuesView } from './components/dashboard/TrackIssuesView.js';
import { BionisSidebar } from './components/layout/BionisSidebar.js';
import { TopNav, type ActiveTab } from './components/layout/TopNav.js';
import { ReportIssueView } from './components/report/ReportIssueView.js';
import { DimensionalSpecModal } from './components/spec/DimensionalSpecModal.js';

export function App(): React.ReactElement {
  const repository = useMemo(() => createDefaultIssueRepository(), []);
  const atmosphereRef = useRef<HTMLDivElement | null>(null);
  const [activeTab, setActiveTab] = useState<ActiveTab>('report');
  const [darkTheme, setDarkTheme] = useState(false);
  const [language, setLanguage] = useState<AppLanguage>('en');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [issues, setIssues] = useState<CivicIssue[]>([]);
  const [votedIssueIds, setVotedIssueIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [resolutionPhotos, setResolutionPhotos] = useState<
    Record<string, string>
  >(() => loadResolutionPhotosMap());
  const [session, setSession] = useState<CivicSession | null>(null);
  const [storageMode, setStorageMode] = useState<StorageMode>(() =>
    repository.getStorageMode(),
  );
  const [aiConfigured, setAiConfigured] = useState(true);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isSpecModalOpen, setIsSpecModalOpen] = useState(false);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
  }, []);

  // Scroll-Driven Cross-Shift: Lavender glides Right->Left, Sandy Cream glides Left->Right
  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    let rafId: number | null = null;
    const updateScrollColor = (): void => {
      rafId = null;
      const el = atmosphereRef.current;
      if (!el) {
        return;
      }
      const scrollY = window.scrollY || document.documentElement.scrollTop || 0;
      const maxRange = Math.max(
        320,
        document.documentElement.scrollHeight - window.innerHeight,
      );
      const progress = Math.min(1, Math.max(0, scrollY / maxRange));
      el.style.setProperty('--scroll-progress', progress.toFixed(3));
    };

    const onScroll = (): void => {
      if (rafId === null) {
        rafId = window.requestAnimationFrame(updateScrollColor);
      }
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    updateScrollColor();
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId);
      }
    };
  }, [activeTab, session]);

  useEffect(() => {
    if (!toastMessage) {
      return;
    }
    const timer = setTimeout(() => {
      setToastMessage(null);
    }, 4500);
    return () => clearTimeout(timer);
  }, [toastMessage]);

  const refreshIssuesForSession = useCallback(
    async (targetSession: CivicSession | null) => {
      const loaded = await repository.listIssues(
        { limitCount: 50 },
        targetSession ?? undefined,
      );
      setIssues(loaded);
      setStorageMode(repository.getStorageMode());
    },
    [repository],
  );

  useEffect(() => {
    void refreshIssuesForSession(session);
  }, [refreshIssuesForSession, session]);

  useEffect(() => {
    void fetchApiHealth().then((health) => {
      if (health) {
        setAiConfigured(health.ai.configured);
      }
    });
  }, []);

  const activateSession = useCallback((nextSession: CivicSession | null) => {
    setSession(nextSession);
    setMobileNavOpen(false);
    if (nextSession?.role === 'admin') {
      setActiveTab('admin');
    } else if (nextSession?.role === 'citizen') {
      setActiveTab('report');
    }
  }, []);

  const handleSelectTab = useCallback(
    (requestedTab: ActiveTab) => {
      if (!session) {
        return;
      }
      if (session.role === 'citizen' && requestedTab === 'admin') {
        showToast(
          'Access Denied: Citizens cannot open the Admin Desk. Sign out to switch portals.',
        );
        return;
      }
      if (session.role === 'admin' && requestedTab !== 'admin') {
        showToast(
          'Access Denied: Municipal Admins operate in the Admin Command Desk only.',
        );
        return;
      }
      setActiveTab(requestedTab);
    },
    [session, showToast],
  );

  const handleSignOutPortal = useCallback(async () => {
    await authService.signOut();
    setSession(null);
    setMobileNavOpen(false);
    showToast('Signed out. Choose Citizen or Municipal Admin portal to continue.');
  }, [showToast]);

  const handleCreateIssue = useCallback(
    async (input: IssueCreateInput): Promise<CivicIssue> => {
      if (!session || session.role !== 'citizen') {
        throw new Error(
          'Only signed-in Citizen accounts can submit civic reports.',
        );
      }
      const created = await repository.createIssue(input, session);
      await refreshIssuesForSession(session);
      setActiveTab('track');
      showToast(
        `Complaint submitted & routed to ${created.assignedDepartment} (${created.priorityLevel} Priority).`,
      );
      return created;
    },
    [refreshIssuesForSession, repository, session, showToast],
  );

  const handleUpvoteIssue = useCallback(
    async (issueId: string): Promise<void> => {
      if (!session || session.role !== 'citizen') {
        showToast('Sign in to the Citizen Portal to upvote community issues.');
        return;
      }
      try {
        const updated = await repository.upvoteIssue(issueId, session);
        setVotedIssueIds((prev) => {
          const next = new Set(prev);
          next.add(issueId);
          return next;
        });
        await refreshIssuesForSession(session);
        setActiveTab('track');
        showToast(
          `Added your +1 impact vote to "${updated.title}" (${updated.upvoteCount} affected).`,
        );
      } catch (err) {
        showToast(
          err instanceof Error
            ? err.message
            : 'You have already upvoted this complaint.',
        );
      }
    },
    [refreshIssuesForSession, repository, session, showToast],
  );

  const handleAdminUpdateIssue = useCallback(
    async (issueId: string, patch: IssueAdminUpdateInput): Promise<void> => {
      if (!session || session.role !== 'admin') {
        showToast('Access Denied: Municipal Admin login required.');
        return;
      }
      const updated = await repository.updateIssue(issueId, patch, session);
      await refreshIssuesForSession(session);
      showToast(
        `Updated "${updated.title}" (${updated.status} · ${updated.assignedDepartment}).`,
      );
    },
    [refreshIssuesForSession, repository, session, showToast],
  );

  const handleAttachResolutionPhoto = useCallback(
    (issueId: string, webpDataUrl: string) => {
      const updatedMap = saveResolutionPhoto(issueId, webpDataUrl);
      setResolutionPhotos(updatedMap);
      showToast('After-Repair WebP photo proof attached and visible to citizens.');
    },
    [showToast],
  );

  const unresolvedCount = useMemo(
    () => issues.filter((item) => item.status !== 'Resolved').length,
    [issues],
  );

  // Single-page locked desktop viewport for Sign-In Gate and Report Issue (scrollable on mobile & dashboards)
  const isSinglePageDesktop =
    !session || (session.role === 'citizen' && activeTab === 'report');

  const viewTransitionKey = `${session?.role ?? 'gate'}-${session?.assignedDepartment ?? 'all'}-${activeTab}`;

  return (
    <div className={darkTheme ? 'dark' : ''}>
      <div
        ref={atmosphereRef}
        className={`nixtio-atmosphere overflow-x-hidden px-2.5 text-[#11131a] transition-colors sm:px-5 dark:text-slate-100 ${
          isSinglePageDesktop
            ? 'flex min-h-screen items-center justify-center py-2.5 lg:h-screen lg:overflow-hidden'
            : 'min-h-screen py-3 sm:py-6'
        }`}
      >
        <div
          className={`nixtio-shell mx-auto flex w-full max-w-[1440px] flex-col overflow-hidden rounded-[22px] sm:rounded-[30px] ${
            isSinglePageDesktop
              ? 'lg:h-[calc(100vh-1.25rem)] lg:max-h-[calc(100vh-1.25rem)]'
              : 'min-h-[calc(100vh-3rem)]'
          }`}
        >
          <div className="flex min-h-0 flex-1">
            {/* Bionis Responsive Left Rail (Desktop Static + Mobile Slide-Over Drawer) */}
            {session && (
              <BionisSidebar
                activeTab={activeTab}
                onSelectTab={handleSelectTab}
                session={session}
                totalIssuesCount={issues.length}
                unresolvedIssuesCount={unresolvedCount}
                storageMode={storageMode}
                aiConfigured={aiConfigured}
                language={language}
                isOpenMobile={mobileNavOpen}
                onCloseMobile={() => setMobileNavOpen(false)}
              />
            )}

            {/* Right Main Workspace Column */}
            <div className="flex min-w-0 flex-1 flex-col">
              <TopNav
                activeTab={activeTab}
                onSelectTab={handleSelectTab}
                totalIssuesCount={issues.length}
                unresolvedIssuesCount={unresolvedCount}
                session={session}
                storageMode={storageMode}
                aiConfigured={aiConfigured}
                darkTheme={darkTheme}
                language={language}
                onToggleLanguage={() =>
                  setLanguage((prev) => (prev === 'en' ? 'hi' : 'en'))
                }
                onToggleTheme={() => setDarkTheme((prev) => !prev)}
                onSignOutPortal={() => void handleSignOutPortal()}
                onOpenMobileNav={() => setMobileNavOpen(true)}
              />

              {/* Floating Accessible Status Toast */}
              {toastMessage && (
                <div
                  role="status"
                  aria-live="polite"
                  className="mx-auto mt-2.5 flex w-full max-w-6xl items-center justify-between px-3.5 sm:px-6"
                >
                  <div
                    className={`flex w-full items-center justify-between gap-3 rounded-full px-4 py-2 text-xs font-bold shadow-sm ${
                      darkTheme ? 'glass-surface-dark' : 'glass-surface-light'
                    }`}
                  >
                    <div className="flex min-w-0 items-center gap-2 text-[#11131a] dark:text-white">
                      <CheckCircle2
                        className="h-4 w-4 shrink-0 text-[#3730a3] dark:text-indigo-300"
                        aria-hidden="true"
                      />
                      <span className="truncate">{toastMessage}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setToastMessage(null)}
                      className="shrink-0 rounded-full bg-[#3730a3] px-3 py-0.5 text-white"
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              )}

              {/* Liquid-Glass Animated Tab Panel Transition */}
              <main className="flex-1 overflow-x-hidden overflow-y-auto lg:overflow-y-visible">
                <div
                  key={viewTransitionKey}
                  className="tab-transition-enter h-full"
                >
                  {!session ? (
                    <PortalLoginView
                      onCitizenGuestSignIn={async () => {
                        const guest = await authService.signInAsGuest();
                        activateSession(guest);
                        showToast(
                          'Signed in to Citizen Workspace (Report Issues & Track Complaints).',
                        );
                      }}
                      onCitizenGoogleSignIn={async () => {
                        const googleUser = await authService.signInWithGoogle();
                        if (googleUser) {
                          activateSession({ ...googleUser, role: 'citizen' });
                          showToast(
                            `Signed in to Citizen Workspace as ${googleUser.displayName}.`,
                          );
                        }
                      }}
                      onCitizenEmailSignIn={async (email, password) => {
                        const user = await authService.signInWithEmail(
                          email,
                          password,
                        );
                        activateSession({ ...user, role: 'citizen' });
                        showToast(
                          `Signed in to Citizen Workspace as ${user.displayName}.`,
                        );
                      }}
                      onCitizenEmailSignUp={async (
                        email,
                        password,
                        displayName,
                      ) => {
                        const user = await authService.signUpWithEmail(
                          email,
                          password,
                          displayName,
                        );
                        activateSession({ ...user, role: 'citizen' });
                        showToast(
                          `Citizen account created for ${user.displayName}.`,
                        );
                      }}
                      onAdminQuickDemoSignIn={async (
                        department?: Department | null,
                      ) => {
                        const admin =
                          await authService.enterPreviewAdminMode(
                            department ?? null,
                          );
                        activateSession(admin);
                        showToast(
                          department
                            ? `Signed in as ${department} Staff Only (Cross-Department Access Blocked).`
                            : 'Signed in to Municipal Admin Command Desk (All Departments).',
                        );
                      }}
                      onAdminSignIn={async (
                        officerEmail: string,
                        passcode: string,
                        department: Department | null,
                      ) => {
                        const admin =
                          await authService.signInDepartmentOfficer(
                            officerEmail,
                            passcode,
                            department,
                          );
                        activateSession(admin);
                        showToast(
                          admin.assignedDepartment
                            ? `Verified ${admin.assignedDepartment} Officer (${admin.displayName}).`
                            : `Verified City Ops Admin (${admin.displayName}).`,
                        );
                      }}
                    />
                  ) : session.role === 'citizen' ? (
                    activeTab === 'track' ? (
                      <TrackIssuesView
                        issues={issues}
                        votedIssueIds={votedIssueIds}
                        resolutionPhotos={resolutionPhotos}
                        darkTheme={darkTheme}
                        language={language}
                        onUpvoteIssue={handleUpvoteIssue}
                      />
                    ) : (
                      <ReportIssueView
                        existingIssues={issues}
                        darkTheme={darkTheme}
                        language={language}
                        getIdToken={async () => await session.getIdToken()}
                        onCreateIssue={handleCreateIssue}
                        onUpvoteDuplicate={handleUpvoteIssue}
                      />
                    )
                  ) : (
                    <AdminDashboardView
                      issues={issues}
                      session={session}
                      resolutionPhotos={resolutionPhotos}
                      onAttachResolutionPhoto={handleAttachResolutionPhoto}
                      onEnableDemoAdmin={async () => {
                        const adminSession =
                          await authService.enterPreviewAdminMode();
                        activateSession(adminSession);
                      }}
                      onUpdateIssue={handleAdminUpdateIssue}
                    />
                  )}
                </div>
              </main>

              {/* Compact Footer */}
              <footer className="border-t border-slate-200/70 px-4 py-2.5 text-xs font-medium text-slate-700 sm:px-6 dark:border-slate-800/80 dark:text-slate-300">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[11px] sm:text-xs">
                    CivicResolve · Scoped Department RBAC · Google Gemini, Firebase Spark &amp; Maps
                  </span>

                  <button
                    type="button"
                    onClick={() => setIsSpecModalOpen(true)}
                    className="press-feedback inline-flex min-h-[34px] items-center gap-1.5 rounded-full bg-[#3730a3] px-3.5 py-1 font-mono text-[11px] font-semibold text-white hover:bg-[#312e81]"
                  >
                    <Compass className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>UI Spec Sheet (CAD)</span>
                  </button>
                </div>
              </footer>
            </div>
          </div>
        </div>

        <DimensionalSpecModal
          isOpen={isSpecModalOpen}
          onClose={() => setIsSpecModalOpen(false)}
        />
      </div>
    </div>
  );
}
