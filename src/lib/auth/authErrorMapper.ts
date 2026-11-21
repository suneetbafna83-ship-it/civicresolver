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
import type { AuthProviderKind } from '../../../shared/types/civic.js';
import {
  AuthServiceError,
  type AuthLike,
  type AuthUserLike,
  type FirebaseAuthFns,
} from './authTypes.js';

export const defaultFirebaseAuthFns: FirebaseAuthFns = {
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

export function readFirebaseErrorCode(error: unknown): string {
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

export function mapFirebaseAuthError(error: unknown): AuthServiceError {
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

export function isGuestFallbackError(error: unknown): boolean {
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

export function inferProviderKind(user: AuthUserLike): AuthProviderKind {
  if (user.isAnonymous) {
    return 'anonymous';
  }
  const firstProvider = user.providerData?.[0]?.providerId;
  if (firstProvider === 'google.com') {
    return 'google';
  }
  return 'password';
}
