import { describe, expect, it, vi } from 'vitest';
import type { AuthProvider } from 'firebase/auth';
import {
  LOCAL_GUEST_STORAGE_KEY,
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
    expect(await service.getCurrentSession()).toBeNull();
    expect(received.at(-1)).toBeNull();

    unsubscribe();
  });
});
