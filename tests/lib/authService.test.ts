import { describe, expect, it, vi } from 'vitest';
import type { AuthProvider } from 'firebase/auth';
import {
  LOCAL_GUEST_STORAGE_KEY,
  PREVIEW_ADMIN_DEPT_STORAGE_KEY,
  PREVIEW_ADMIN_STORAGE_KEY,
  createAuthService,
  createInMemoryAuthStorage,
  type AuthLike,
  type AuthUserLike,
  type FirebaseAuthFns,
} from '../../src/lib/auth/authService.js';

function createMockUser(overrides?: Partial<AuthUserLike>): AuthUserLike {
  return {
    uid: 'firebase-uid-123',
    displayName: 'Maya Citizen',
    email: 'maya@example.com',
    isAnonymous: false,
    providerData: [{ providerId: 'google.com' }],
    getIdToken: async () => 'mock-jwt-token',
    getIdTokenResult: async () => ({ claims: {} }),
    ...overrides,
  };
}

function createMockFirebaseAuthFns(initialUser: AuthUserLike | null = null) {
  let currentUser = initialUser;
  let stateCallback: ((user: AuthUserLike | null) => void) | null = null;
  const mockAuth: AuthLike = {
    get currentUser() {
      return currentUser;
    },
  };

  const fns: FirebaseAuthFns = {
    createGoogleProvider: () => ({ providerId: 'google.com' }) as AuthProvider,
    signInWithPopup: vi.fn(async () => {
      const user = createMockUser();
      currentUser = user;
      return { user };
    }),
    signInWithRedirect: vi.fn(async () => undefined),
    getRedirectResult: vi.fn(async () => null),
    signInWithEmailAndPassword: vi.fn(async () => {
      const user = createMockUser({
        uid: 'email-uid-1',
        providerData: [{ providerId: 'password' }],
      });
      currentUser = user;
      return { user };
    }),
    createUserWithEmailAndPassword: vi.fn(async (_auth, email) => {
      const user = createMockUser({
        uid: 'new-email-uid',
        displayName: null,
        email,
        providerData: [{ providerId: 'password' }],
      });
      currentUser = user;
      return { user };
    }),
    updateProfile: vi.fn(async () => undefined),
    signInAnonymously: vi.fn(async () => {
      const user = createMockUser({
        uid: 'anon-uid-99',
        displayName: null,
        email: null,
        isAnonymous: true,
        providerData: [],
      });
      currentUser = user;
      return { user };
    }),
    signOut: vi.fn(async () => {
      currentUser = null;
      stateCallback?.(null);
    }),
    onAuthStateChanged: vi.fn((_auth, cb) => {
      stateCallback = cb;
      return () => {
        stateCallback = null;
      };
    }),
  };

  return {
    mockAuth,
    fns,
    emitAuthChange: (user: AuthUserLike | null) => {
      currentUser = user;
      stateCallback?.(user);
    },
  };
}

describe('AuthService', () => {
  it('handles Google popup sign-in, popup-blocked redirect fallback, and unauthorized-domain guidance', async () => {
    const storage = createInMemoryAuthStorage();
    const { mockAuth, fns } = createMockFirebaseAuthFns();
    const service = createAuthService({
      isFirebaseConfigured: () => true,
      getAuthInstance: () => mockAuth,
      checkVerifiedAdmin: async () => false,
      sessionStorage: storage,
      firebaseAuthFns: fns,
    });

    const googleSession = await service.signInWithGoogle();
    expect(googleSession).not.toBeNull();
    expect(googleSession?.provider).toBe('google');
    expect(googleSession?.role).toBe('citizen');
    expect(await googleSession?.getIdToken()).toBe('mock-jwt-token');

    // Popup blocked -> redirect fallback returning null
    vi.mocked(fns.signInWithPopup).mockRejectedValueOnce(
      Object.assign(new Error('Popup blocked'), { code: 'auth/popup-blocked' }),
    );
    const redirectResult = await service.signInWithGoogle();
    expect(redirectResult).toBeNull();
    expect(fns.signInWithRedirect).toHaveBeenCalledTimes(1);

    // Unauthorized domain -> actionable message mentioning localhost
    vi.mocked(fns.signInWithPopup).mockRejectedValueOnce(
      Object.assign(new Error('Unauthorized domain'), {
        code: 'auth/unauthorized-domain',
      }),
    );
    await expect(service.signInWithGoogle()).rejects.toMatchObject({
      code: 'UNAUTHORIZED_DOMAIN',
      message: expect.stringContaining('localhost'),
    });
  });

  it('handles Email sign-in, Email sign-up with updateProfile, and input validation', async () => {
    const storage = createInMemoryAuthStorage();
    const { mockAuth, fns } = createMockFirebaseAuthFns();
    const service = createAuthService({
      isFirebaseConfigured: () => true,
      getAuthInstance: () => mockAuth,
      checkVerifiedAdmin: async (uid) => uid === 'email-uid-1',
      sessionStorage: storage,
      firebaseAuthFns: fns,
    });

    await expect(service.signInWithEmail('not-an-email', 'secret')).rejects.toMatchObject({
      code: 'INVALID_INPUT',
    });

    await expect(
      service.signUpWithEmail('citizen@example.com', '123', 'Valid Name'),
    ).rejects.toMatchObject({ code: 'WEAK_PASSWORD' });

    await expect(
      service.signUpWithEmail('citizen@example.com', 'secret123', '<script>xss</script>'),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });

    const signedUp = await service.signUpWithEmail(
      'citizen@example.com',
      'StrongPass123',
      'Jordan Rivera',
    );
    expect(fns.updateProfile).toHaveBeenCalledWith(expect.anything(), {
      displayName: 'Jordan Rivera',
    });
    expect(signedUp.displayName).toBe('Jordan Rivera');
    expect(signedUp.provider).toBe('password');
    expect(signedUp.isVerifiedFirebaseAdmin).toBe(false);

    const adminSignIn = await service.signInWithEmail('ops@city.gov', 'StrongPass123');
    expect(adminSignIn.role).toBe('admin');
    expect(adminSignIn.isVerifiedFirebaseAdmin).toBe(true);

    // Any brand-new user email calling signInWithEmail auto-provisions and signs in without failing
    vi.mocked(fns.signInWithEmailAndPassword).mockRejectedValueOnce(
      Object.assign(new Error('User not found'), { code: 'auth/invalid-credential' }),
    );
    const anyEmailUser = await service.signInWithEmail(
      'any.new.citizen@gmail.com',
      'AnyValidPass123',
    );
    expect(anyEmailUser.role).toBe('citizen');
    expect(anyEmailUser.email).toBe('any.new.citizen@gmail.com');
  });

  it('supports Guest Citizen via Firebase anonymous auth and local-guest fallback when unconfigured or offline', async () => {
    // 1. Firebase configured anonymous sign-in
    const storage = createInMemoryAuthStorage();
    const { mockAuth, fns } = createMockFirebaseAuthFns();
    const configuredService = createAuthService({
      isFirebaseConfigured: () => true,
      getAuthInstance: () => mockAuth,
      checkVerifiedAdmin: async () => false,
      sessionStorage: storage,
      firebaseAuthFns: fns,
    });

    const anonSession = await configuredService.signInAsGuest();
    expect(anonSession.provider).toBe('anonymous');
    expect(anonSession.isAnonymous).toBe(true);
    expect(anonSession.role).toBe('citizen');

    // 2. Unconfigured fallback -> persisted local-guest
    const localStorage = createInMemoryAuthStorage();
    const unconfiguredService = createAuthService({
      isFirebaseConfigured: () => false,
      getAuthInstance: () => null,
      sessionStorage: localStorage,
      idGenerator: () => 'guest_fixed_1',
    });
    const localGuest = await unconfiguredService.signInAsGuest();
    expect(localGuest.provider).toBe('local-guest');
    expect(localGuest.uid).toBe('guest_fixed_1');
    expect(localGuest.isAnonymous).toBe(true);
    expect(await localGuest.getIdToken()).toBeNull();
    expect(localStorage.getItem(LOCAL_GUEST_STORAGE_KEY)).toContain('guest_fixed_1');
  });

  it('enters 1-Click Preview Admin mode persisted in sessionStorage without mutating Firebase Auth and clears on signOut', async () => {
    const storage = createInMemoryAuthStorage();
    const signedInUser = createMockUser({ uid: 'citizen-1' });
    const { mockAuth, fns, emitAuthChange } = createMockFirebaseAuthFns(signedInUser);
    const service = createAuthService({
      isFirebaseConfigured: () => true,
      getAuthInstance: () => mockAuth,
      checkVerifiedAdmin: async () => false,
      sessionStorage: storage,
      firebaseAuthFns: fns,
    });

    const received: Array<string | null> = [];
    const unsubscribe = service.onAuthStateChange((session) => {
      received.push(session ? `${session.provider}:${session.role}` : null);
    });

    const previewSession = await service.enterPreviewAdminMode();
    expect(previewSession.uid).toBe('preview-admin');
    expect(previewSession.role).toBe('admin');
    expect(previewSession.provider).toBe('preview-admin');
    expect(previewSession.isPreviewAdmin).toBe(true);
    expect(previewSession.isVerifiedFirebaseAdmin).toBe(false);
    expect(storage.getItem(PREVIEW_ADMIN_STORAGE_KEY)).toBe('true');
    // Entering preview admin must NOT sign out Firebase Auth
    expect(fns.signOut).not.toHaveBeenCalled();

    // Null ticks from Firebase Auth must not wipe active Preview Admin mode
    emitAuthChange(null);
    const active = await service.getCurrentSession();
    expect(active?.provider).toBe('preview-admin');

    // Sign out clears preview flag and emits null
    await service.signOut();
    expect(storage.getItem(PREVIEW_ADMIN_STORAGE_KEY)).toBeNull();
    expect(storage.getItem(PREVIEW_ADMIN_DEPT_STORAGE_KEY)).toBeNull();
    expect(await service.getCurrentSession()).toBeNull();
    expect(received.at(-1)).toBeNull();

    unsubscribe();
  });

  it('scopes enterPreviewAdminMode and signInDepartmentOfficer to verified departments and blocks cross-department escalation', async () => {
    const storage = createInMemoryAuthStorage();
    const { mockAuth, fns } = createMockFirebaseAuthFns();

    const waterService = createAuthService({
      isFirebaseConfigured: () => true,
      getAuthInstance: () => mockAuth,
      checkVerifiedAdmin: async (uid) => uid === 'email-uid-1',
      resolveAdminDepartment: async (uid) =>
        uid === 'email-uid-1' ? 'Water & Sewage' : null,
      sessionStorage: storage,
      firebaseAuthFns: fns,
    });

    // Scoped preview admin persists Water & Sewage across reload
    const scopedPreview = await waterService.enterPreviewAdminMode('Water & Sewage');
    expect(scopedPreview.role).toBe('admin');
    expect(scopedPreview.assignedDepartment).toBe('Water & Sewage');
    expect(storage.getItem(PREVIEW_ADMIN_DEPT_STORAGE_KEY)).toBe('Water & Sewage');
    const restoredPreview = await waterService.getCurrentSession();
    expect(restoredPreview?.assignedDepartment).toBe('Water & Sewage');

    await waterService.signOut();

    // Verified Firebase Water & Sewage officer succeeds when selecting Water & Sewage
    const verifiedWater = await waterService.signInDepartmentOfficer(
      'water.officer@civic.gov',
      'ValidPass123!',
      'Water & Sewage',
    );
    expect(verifiedWater.role).toBe('admin');
    expect(verifiedWater.isVerifiedFirebaseAdmin).toBe(true);
    expect(verifiedWater.assignedDepartment).toBe('Water & Sewage');

    // Cross-department access or escalation to City Ops rejects with FORBIDDEN and signs out
    await expect(
      waterService.signInDepartmentOfficer(
        'water.officer@civic.gov',
        'ValidPass123!',
        'Roads & Infrastructure',
      ),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });

    await expect(
      waterService.signInDepartmentOfficer(
        'water.officer@civic.gov',
        'ValidPass123!',
        null,
      ),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(fns.signOut).toHaveBeenCalledTimes(2);

    // Non-admin citizen account attempting officer login is rejected with FORBIDDEN
    const citizenDeniedService = createAuthService({
      isFirebaseConfigured: () => true,
      getAuthInstance: () => mockAuth,
      checkVerifiedAdmin: async () => false,
      sessionStorage: createInMemoryAuthStorage(),
      firebaseAuthFns: fns,
    });
    await expect(
      citizenDeniedService.signInDepartmentOfficer(
        'citizen@example.com',
        'ValidPass123!',
        'Water & Sewage',
      ),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });

    // PBKDF2-SHA256 verified department roster login works offline without Firebase Auth
    const offlineRosterService = createAuthService({
      isFirebaseConfigured: () => false,
      getAuthInstance: () => null,
      sessionStorage: createInMemoryAuthStorage(),
    });
    const waterOfficer = await offlineRosterService.signInDepartmentOfficer(
      'water.staff@civicresolve.gov',
      'Water#2026',
      'Water & Sewage',
    );
    expect(waterOfficer.role).toBe('admin');
    expect(waterOfficer.assignedDepartment).toBe('Water & Sewage');

    // Wrong passkey rejects with INVALID_CREDENTIALS
    await expect(
      offlineRosterService.signInDepartmentOfficer(
        'water.staff@civicresolve.gov',
        'WrongPass999',
        'Water & Sewage',
      ),
    ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });

    // Water officer attempting Roads department rejects with FORBIDDEN
    await expect(
      offlineRosterService.signInDepartmentOfficer(
        'water.staff@civicresolve.gov',
        'Water#2026',
        'Roads & Infrastructure',
      ),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('rejects wrong passwords for existing Firebase and offline PBKDF2 citizen accounts without bypass', async () => {
    // 1. Firebase existing email rejecting wrong password must NOT fall back to a bypass session
    const { mockAuth, fns } = createMockFirebaseAuthFns();
    vi.mocked(fns.signInWithEmailAndPassword).mockRejectedValueOnce(
      Object.assign(new Error('Invalid credentials'), { code: 'auth/invalid-credential' }),
    );
    vi.mocked(fns.createUserWithEmailAndPassword).mockRejectedValueOnce(
      Object.assign(new Error('Email already in use'), { code: 'auth/email-already-in-use' }),
    );
    const firebaseService = createAuthService({
      isFirebaseConfigured: () => true,
      getAuthInstance: () => mockAuth,
      sessionStorage: createInMemoryAuthStorage(),
      firebaseAuthFns: fns,
    });
    await expect(
      firebaseService.signInWithEmail('existing@example.com', 'WrongPass999'),
    ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });

    // 2. Offline local PBKDF2 vault verifies stored password hash strictly
    const offlineStorage = createInMemoryAuthStorage();
    const offlineService = createAuthService({
      isFirebaseConfigured: () => false,
      getAuthInstance: () => null,
      sessionStorage: offlineStorage,
    });
    const created = await offlineService.signUpWithEmail(
      'local.citizen@example.com',
      'RightPass#2026',
      'Local Citizen',
    );
    expect(created.email).toBe('local.citizen@example.com');

    await expect(
      offlineService.signInWithEmail('local.citizen@example.com', 'WrongPass#999'),
    ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });

    await expect(
      offlineService.signUpWithEmail(
        'local.citizen@example.com',
        'DifferentPass#999',
        'Impostor',
      ),
    ).rejects.toMatchObject({ code: 'EMAIL_IN_USE' });

    const verified = await offlineService.signInWithEmail(
      'local.citizen@example.com',
      'RightPass#2026',
    );
    expect(verified.uid).toBe(created.uid);
  });
});
