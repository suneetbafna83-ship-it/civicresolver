import type { CivicSession, Department } from '../../../shared/types/civic.js';
import {
  findRosterOfficerByEmail,
  verifyRosterOfficerPasskey,
} from './departmentRoster.js';
import { mapFirebaseAuthError } from './authErrorMapper.js';
import {
  AuthServiceError,
  type AuthLike,
  type AuthUserLike,
  type FirebaseAuthFns,
  type StorageLike,
} from './authTypes.js';
import {
  buildPreviewAdminSession,
  clearLocalSessionFlags,
  persistPreviewAdminFlags,
} from './localAuthStore.js';

export interface OfficerAuthContext {
  readonly email: string;
  readonly password: string;
  readonly expectedDepartment?: Department | null;
  readonly storage: StorageLike;
  readonly fns: FirebaseAuthFns;
  readonly requireConfiguredAuth: () => AuthLike;
  readonly mapFirebaseUserToSession: (
    user: AuthUserLike,
    overrideProvider?: 'password',
  ) => Promise<CivicSession>;
}

function assertDepartmentClearance(
  assignedDept: Department | null,
  expectedDepartment: Department | null | undefined,
  actorLabel: string,
): Department | null {
  if (expectedDepartment === null && assignedDept !== null) {
    throw new AuthServiceError(
      'FORBIDDEN',
      `Access denied: ${actorLabel} is restricted to ${assignedDept} and cannot open City-Wide Admin.`,
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
  return assignedDept !== null ? assignedDept : (expectedDepartment ?? null);
}

export async function authenticateDepartmentOfficer(
  ctx: OfficerAuthContext,
): Promise<CivicSession> {
  // 1. Check PBKDF2-HMAC-SHA256 verified municipal department officer roster
  const rosterOfficer = findRosterOfficerByEmail(ctx.email);
  if (rosterOfficer !== null) {
    const validPasskey = await verifyRosterOfficerPasskey(
      rosterOfficer,
      ctx.password,
    );
    if (!validPasskey) {
      throw new AuthServiceError(
        'INVALID_CREDENTIALS',
        'Invalid department passkey. Verify your department officer credentials.',
      );
    }

    const effectiveDepartment = assertDepartmentClearance(
      rosterOfficer.department,
      ctx.expectedDepartment,
      rosterOfficer.displayName,
    );
    persistPreviewAdminFlags(ctx.storage, effectiveDepartment);

    return {
      ...buildPreviewAdminSession(
        effectiveDepartment,
        `${rosterOfficer.displayName} (${rosterOfficer.wardZone})`,
      ),
      email: rosterOfficer.email,
    };
  }

  // 2. Fallback to Firebase Auth + Firestore admins/{uid} verified clearance
  const client = ctx.requireConfiguredAuth();
  let cred: { readonly user: AuthUserLike };
  try {
    cred = await ctx.fns.signInWithEmailAndPassword(
      client,
      ctx.email,
      ctx.password,
    );
  } catch (error) {
    throw mapFirebaseAuthError(error);
  }

  clearLocalSessionFlags(ctx.storage);
  const mapped = await ctx.mapFirebaseUserToSession(cred.user, 'password');
  if (mapped.role !== 'admin' || !mapped.isVerifiedFirebaseAdmin) {
    await ctx.fns.signOut(client).catch(() => undefined);
    throw new AuthServiceError(
      'FORBIDDEN',
      'Access denied: account lacks verified municipal staff clearance in admins/{uid}.',
    );
  }

  try {
    const effectiveDepartment = assertDepartmentClearance(
      mapped.assignedDepartment ?? null,
      ctx.expectedDepartment,
      'your account',
    );
    return { ...mapped, assignedDepartment: effectiveDepartment };
  } catch (error) {
    await ctx.fns.signOut(client).catch(() => undefined);
    throw error;
  }
}
