import type { Department } from '../../../shared/types/civic.js';
import { verifyPasswordPbkdf2 } from './passwordHasher.js';

export type OfficerClearanceTier = 'dept_staff' | 'city_ops';

export interface DepartmentOfficerRecord {
  readonly email: string;
  readonly displayName: string;
  readonly department: Department | null;
  readonly tier: OfficerClearanceTier;
  readonly wardZone: string;
  readonly passkeyHash: string;
}

/**
 * Cryptographic PBKDF2-HMAC-SHA256 (100,000 iterations, 16-byte unique salts) roster
 * for verified municipal department staff and City Ops Super Admin.
 * Plaintext passkeys are never stored in client or server source code.
 */
export const DEPARTMENT_OFFICER_ROSTER: ReadonlyArray<DepartmentOfficerRecord> = [
  {
    email: 'water.staff@civicresolve.gov',
    displayName: 'Water & Sewage Officer',
    department: 'Water & Sewage',
    tier: 'dept_staff',
    wardZone: 'Zone W-1 · Ward 12',
    passkeyHash:
      'pbkdf2_sha256$100000$203c676a6cecf42c52b0085c8741cab2$1e685f81d5000d3568564887a385c463f7f0b57b531a4af083cec29f648220e6',
  },
  {
    email: 'roads.staff@civicresolve.gov',
    displayName: 'Roads & Infrastructure Officer',
    department: 'Roads & Infrastructure',
    tier: 'dept_staff',
    wardZone: 'Zone R-2 · Ward 04',
    passkeyHash:
      'pbkdf2_sha256$100000$3978cd1f5f6c5f76ea122d2b3c7d834d$c2d9f170ccd5c734379301c3f9e71cd91cc50afb1b52cc998e8d8e8c12fc1ea3',
  },
  {
    email: 'sanitation.staff@civicresolve.gov',
    displayName: 'Sanitation & Waste Officer',
    department: 'Sanitation & Waste',
    tier: 'dept_staff',
    wardZone: 'Zone S-1 · Ward 07',
    passkeyHash:
      'pbkdf2_sha256$100000$17a6f2997250d791aa44cc13a487a3fd$42aee2f3c46666e03c2f8a9f0dc2e1e41570031d2d98d6bd2aeb77fee7482032',
  },
  {
    email: 'electrical.staff@civicresolve.gov',
    displayName: 'Electrical & Streetlights Officer',
    department: 'Electrical & Streetlights',
    tier: 'dept_staff',
    wardZone: 'Zone E-3 · Ward 09',
    passkeyHash:
      'pbkdf2_sha256$100000$fe8401a1ba06ce6aae6ea4b44c33a44b$9c16daa6d669929387ddfa089377d8672cab8bc834d0a6a381051a88b76eb220',
  },
  {
    email: 'safety.staff@civicresolve.gov',
    displayName: 'Public Safety Officer',
    department: 'Public Safety',
    tier: 'dept_staff',
    wardZone: 'Zone P-1 · Ward 01',
    passkeyHash:
      'pbkdf2_sha256$100000$c6cc4fbda04c4bc6edf9507873db6d28$8aaa6bc8c0b2541fe515f4f39db73348a8049577ce2ec0786715e76c61787563',
  },
  {
    email: 'director@civicresolve.gov',
    displayName: 'City Ops Super Admin',
    department: null,
    tier: 'city_ops',
    wardZone: 'City-Wide · All Wards',
    passkeyHash:
      'pbkdf2_sha256$100000$7b625d4ba10b18ee4f858c01365f4a8e$af6663c8fc3af79acc8b20fb783fa3359db710f66c6a898e7cf1b831ccb60ef5',
  },
];

export function findRosterOfficerByEmail(
  email: string,
): DepartmentOfficerRecord | null {
  const normalized = email.trim().toLowerCase();
  return (
    DEPARTMENT_OFFICER_ROSTER.find(
      (officer) => officer.email.toLowerCase() === normalized,
    ) ?? null
  );
}

export async function verifyRosterOfficerPasskey(
  officer: DepartmentOfficerRecord,
  passkey: string,
): Promise<boolean> {
  return verifyPasswordPbkdf2(passkey, officer.passkeyHash);
}
