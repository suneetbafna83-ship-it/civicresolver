import type { AuthProvider, Unsubscribe } from 'firebase/auth';
import type { CivicSession, Department } from '../../../shared/types/civic.js';

export const PREVIEW_ADMIN_STORAGE_KEY = 'civicresolve.previewAdmin.v1';
export const PREVIEW_ADMIN_DEPT_STORAGE_KEY = 'civicresolve.previewAdminDept.v1';
export const LOCAL_GUEST_STORAGE_KEY = 'civicresolve.localGuest.v1';
export const LOCAL_CITIZEN_ACCOUNTS_STORAGE_KEY =
  'civicresolve.citizenAccounts.v1';

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
