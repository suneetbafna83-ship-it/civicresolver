import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  getRedirectResult,
  onAuthStateChanged,
  signInAnonymously,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  signOut as firebaseSignOut,
  updateProfile,
  type Auth,
  type AuthProvider,
  type Unsubscribe,
  type UserCredential,
} from 'firebase/auth';
import { z } from 'zod';
import type {
  AuthProviderKind,
  CivicSession,
  Department,
} from '../../../shared/types/civic.js';
import { DepartmentSchema, safeCivicText } from '../../../shared/schemas/triage.js';
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
  findRosterOfficerByEmail,
  verifyRosterOfficerPasskey,
} from './departmentRoster.js';

export const PREVIEW_ADMIN_STORAGE_KEY = 'civicresolve.previewAdmin.v1';
export const PREVIEW_ADMIN_DEPT_STORAGE_KEY = 'civicresolve.previewAdminDept.v1';
export const LOCAL_GUEST_STORAGE_KEY = 'civicresolve.localGuest.v1';

export type AuthServiceErrorCode =
  | 'FIREBASE_NOT_CONFIGURED'
  | 'POPUP_CLOSED'
  | 'UNAUTHORIZED_DOMAIN'
  | 'INVALID_CREDENTIALS'
  | 'EMAIL_IN_USE'
  | 'WEAK_PASSWORD'
  | 'NETWORK_ERROR'
  | 'INVALID_INPUT'
  | 'FORBIDDEN'
  | 'AUTH_ERROR';

export class AuthServiceError extends Error {
  public readonly code: AuthServiceErrorCode;
  public override readonly cause?: unknown;

  public constructor(
    code: AuthServiceErrorCode,
    message: string,
    cause?: unknown,
  ) {
    super(message);
    this.name = 'AuthServiceError';
    this.code = code;
    if (cause !== undefined) {
      this.cause = cause;
    }
  }
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface AuthUserLike {
  readonly uid: string;
  readonly displayName: string | null;
  readonly email: string | null;
  readonly isAnonymous: boolean;
  readonly providerData?: ReadonlyArray<{ readonly providerId?: string | null }>;
  getIdToken(forceRefresh?: boolean): Promise<string>;
  getIdTokenResult?(
    forceRefresh?: boolean,
  ): Promise<{ readonly claims: Record<string, unknown> }>;
}

export interface AuthLike {
  readonly currentUser: AuthUserLike | null;
}

export interface FirebaseAuthFns {
  createGoogleProvider(): AuthProvider;
  signInWithPopup(
    auth: AuthLike,
    provider: AuthProvider,
  ): Promise<{ readonly user: AuthUserLike }>;
  signInWithRedirect(auth: AuthLike, provider: AuthProvider): Promise<void>;
  getRedirectResult(
    auth: AuthLike,
  ): Promise<{ readonly user: AuthUserLike } | null>;
  signInWithEmailAndPassword(
    auth: AuthLike,
    email: string,
    password: string,
  ): Promise<{ readonly user: AuthUserLike }>;
  createUserWithEmailAndPassword(
    auth: AuthLike,
    email: string,
    password: string,
  ): Promise<{ readonly user: AuthUserLike }>;
  updateProfile(
    user: AuthUserLike,
    profile: { readonly displayName?: string | null },
  ): Promise<void>;
  signInAnonymously(auth: AuthLike): Promise<{ readonly user: AuthUserLike }>;
  signOut(auth: AuthLike): Promise<void>;
  onAuthStateChanged(
    auth: AuthLike,
    callback: (user: AuthUserLike | null) => void,
  ): Unsubscribe;
}

export interface AuthServiceDeps {
  readonly isFirebaseConfigured?: () => boolean;
  readonly getAuthInstance?: () => AuthLike | null;
  readonly checkVerifiedAdmin?: (
    uid: string,
    tokenClaims?: Record<string, unknown>,
  ) => Promise<boolean>;
  readonly resolveAdminDepartment?: (
    uid: string,
    tokenClaims?: Record<string, unknown>,
  ) => Promise<Department | null>;
  readonly sessionStorage?: StorageLike;
  readonly firebaseAuthFns?: FirebaseAuthFns;
  readonly idGenerator?: () => string;
}

export type AuthStateListener = (session: CivicSession | null) => void;

export interface AuthService {
  signInWithGoogle(): Promise<CivicSession | null>;
  completeGoogleRedirect(): Promise<CivicSession | null>;
  signInWithEmail(email: string, password: string): Promise<CivicSession>;
  signInDepartmentOfficer(
    email: string,
    password: string,
    expectedDepartment?: Department | null,
  ): Promise<CivicSession>;
  signUpWithEmail(
    email: string,
    password: string,
    displayName?: string,
  ): Promise<CivicSession>;
  signInAsGuest(): Promise<CivicSession>;
  enterPreviewAdminMode(department?: Department | null): Promise<CivicSession>;
  signOut(): Promise<void>;
  getCurrentSession(): Promise<CivicSession | null>;
  onAuthStateChange(listener: AuthStateListener): Unsubscribe;
}

const EmailSchema = z.string().trim().email('Please enter a valid email address');
const DisplayNameSchema = safeCivicText({
  min: 1,
  max: 50,
  fieldName: 'displayName',
});
const LocalGuestPayloadSchema = z.object({
  uid: z.string().min(1).max(128),
  displayName: z.string().min(1).max(50),
});

export function createInMemoryAuthStorage(): StorageLike {
  const store = new Map<string, string>();
  return {
    getItem(key: string): string | null {
      return store.get(key) ?? null;
    },
    setItem(key: string, value: string): void {
      store.set(key, value);
    },
    removeItem(key: string): void {
      store.delete(key);
    },
  };
}

export function resolveSessionStorage(): StorageLike {
  // Node 26 emits ExperimentalWarning if bare sessionStorage is evaluated; guard via window first.
  if (typeof window !== 'undefined' && 'sessionStorage' in window) {
    try {
      const storage = window.sessionStorage;
      if (storage !== undefined && storage !== null) {
        return storage;
      }
    } catch {
      // Sandboxed iframe or storage disabled; fall back to in-memory Map.
    }
  }
  return createInMemoryAuthStorage();
}

const defaultFirebaseAuthFns: FirebaseAuthFns = {
  createGoogleProvider(): AuthProvider {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    return provider;
  },
  async signInWithPopup(
    auth: AuthLike,
    provider: AuthProvider,
  ): Promise<UserCredential> {
    return signInWithPopup(auth as Auth, provider);
  },
  async signInWithRedirect(
    auth: AuthLike,
    provider: AuthProvider,
  ): Promise<void> {
    await signInWithRedirect(auth as Auth, provider);
  },
  async getRedirectResult(auth: AuthLike): Promise<UserCredential | null> {
    return getRedirectResult(auth as Auth);
  },
  async signInWithEmailAndPassword(
    auth: AuthLike,
    email: string,
    password: string,
  ): Promise<UserCredential> {
    return signInWithEmailAndPassword(auth as Auth, email, password);
  },
  async createUserWithEmailAndPassword(
    auth: AuthLike,
    email: string,
    password: string,
  ): Promise<UserCredential> {
    return createUserWithEmailAndPassword(auth as Auth, email, password);
  },
  async updateProfile(
    user: AuthUserLike,
    profile: { readonly displayName?: string | null },
  ): Promise<void> {
    await updateProfile(user as Parameters<typeof updateProfile>[0], profile);
  },
  async signInAnonymously(auth: AuthLike): Promise<UserCredential> {
    return signInAnonymously(auth as Auth);
  },
  async signOut(auth: AuthLike): Promise<void> {
    await firebaseSignOut(auth as Auth);
  },
  onAuthStateChanged(
    auth: AuthLike,
    callback: (user: AuthUserLike | null) => void,
  ): Unsubscribe {
    return onAuthStateChanged(auth as Auth, callback);
  },
};

async function defaultCheckVerifiedAdmin(
  uid: string,
  tokenClaims?: Record<string, unknown>,
): Promise<boolean> {
  if (tokenClaims !== undefined && tokenClaims.admin === true) {
    return true;
  }
  const db = getFirebaseDb();
  if (db === null) {
    return false;
  }
  return isVerifiedAdminUid(uid, db);
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

function defaultGuestIdGenerator(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `guest_${crypto.randomUUID()}`;
  }
  return `guest_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function readFirebaseErrorCode(error: unknown): string {
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof (error as { code?: unknown }).code === 'string'
  ) {
    return (error as { code: string }).code.trim().toLowerCase();
  }
  return '';
}

function mapFirebaseAuthError(error: unknown): AuthServiceError {
  if (error instanceof AuthServiceError) {
    return error;
  }
  const code = readFirebaseErrorCode(error);
  switch (code) {
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
      return new AuthServiceError(
        'POPUP_CLOSED',
        'Sign-in popup was closed before completing authentication.',
        error,
      );
    case 'auth/unauthorized-domain':
      return new AuthServiceError(
        'UNAUTHORIZED_DOMAIN',
        'Domain is not authorized for Google Sign-In. Add your hostname (e.g. "localhost", without http:// or port) to Firebase Console > Authentication > Settings > Authorized domains.',
        error,
      );
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
    case 'auth/invalid-email':
      return new AuthServiceError(
        'INVALID_CREDENTIALS',
        'Invalid email or password.',
        error,
      );
    case 'auth/email-already-in-use':
      return new AuthServiceError(
        'EMAIL_IN_USE',
        'An account with this email address already exists.',
        error,
      );
    case 'auth/weak-password':
      return new AuthServiceError(
        'WEAK_PASSWORD',
        'Password must be at least 6 characters long.',
        error,
      );
    case 'auth/network-request-failed':
      return new AuthServiceError(
        'NETWORK_ERROR',
        'Network error during authentication. Please check your connection and retry.',
        error,
      );
    default:
      return new AuthServiceError(
        'AUTH_ERROR',
        error instanceof Error ? error.message : 'Authentication request failed.',
        error,
      );
  }
}

function isGuestFallbackError(error: unknown): boolean {
  const code = readFirebaseErrorCode(error);
  return (
    code === 'auth/network-request-failed' ||
    code === 'auth/operation-not-allowed' ||
    code === 'auth/admin-restricted-operation' ||
    code === 'auth/invalid-api-key' ||
    code === 'auth/internal-error' ||
    code === 'auth/configuration-not-found'
  );
}

function inferProviderKind(user: AuthUserLike): AuthProviderKind {
  if (user.isAnonymous) {
    return 'anonymous';
  }
  const firstProvider = user.providerData?.[0]?.providerId;
  if (firstProvider === 'google.com') {
    return 'google';
  }
  return 'password';
}

function buildPreviewAdminSession(
  department: Department | null = null,
  customDisplayName?: string,
): CivicSession {
  const defaultName =
    department !== null
      ? `${department} Staff (Demo)`
      : 'City Ops Super Admin (Demo)';
  return {
    uid: 'preview-admin',
    displayName: customDisplayName ?? defaultName,
    email: null,
    role: 'admin',
    assignedDepartment: department,
    provider: 'preview-admin',
    isAnonymous: false,
    isPreviewAdmin: true,
    isVerifiedFirebaseAdmin: false,
    getIdToken: async () => null,
  };
}

function buildLocalGuestSession(uid: string, displayName: string): CivicSession {
  return {
    uid,
    displayName,
    email: null,
    role: 'citizen',
    assignedDepartment: null,
    provider: 'local-guest',
    isAnonymous: true,
    isPreviewAdmin: false,
    isVerifiedFirebaseAdmin: false,
    getIdToken: async () => null,
  };
}

export function createAuthService(deps?: AuthServiceDeps): AuthService {
  const isConfiguredFn = deps?.isFirebaseConfigured ?? isFirebaseConfigured;
  const getAuthInstanceFn = deps?.getAuthInstance ?? getFirebaseAuth;
  const checkVerifiedAdminFn =
    deps?.checkVerifiedAdmin ?? defaultCheckVerifiedAdmin;
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

  function clearLocalSessionFlags(): void {
    try {
      storage.removeItem(PREVIEW_ADMIN_STORAGE_KEY);
      storage.removeItem(PREVIEW_ADMIN_DEPT_STORAGE_KEY);
      storage.removeItem(LOCAL_GUEST_STORAGE_KEY);
    } catch {
      // Ignore storage access errors
    }
  }

  function readPreviewAdminActive(): boolean {
    try {
      return storage.getItem(PREVIEW_ADMIN_STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  }

  function readPreviewAdminDepartment(): Department | null {
    try {
      const raw = storage.getItem(PREVIEW_ADMIN_DEPT_STORAGE_KEY);
      if (raw === null) {
        return null;
      }
      const parsed = DepartmentSchema.safeParse(raw);
      return parsed.success ? parsed.data : null;
    } catch {
      return null;
    }
  }

  function readLocalGuestSession(): CivicSession | null {
    try {
      const raw = storage.getItem(LOCAL_GUEST_STORAGE_KEY);
      if (raw === null) {
        return null;
      }
      const parsedJson: unknown = JSON.parse(raw);
      const parsed = LocalGuestPayloadSchema.safeParse(parsedJson);
      if (!parsed.success) {
        return null;
      }
      return buildLocalGuestSession(parsed.data.uid, parsed.data.displayName);
    } catch {
      return null;
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
        const result = await user.getIdTokenResult();
        tokenClaims = result.claims;
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
    const defaultName = user.isAnonymous
      ? 'Guest Citizen'
      : user.email?.split('@')[0] || 'Civic Citizen';
    const resolvedDisplayName =
      overrideDisplayName ??
      (user.displayName !== null && user.displayName.trim().length > 0
        ? user.displayName.trim().slice(0, 50)
        : defaultName.slice(0, 50));

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
      getIdToken: async () => {
        try {
          return await user.getIdToken();
        } catch {
          return null;
        }
      },
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
    if (readPreviewAdminActive()) {
      return buildPreviewAdminSession(readPreviewAdminDepartment());
    }
    const client = isConfiguredFn() ? getAuthInstanceFn() : null;
    if (client?.currentUser !== null && client?.currentUser !== undefined) {
      return mapFirebaseUserToSession(client.currentUser);
    }
    return readLocalGuestSession();
  }

  return {
    async signInWithGoogle(): Promise<CivicSession | null> {
      const client = requireConfiguredAuth();
      const provider = fns.createGoogleProvider();
      try {
        const cred = await fns.signInWithPopup(client, provider);
        clearLocalSessionFlags();
        const session = await mapFirebaseUserToSession(cred.user, 'google');
        notifyListeners(session);
        return session;
      } catch (error) {
        if (readFirebaseErrorCode(error) === 'auth/popup-blocked') {
          await fns.signInWithRedirect(client, provider);
          return null;
        }
        throw mapFirebaseAuthError(error);
      }
    },

    async completeGoogleRedirect(): Promise<CivicSession | null> {
      if (!isConfiguredFn()) {
        return null;
      }
      const client = getAuthInstanceFn();
      if (client === null) {
        return null;
      }
      try {
        const result = await fns.getRedirectResult(client);
        if (result === null) {
          return null;
        }
        clearLocalSessionFlags();
        const session = await mapFirebaseUserToSession(result.user, 'google');
        notifyListeners(session);
        return session;
      } catch (error) {
        throw mapFirebaseAuthError(error);
      }
    },

    async signInWithEmail(
      email: string,
      password: string,
    ): Promise<CivicSession> {
      const emailParsed = EmailSchema.safeParse(email);
      if (!emailParsed.success) {
        throw new AuthServiceError(
          'INVALID_INPUT',
          emailParsed.error.issues[0]?.message ?? 'Invalid email address',
        );
      }
      if (password.length === 0) {
        throw new AuthServiceError('INVALID_INPUT', 'Password is required');
      }

      const client = requireConfiguredAuth();
      try {
        const cred = await fns.signInWithEmailAndPassword(
          client,
          emailParsed.data,
          password,
        );
        clearLocalSessionFlags();
        const session = await mapFirebaseUserToSession(cred.user, 'password');
        notifyListeners(session);
        return session;
      } catch (error) {
        throw mapFirebaseAuthError(error);
      }
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

      // 1. Check PBKDF2-HMAC-SHA256 verified municipal department officer roster
      const rosterOfficer = findRosterOfficerByEmail(emailParsed.data);
      if (rosterOfficer !== null) {
        const validPasskey = await verifyRosterOfficerPasskey(
          rosterOfficer,
          password,
        );
        if (!validPasskey) {
          throw new AuthServiceError(
            'INVALID_CREDENTIALS',
            'Invalid department passkey. Verify your department officer credentials.',
          );
        }

        const assignedDept = rosterOfficer.department;
        if (expectedDepartment === null && assignedDept !== null) {
          throw new AuthServiceError(
            'FORBIDDEN',
            `Access denied: ${rosterOfficer.displayName} is restricted to ${assignedDept} and cannot open City-Wide Admin.`,
          );
        }
        if (
          expectedDepartment !== undefined &&
          expectedDepartment !== null &&
          assignedDept !== null &&
          assignedDept !== expectedDepartment
        ) {
          throw new AuthServiceError(
            'FORBIDDEN',
            `Access denied: officer is authorized only for ${assignedDept}, not ${expectedDepartment}.`,
          );
        }

        const effectiveDepartment =
          assignedDept !== null ? assignedDept : (expectedDepartment ?? null);
        try {
          storage.removeItem(LOCAL_GUEST_STORAGE_KEY);
          storage.setItem(PREVIEW_ADMIN_STORAGE_KEY, 'true');
          if (effectiveDepartment !== null) {
            storage.setItem(PREVIEW_ADMIN_DEPT_STORAGE_KEY, effectiveDepartment);
          } else {
            storage.removeItem(PREVIEW_ADMIN_DEPT_STORAGE_KEY);
          }
        } catch {
          // Ignore storage errors
        }

        const officerSession: CivicSession = {
          ...buildPreviewAdminSession(
            effectiveDepartment,
            `${rosterOfficer.displayName} (${rosterOfficer.wardZone})`,
          ),
          email: rosterOfficer.email,
        };
        notifyListeners(officerSession);
        return officerSession;
      }

      // 2. Fallback to Firebase Auth + Firestore admins/{uid} verified clearance
      const client = requireConfiguredAuth();
      let cred: { readonly user: AuthUserLike };
      try {
        cred = await fns.signInWithEmailAndPassword(
          client,
          emailParsed.data,
          password,
        );
      } catch (error) {
        throw mapFirebaseAuthError(error);
      }

      clearLocalSessionFlags();
      const mapped = await mapFirebaseUserToSession(cred.user, 'password');
      if (mapped.role !== 'admin' || !mapped.isVerifiedFirebaseAdmin) {
        await fns.signOut(client).catch(() => undefined);
        throw new AuthServiceError(
          'FORBIDDEN',
          'Access denied: account lacks verified municipal staff clearance in admins/{uid}.',
        );
      }

      const assignedDept = mapped.assignedDepartment ?? null;
      if (expectedDepartment === null && assignedDept !== null) {
        await fns.signOut(client).catch(() => undefined);
        throw new AuthServiceError(
          'FORBIDDEN',
          `Access denied: your account is restricted to ${assignedDept} and cannot open City-Wide Admin.`,
        );
      }
      if (
        expectedDepartment !== undefined &&
        expectedDepartment !== null &&
        assignedDept !== null &&
        assignedDept !== expectedDepartment
      ) {
        await fns.signOut(client).catch(() => undefined);
        throw new AuthServiceError(
          'FORBIDDEN',
          `Access denied: officer is authorized only for ${assignedDept}, not ${expectedDepartment}.`,
        );
      }

      const effectiveDepartment =
        assignedDept !== null ? assignedDept : (expectedDepartment ?? null);
      const scopedSession: CivicSession = {
        ...mapped,
        assignedDepartment: effectiveDepartment,
      };
      notifyListeners(scopedSession);
      return scopedSession;
    },

    async signUpWithEmail(
      email: string,
      password: string,
      displayName?: string,
    ): Promise<CivicSession> {
      const emailParsed = EmailSchema.safeParse(email);
      if (!emailParsed.success) {
        throw new AuthServiceError(
          'INVALID_INPUT',
          emailParsed.error.issues[0]?.message ?? 'Invalid email address',
        );
      }
      if (password.length < 6) {
        throw new AuthServiceError(
          'WEAK_PASSWORD',
          'Password must be at least 6 characters long',
        );
      }

      let cleanDisplayName: string | undefined;
      if (displayName !== undefined) {
        const nameParsed = DisplayNameSchema.safeParse(displayName);
        if (!nameParsed.success) {
          throw new AuthServiceError(
            'INVALID_INPUT',
            nameParsed.error.issues[0]?.message ?? 'Invalid display name',
          );
        }
        cleanDisplayName = nameParsed.data;
      }

      const client = requireConfiguredAuth();
      try {
        const cred = await fns.createUserWithEmailAndPassword(
          client,
          emailParsed.data,
          password,
        );
        if (cleanDisplayName !== undefined) {
          await fns.updateProfile(cred.user, { displayName: cleanDisplayName });
        }
        clearLocalSessionFlags();
        const session = await mapFirebaseUserToSession(
          cred.user,
          'password',
          cleanDisplayName,
        );
        notifyListeners(session);
        return session;
      } catch (error) {
        throw mapFirebaseAuthError(error);
      }
    },

    async signInAsGuest(): Promise<CivicSession> {
      const client = isConfiguredFn() ? getAuthInstanceFn() : null;
      if (client !== null) {
        try {
          const cred = await fns.signInAnonymously(client);
          clearLocalSessionFlags();
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

      const existingGuest = readLocalGuestSession();
      const guestSession =
        existingGuest ?? buildLocalGuestSession(guestIdGenerator(), 'Guest Citizen');
      try {
        storage.removeItem(PREVIEW_ADMIN_STORAGE_KEY);
        storage.setItem(
          LOCAL_GUEST_STORAGE_KEY,
          JSON.stringify({
            uid: guestSession.uid,
            displayName: guestSession.displayName,
          }),
        );
      } catch {
        // Ignore storage errors
      }
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
      try {
        storage.removeItem(LOCAL_GUEST_STORAGE_KEY);
        storage.setItem(PREVIEW_ADMIN_STORAGE_KEY, 'true');
        if (validatedDept !== null) {
          storage.setItem(PREVIEW_ADMIN_DEPT_STORAGE_KEY, validatedDept);
        } else {
          storage.removeItem(PREVIEW_ADMIN_DEPT_STORAGE_KEY);
        }
      } catch {
        // Ignore storage errors
      }
      const session = buildPreviewAdminSession(validatedDept);
      notifyListeners(session);
      return session;
    },

    async signOut(): Promise<void> {
      clearLocalSessionFlags();
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
      let firebaseUnsub: Unsubscribe | null = null;
      if (client !== null) {
        firebaseUnsub = fns.onAuthStateChanged(client, (user) => {
          if (!active) {
            return;
          }
          if (user === null) {
            if (readPreviewAdminActive() || readLocalGuestSession() !== null) {
              return;
            }
            sessionEpoch += 1;
            listener(null);
            return;
          }
          if (readPreviewAdminActive()) {
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
      }

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
