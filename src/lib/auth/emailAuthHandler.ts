import { z } from 'zod';
import type { AuthProviderKind, CivicSession } from '../../../shared/types/civic.js';
import { safeCivicText } from '../../../shared/schemas/triage.js';
import {
  isGuestFallbackError,
  mapFirebaseAuthError,
  readFirebaseErrorCode,
} from './authErrorMapper.js';
import {
  AuthServiceError,
  type AuthLike,
  type AuthUserLike,
  type FirebaseAuthFns,
  type StorageLike,
} from './authTypes.js';
import {
  buildLocalCitizenAccountSession,
  clearLocalSessionFlags,
  loadStoredCitizenAccounts,
  saveStoredCitizenAccount,
} from './localAuthStore.js';
import { hashPasswordPbkdf2, verifyPasswordPbkdf2 } from './passwordHasher.js';

export const EmailSchema = z
  .string()
  .trim()
  .email('Please enter a valid email address');

const DisplayNameSchema = safeCivicText({
  min: 1,
  max: 50,
  fieldName: 'displayName',
});

export interface EmailAuthContext {
  readonly client: AuthLike | null;
  readonly storage: StorageLike;
  readonly fns: FirebaseAuthFns;
  readonly guestIdGenerator: () => string;
  readonly mapFirebaseUserToSession: (
    user: AuthUserLike,
    overrideProvider?: AuthProviderKind,
    overrideDisplayName?: string,
  ) => Promise<CivicSession>;
}

function deriveCitizenName(email: string): string {
  return (
    email
      .split('@')[0]
      ?.replace(/[^a-zA-Z0-9 _.-]/g, ' ')
      .trim()
      .slice(0, 50) || 'Civic Citizen'
  );
}

async function authenticateLocalCitizen(
  ctx: EmailAuthContext,
  cleanEmail: string,
  password: string,
  displayName?: string,
  conflictCode: 'INVALID_CREDENTIALS' | 'EMAIL_IN_USE' = 'INVALID_CREDENTIALS',
): Promise<CivicSession> {
  const existing = loadStoredCitizenAccounts(ctx.storage).find(
    (acc) => acc.email.toLowerCase() === cleanEmail.toLowerCase(),
  );
  if (existing !== undefined) {
    const valid = await verifyPasswordPbkdf2(password, existing.passwordHash);
    if (!valid) {
      throw new AuthServiceError(
        conflictCode,
        conflictCode === 'EMAIL_IN_USE'
          ? 'An account with this email address already exists.'
          : 'Invalid email or password.',
      );
    }
    clearLocalSessionFlags(ctx.storage);
    return buildLocalCitizenAccountSession(
      existing.uid,
      existing.email,
      existing.displayName,
      'password',
    );
  }

  if (password.length < 4) {
    throw new AuthServiceError(
      'WEAK_PASSWORD',
      'Password must be at least 4 characters long.',
    );
  }
  const uid = ctx.guestIdGenerator().replace(/^guest_/, 'citizen_');
  const resolvedName = displayName ?? deriveCitizenName(cleanEmail);
  const passwordHash = await hashPasswordPbkdf2(password);
  saveStoredCitizenAccount(ctx.storage, {
    uid,
    email: cleanEmail,
    displayName: resolvedName,
    passwordHash,
  });
  clearLocalSessionFlags(ctx.storage);
  return buildLocalCitizenAccountSession(uid, cleanEmail, resolvedName, 'password');
}

export async function executeEmailSignIn(
  ctx: EmailAuthContext,
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

  const cleanEmail = emailParsed.data;
  const derivedName = deriveCitizenName(cleanEmail);
  if (ctx.client !== null) {
    try {
      const cred = await ctx.fns.signInWithEmailAndPassword(
        ctx.client,
        cleanEmail,
        password,
      );
      clearLocalSessionFlags(ctx.storage);
      return ctx.mapFirebaseUserToSession(cred.user, 'password');
    } catch (signInErr) {
      if (!isGuestFallbackError(signInErr)) {
        const code = readFirebaseErrorCode(signInErr);
        const mayAutoRegister =
          (code === 'auth/user-not-found' || code === 'auth/invalid-credential') &&
          password.length >= 6;
        if (!mayAutoRegister) {
          throw mapFirebaseAuthError(signInErr);
        }
        try {
          const created = await ctx.fns.createUserWithEmailAndPassword(
            ctx.client,
            cleanEmail,
            password,
          );
          await ctx.fns
            .updateProfile(created.user, { displayName: derivedName })
            .catch(() => undefined);
          clearLocalSessionFlags(ctx.storage);
          return ctx.mapFirebaseUserToSession(created.user, 'password', derivedName);
        } catch (createErr) {
          if (readFirebaseErrorCode(createErr) === 'auth/email-already-in-use') {
            throw new AuthServiceError(
              'INVALID_CREDENTIALS',
              'Invalid email or password.',
              createErr,
            );
          }
          if (!isGuestFallbackError(createErr)) {
            throw mapFirebaseAuthError(createErr);
          }
        }
      }
    }
  }

  return authenticateLocalCitizen(ctx, cleanEmail, password, derivedName);
}

export async function executeEmailSignUp(
  ctx: EmailAuthContext,
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

  const cleanEmail = emailParsed.data;
  if (ctx.client !== null) {
    try {
      const cred = await ctx.fns.createUserWithEmailAndPassword(
        ctx.client,
        cleanEmail,
        password,
      );
      if (cleanDisplayName !== undefined) {
        await ctx.fns.updateProfile(cred.user, { displayName: cleanDisplayName });
      }
      clearLocalSessionFlags(ctx.storage);
      return ctx.mapFirebaseUserToSession(cred.user, 'password', cleanDisplayName);
    } catch (createErr) {
      if (!isGuestFallbackError(createErr)) {
        if (readFirebaseErrorCode(createErr) === 'auth/email-already-in-use') {
          try {
            const existing = await ctx.fns.signInWithEmailAndPassword(
              ctx.client,
              cleanEmail,
              password,
            );
            clearLocalSessionFlags(ctx.storage);
            return ctx.mapFirebaseUserToSession(
              existing.user,
              'password',
              cleanDisplayName,
            );
          } catch {
            throw new AuthServiceError(
              'EMAIL_IN_USE',
              'An account with this email address already exists.',
              createErr,
            );
          }
        }
        throw mapFirebaseAuthError(createErr);
      }
    }
  }

  return authenticateLocalCitizen(
    ctx,
    cleanEmail,
    password,
    cleanDisplayName,
    'EMAIL_IN_USE',
  );
}
