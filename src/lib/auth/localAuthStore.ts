import { z } from 'zod';
import type { CivicSession, Department } from '../../../shared/types/civic.js';
import { DepartmentSchema } from '../../../shared/schemas/triage.js';
import { generateSecureId } from '../utils/secureId.js';
import {
  LOCAL_CITIZEN_ACCOUNTS_STORAGE_KEY,
  LOCAL_GUEST_STORAGE_KEY,
  PREVIEW_ADMIN_DEPT_STORAGE_KEY,
  PREVIEW_ADMIN_STORAGE_KEY,
  type StorageLike,
} from './authTypes.js';

const LocalGuestPayloadSchema = z.object({
  uid: z.string().min(1).max(128),
  displayName: z.string().min(1).max(50),
});

const StoredCitizenAccountSchema = z.object({
  uid: z.string().min(1).max(128),
  email: z.string().email(),
  displayName: z.string().min(1).max(50),
  passwordHash: z.string().min(1),
});

export interface StoredCitizenAccount {
  readonly uid: string;
  readonly email: string;
  readonly displayName: string;
  readonly passwordHash: string;
}

export function defaultGuestIdGenerator(): string {
  return generateSecureId('guest').replace(/^guest-/, 'guest_');
}

export function buildPreviewAdminSession(
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

export function buildLocalGuestSession(
  uid: string,
  displayName: string,
): CivicSession {
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

export function buildLocalCitizenAccountSession(
  uid: string,
  email: string,
  displayName: string,
  provider: 'password' | 'google' = 'password',
): CivicSession {
  return {
    uid,
    displayName,
    email,
    role: 'citizen',
    assignedDepartment: null,
    provider,
    isAnonymous: false,
    isPreviewAdmin: false,
    isVerifiedFirebaseAdmin: false,
    getIdToken: async () => null,
  };
}

export function clearLocalSessionFlags(storage: StorageLike): void {
  try {
    storage.removeItem(PREVIEW_ADMIN_STORAGE_KEY);
    storage.removeItem(PREVIEW_ADMIN_DEPT_STORAGE_KEY);
    storage.removeItem(LOCAL_GUEST_STORAGE_KEY);
  } catch {
    // Ignore storage access errors
  }
}

export function persistPreviewAdminFlags(
  storage: StorageLike,
  department: Department | null,
): void {
  try {
    storage.removeItem(LOCAL_GUEST_STORAGE_KEY);
    storage.setItem(PREVIEW_ADMIN_STORAGE_KEY, 'true');
    if (department !== null) {
      storage.setItem(PREVIEW_ADMIN_DEPT_STORAGE_KEY, department);
    } else {
      storage.removeItem(PREVIEW_ADMIN_DEPT_STORAGE_KEY);
    }
  } catch {
    // Ignore storage access errors
  }
}

export function persistLocalGuestFlags(
  storage: StorageLike,
  uid: string,
  displayName: string,
): void {
  try {
    storage.removeItem(PREVIEW_ADMIN_STORAGE_KEY);
    storage.setItem(
      LOCAL_GUEST_STORAGE_KEY,
      JSON.stringify({ uid, displayName }),
    );
  } catch {
    // Ignore storage access errors
  }
}

export function readPreviewAdminActive(storage: StorageLike): boolean {
  try {
    return storage.getItem(PREVIEW_ADMIN_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

export function readPreviewAdminDepartment(
  storage: StorageLike,
): Department | null {
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

export function readLocalGuestSession(
  storage: StorageLike,
): CivicSession | null {
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

export function loadStoredCitizenAccounts(
  storage: StorageLike,
): StoredCitizenAccount[] {
  try {
    const raw = storage.getItem(LOCAL_CITIZEN_ACCOUNTS_STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    const valid: StoredCitizenAccount[] = [];
    for (const item of parsed) {
      const checked = StoredCitizenAccountSchema.safeParse(item);
      if (checked.success) {
        valid.push(checked.data);
      }
    }
    return valid;
  } catch {
    return [];
  }
}

export function saveStoredCitizenAccount(
  storage: StorageLike,
  account: StoredCitizenAccount,
): void {
  try {
    const existing = loadStoredCitizenAccounts(storage).filter(
      (item) => item.email.toLowerCase() !== account.email.toLowerCase(),
    );
    storage.setItem(
      LOCAL_CITIZEN_ACCOUNTS_STORAGE_KEY,
      JSON.stringify([account, ...existing].slice(0, 50)),
    );
  } catch {
    // Ignore storage errors
  }
}
