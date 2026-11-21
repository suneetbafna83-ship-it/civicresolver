import type { Unsubscribe } from 'firebase/auth';
import type {
  AuthProviderKind,
  CivicSession,
  Department,
} from '../../../shared/types/civic.js';
import { DepartmentSchema } from '../../../shared/schemas/triage.js';
import {
  getFirebaseAuth,
  getFirebaseDb,
  isFirebaseConfigured,
} from '../firebase/config.js';
import {
  getVerifiedAdminProfile,
  isVerifiedAdminUid,
} from '../repositories/firestoreIssueRepository.js';
import {
  defaultFirebaseAuthFns,
  inferProviderKind,
  isGuestFallbackError,
  mapFirebaseAuthError,
  readFirebaseErrorCode,
} from './authErrorMapper.js';
import {
  AuthServiceError,
  LOCAL_CITIZEN_ACCOUNTS_STORAGE_KEY,
  LOCAL_GUEST_STORAGE_KEY,
  PREVIEW_ADMIN_DEPT_STORAGE_KEY,
  PREVIEW_ADMIN_STORAGE_KEY,
  createInMemoryAuthStorage,
  resolveSessionStorage,
  type AuthLike,
  type AuthService,
  type AuthServiceDeps,
  type AuthServiceErrorCode,
  type AuthStateListener,
  type AuthUserLike,
  type FirebaseAuthFns,
  type StorageLike,
} from './authTypes.js';
import {
  EmailSchema,
  executeEmailSignIn,
  executeEmailSignUp,
} from './emailAuthHandler.js';
import {
  buildLocalCitizenAccountSession,
  buildLocalGuestSession,
  buildPreviewAdminSession,
  clearLocalSessionFlags,
  defaultGuestIdGenerator,
  persistLocalGuestFlags,
  persistPreviewAdminFlags,
  readLocalGuestSession,
  readPreviewAdminActive,
  readPreviewAdminDepartment,
} from './localAuthStore.js';
import { authenticateDepartmentOfficer } from './officerAuthHandler.js';

export {
  AuthServiceError,
  LOCAL_CITIZEN_ACCOUNTS_STORAGE_KEY,
  LOCAL_GUEST_STORAGE_KEY,
  PREVIEW_ADMIN_DEPT_STORAGE_KEY,
  PREVIEW_ADMIN_STORAGE_KEY,
  createInMemoryAuthStorage,
  resolveSessionStorage,
  type AuthLike,
  type AuthService,
  type AuthServiceDeps,
  type AuthServiceErrorCode,
  type AuthStateListener,
  type AuthUserLike,
  type FirebaseAuthFns,
  type StorageLike,
};

async function defaultCheckVerifiedAdmin(
  uid: string,
  tokenClaims?: Record<string, unknown>,
): Promise<boolean> {
  if (tokenClaims !== undefined && tokenClaims.admin === true) {
    return true;
  }
  const db = getFirebaseDb();
  return db === null ? false : isVerifiedAdminUid(uid, db);
}

async function defaultResolveAdminDepartment(
  uid: string,
  tokenClaims?: Record<string, unknown>,
): Promise<Department | null> {
  if (tokenClaims !== undefined && typeof tokenClaims.department === 'string') {
    const parsedClaim = DepartmentSchema.safeParse(tokenClaims.department);
    if (parsedClaim.success) {
      return parsedClaim.data;
    }
  }
  const db = getFirebaseDb();
  if (db === null) {
    return null;
  }
  const profile = await getVerifiedAdminProfile(uid, db);
  return profile.isAdmin ? profile.department : null;
}

export function createAuthService(deps?: AuthServiceDeps): AuthService {
  const isConfiguredFn = deps?.isFirebaseConfigured ?? isFirebaseConfigured;
  const getAuthInstanceFn = deps?.getAuthInstance ?? getFirebaseAuth;
  const checkVerifiedAdminFn = deps?.checkVerifiedAdmin ?? defaultCheckVerifiedAdmin;
  const resolveAdminDepartmentFn =
    deps?.resolveAdminDepartment ?? defaultResolveAdminDepartment;
  const storage = deps?.sessionStorage ?? resolveSessionStorage();
  const fns = deps?.firebaseAuthFns ?? defaultFirebaseAuthFns;
  const guestIdGenerator = deps?.idGenerator ?? defaultGuestIdGenerator;

  const listeners = new Set<AuthStateListener>();
  let sessionEpoch = 0;

  function notifyListeners(session: CivicSession | null): void {
    sessionEpoch += 1;
    for (const listener of listeners) {
      listener(session);
    }
  }

  async function mapFirebaseUserToSession(
    user: AuthUserLike,
    overrideProvider?: AuthProviderKind,
    overrideDisplayName?: string,
  ): Promise<CivicSession> {
    let tokenClaims: Record<string, unknown> | undefined;
    if (typeof user.getIdTokenResult === 'function') {
      try {
        tokenClaims = (await user.getIdTokenResult()).claims;
      } catch {
        tokenClaims = undefined;
      }
    }

    const isVerifiedFirebaseAdmin = user.isAnonymous
      ? false
      : await checkVerifiedAdminFn(user.uid, tokenClaims);
    const assignedDepartment = isVerifiedFirebaseAdmin
      ? await resolveAdminDepartmentFn(user.uid, tokenClaims)
      : null;

    const provider = overrideProvider ?? inferProviderKind(user);
    const fallbackName = user.isAnonymous
      ? 'Guest Citizen'
      : user.email?.split('@')[0] || 'Civic Citizen';
    const resolvedDisplayName =
      overrideDisplayName ??
      (user.displayName !== null && user.displayName.trim().length > 0
        ? user.displayName.trim().slice(0, 50)
        : fallbackName.slice(0, 50));

    return {
      uid: user.uid,
      displayName: resolvedDisplayName,
      email: user.email ?? null,
      role: isVerifiedFirebaseAdmin ? 'admin' : 'citizen',
      assignedDepartment,
      provider,
      isAnonymous: user.isAnonymous,
      isPreviewAdmin: false,
      isVerifiedFirebaseAdmin,
      getIdToken: async () => user.getIdToken().catch(() => null),
    };
  }

  function requireConfiguredAuth(): AuthLike {
    if (!isConfiguredFn()) {
      throw new AuthServiceError(
        'FIREBASE_NOT_CONFIGURED',
        'Firebase Authentication is not configured. Use Guest Citizen or Preview Admin mode, or set VITE_FIREBASE_* environment variables.',
      );
    }
    const client = getAuthInstanceFn();
    if (client === null) {
      throw new AuthServiceError(
        'FIREBASE_NOT_CONFIGURED',
        'Firebase Auth instance could not be initialized.',
      );
    }
    return client;
  }

  async function getCurrentSession(): Promise<CivicSession | null> {
    if (readPreviewAdminActive(storage)) {
      return buildPreviewAdminSession(readPreviewAdminDepartment(storage));
    }
    const client = isConfiguredFn() ? getAuthInstanceFn() : null;
    if (client?.currentUser !== null && client?.currentUser !== undefined) {
      return mapFirebaseUserToSession(client.currentUser);
    }
    return readLocalGuestSession(storage);
  }

  return {
    async signInWithGoogle(): Promise<CivicSession | null> {
      const client = isConfiguredFn() ? getAuthInstanceFn() : null;
      if (client !== null) {
        const provider = fns.createGoogleProvider();
        try {
          const cred = await fns.signInWithPopup(client, provider);
          clearLocalSessionFlags(storage);
          const session = await mapFirebaseUserToSession(cred.user, 'google');
          notifyListeners(session);
          return session;
        } catch (error) {
          if (readFirebaseErrorCode(error) === 'auth/popup-blocked') {
            await fns.signInWithRedirect(client, provider);
            return null;
          }
          if (!isGuestFallbackError(error)) {
            throw mapFirebaseAuthError(error);
          }
        }
      }

      const uid = guestIdGenerator().replace(/^guest_/, 'google_citizen_');
      clearLocalSessionFlags(storage);
      const fallback = buildLocalCitizenAccountSession(
        uid,
        'citizen.google@civicresolve.org',
        'Google Citizen',
        'google',
      );
      persistLocalGuestFlags(storage, fallback.uid, fallback.displayName);
      notifyListeners(fallback);
      return fallback;
    },

    async completeGoogleRedirect(): Promise<CivicSession | null> {
      const client = isConfiguredFn() ? getAuthInstanceFn() : null;
      if (client === null) {
        return null;
      }
      try {
        const result = await fns.getRedirectResult(client);
        if (result === null) {
          return null;
        }
        clearLocalSessionFlags(storage);
        const session = await mapFirebaseUserToSession(result.user, 'google');
        notifyListeners(session);
        return session;
      } catch (error) {
        throw mapFirebaseAuthError(error);
      }
    },

    async signInWithEmail(email: string, password: string): Promise<CivicSession> {
      const session = await executeEmailSignIn(
        {
          client: isConfiguredFn() ? getAuthInstanceFn() : null,
          storage,
          fns,
          guestIdGenerator,
          mapFirebaseUserToSession,
        },
        email,
        password,
      );
      notifyListeners(session);
      return session;
    },

    async signInDepartmentOfficer(
      email: string,
      password: string,
      expectedDepartment?: Department | null,
    ): Promise<CivicSession> {
      const emailParsed = EmailSchema.safeParse(email);
      if (!emailParsed.success) {
        throw new AuthServiceError(
          'INVALID_INPUT',
          emailParsed.error.issues[0]?.message ?? 'Invalid officer email address',
        );
      }
      if (password.length === 0) {
        throw new AuthServiceError('INVALID_INPUT', 'Officer passcode is required');
      }
      const session = await authenticateDepartmentOfficer({
        email: emailParsed.data,
        password,
        expectedDepartment,
        storage,
        fns,
        requireConfiguredAuth,
        mapFirebaseUserToSession,
      });
      notifyListeners(session);
      return session;
    },

    async signUpWithEmail(
      email: string,
      password: string,
      displayName?: string,
    ): Promise<CivicSession> {
      const session = await executeEmailSignUp(
        {
          client: isConfiguredFn() ? getAuthInstanceFn() : null,
          storage,
          fns,
          guestIdGenerator,
          mapFirebaseUserToSession,
        },
        email,
        password,
        displayName,
      );
      notifyListeners(session);
      return session;
    },

    async signInAsGuest(): Promise<CivicSession> {
      const client = isConfiguredFn() ? getAuthInstanceFn() : null;
      if (client !== null) {
        try {
          const cred = await fns.signInAnonymously(client);
          clearLocalSessionFlags(storage);
          const session = await mapFirebaseUserToSession(
            cred.user,
            'anonymous',
            'Guest Citizen',
          );
          notifyListeners(session);
          return session;
        } catch (error) {
          if (!isGuestFallbackError(error)) {
            throw mapFirebaseAuthError(error);
          }
        }
      }

      const existingGuest = readLocalGuestSession(storage);
      const guestSession =
        existingGuest ?? buildLocalGuestSession(guestIdGenerator(), 'Guest Citizen');
      persistLocalGuestFlags(storage, guestSession.uid, guestSession.displayName);
      notifyListeners(guestSession);
      return guestSession;
    },

    async enterPreviewAdminMode(
      department?: Department | null,
    ): Promise<CivicSession> {
      let validatedDept: Department | null = null;
      if (department !== undefined && department !== null) {
        const parsedDept = DepartmentSchema.safeParse(department);
        if (!parsedDept.success) {
          throw new AuthServiceError(
            'INVALID_INPUT',
            `Invalid department "${department}" for admin preview scope.`,
          );
        }
        validatedDept = parsedDept.data;
      }
      persistPreviewAdminFlags(storage, validatedDept);
      const session = buildPreviewAdminSession(validatedDept);
      notifyListeners(session);
      return session;
    },

    async signOut(): Promise<void> {
      clearLocalSessionFlags(storage);
      const client = isConfiguredFn() ? getAuthInstanceFn() : null;
      if (client?.currentUser !== null && client?.currentUser !== undefined) {
        try {
          await fns.signOut(client);
        } catch (error) {
          throw mapFirebaseAuthError(error);
        }
      }
      notifyListeners(null);
    },

    getCurrentSession,

    onAuthStateChange(listener: AuthStateListener): Unsubscribe {
      listeners.add(listener);
      let active = true;
      const initialEpoch = sessionEpoch;

      void getCurrentSession().then((session) => {
        if (active && initialEpoch === sessionEpoch) {
          listener(session);
        }
      });

      const client = isConfiguredFn() ? getAuthInstanceFn() : null;
      const firebaseUnsub =
        client === null
          ? null
          : fns.onAuthStateChanged(client, (user) => {
              if (!active || readPreviewAdminActive(storage)) {
                return;
              }
              if (user === null) {
                if (readLocalGuestSession(storage) !== null) {
                  return;
                }
                sessionEpoch += 1;
                listener(null);
                return;
              }
              sessionEpoch += 1;
              const callbackEpoch = sessionEpoch;
              void mapFirebaseUserToSession(user).then((session) => {
                if (active && callbackEpoch === sessionEpoch) {
                  listener(session);
                }
              });
            });

      return () => {
        active = false;
        listeners.delete(listener);
        firebaseUnsub?.();
      };
    },
  };
}

export const authService = createAuthService();

export const signInWithGoogle = (): Promise<CivicSession | null> =>
  authService.signInWithGoogle();
export const completeGoogleRedirect = (): Promise<CivicSession | null> =>
  authService.completeGoogleRedirect();
export const signInWithEmail = (
  email: string,
  password: string,
): Promise<CivicSession> => authService.signInWithEmail(email, password);
export const signInDepartmentOfficer = (
  email: string,
  password: string,
  expectedDepartment?: Department | null,
): Promise<CivicSession> =>
  authService.signInDepartmentOfficer(email, password, expectedDepartment);
export const signUpWithEmail = (
  email: string,
  password: string,
  displayName?: string,
): Promise<CivicSession> =>
  authService.signUpWithEmail(email, password, displayName);
export const signInAsGuest = (): Promise<CivicSession> =>
  authService.signInAsGuest();
export const enterPreviewAdminMode = (
  department?: Department | null,
): Promise<CivicSession> => authService.enterPreviewAdminMode(department);
export const signOut = (): Promise<void> => authService.signOut();
export const getCurrentSession = (): Promise<CivicSession | null> =>
  authService.getCurrentSession();
export const onAuthStateChange = (listener: AuthStateListener): Unsubscribe =>
  authService.onAuthStateChange(listener);
