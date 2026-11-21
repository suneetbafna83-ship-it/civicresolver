import { getApps, initializeApp, type FirebaseApp, type FirebaseOptions } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';

export interface FirebaseClientConfig {
  readonly apiKey: string;
  readonly authDomain: string;
  readonly projectId: string;
  readonly appId: string;
}

export interface FirebaseClientServices {
  readonly app: FirebaseApp;
  readonly db: Firestore;
  readonly auth: Auth;
}

interface ViteFirebaseEnvShape {
  readonly VITE_FIREBASE_API_KEY?: string;
  readonly VITE_FIREBASE_AUTH_DOMAIN?: string;
  readonly VITE_FIREBASE_PROJECT_ID?: string;
  readonly VITE_FIREBASE_APP_ID?: string;
}

interface ImportMetaWithEnv extends ImportMeta {
  readonly env?: ViteFirebaseEnvShape;
}

const PLACEHOLDER_EXACT_VALUES = new Set([
  '',
  'undefined',
  'null',
  'none',
  'n/a',
  'na',
  'tbd',
  'changeme',
  'placeholder',
]);

const PLACEHOLDER_PREFIXES = [
  'your_',
  'your-',
  'replace_',
  'replace-',
  'example',
  'fake_',
  'demo_',
] as const;

const firestoreCache = new WeakMap<FirebaseApp, Firestore>();
const authCache = new WeakMap<FirebaseApp, Auth>();

function readViteMetaEnv(): ViteFirebaseEnvShape | undefined {
  const meta: ImportMetaWithEnv = import.meta;
  return meta.env;
}

function readProcessEnvValue(
  key:
    | 'VITE_FIREBASE_API_KEY'
    | 'VITE_FIREBASE_AUTH_DOMAIN'
    | 'VITE_FIREBASE_PROJECT_ID'
    | 'VITE_FIREBASE_APP_ID',
): string | undefined {
  if (typeof process === 'undefined' || process.env === undefined) {
    return undefined;
  }
  switch (key) {
    case 'VITE_FIREBASE_API_KEY':
      return process.env.VITE_FIREBASE_API_KEY;
    case 'VITE_FIREBASE_AUTH_DOMAIN':
      return process.env.VITE_FIREBASE_AUTH_DOMAIN;
    case 'VITE_FIREBASE_PROJECT_ID':
      return process.env.VITE_FIREBASE_PROJECT_ID;
    case 'VITE_FIREBASE_APP_ID':
      return process.env.VITE_FIREBASE_APP_ID;
  }
}

function readFirebaseEnvVar(
  key:
    | 'VITE_FIREBASE_API_KEY'
    | 'VITE_FIREBASE_AUTH_DOMAIN'
    | 'VITE_FIREBASE_PROJECT_ID'
    | 'VITE_FIREBASE_APP_ID',
): string | undefined {
  const fromProcess = readProcessEnvValue(key);
  if (fromProcess !== undefined) {
    return fromProcess;
  }
  const metaEnv = readViteMetaEnv();
  if (metaEnv === undefined) {
    return undefined;
  }
  switch (key) {
    case 'VITE_FIREBASE_API_KEY':
      return metaEnv.VITE_FIREBASE_API_KEY;
    case 'VITE_FIREBASE_AUTH_DOMAIN':
      return metaEnv.VITE_FIREBASE_AUTH_DOMAIN;
    case 'VITE_FIREBASE_PROJECT_ID':
      return metaEnv.VITE_FIREBASE_PROJECT_ID;
    case 'VITE_FIREBASE_APP_ID':
      return metaEnv.VITE_FIREBASE_APP_ID;
  }
}

function normalizeConfiguredValue(raw: string | undefined): string | null {
  if (typeof raw !== 'string') {
    return null;
  }
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return null;
  }
  const lower = trimmed.toLowerCase();
  if (PLACEHOLDER_EXACT_VALUES.has(lower)) {
    return null;
  }
  if (trimmed.startsWith('<') && trimmed.endsWith('>')) {
    return null;
  }
  for (const prefix of PLACEHOLDER_PREFIXES) {
    if (lower.startsWith(prefix)) {
      return null;
    }
  }
  return trimmed;
}

export function getFirebaseConfig(): FirebaseClientConfig | null {
  const apiKey = normalizeConfiguredValue(readFirebaseEnvVar('VITE_FIREBASE_API_KEY'));
  const authDomain = normalizeConfiguredValue(readFirebaseEnvVar('VITE_FIREBASE_AUTH_DOMAIN'));
  const projectId = normalizeConfiguredValue(readFirebaseEnvVar('VITE_FIREBASE_PROJECT_ID'));
  const appId = normalizeConfiguredValue(readFirebaseEnvVar('VITE_FIREBASE_APP_ID'));

  if (apiKey === null || authDomain === null || projectId === null || appId === null) {
    return null;
  }

  return {
    apiKey,
    authDomain,
    projectId,
    appId,
  };
}

export function isFirebaseConfigured(): boolean {
  return getFirebaseConfig() !== null;
}

export function isBrowserOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

export function getFirebaseApp(): FirebaseApp | null {
  const config = getFirebaseConfig();
  if (config === null) {
    return null;
  }

  const existingApps = getApps();
  const existing = existingApps[0];
  if (existing !== undefined) {
    return existing;
  }

  try {
    // Spark Plan $0 constraint: omit storageBucket (no Cloud Storage).
    const options: FirebaseOptions = {
      apiKey: config.apiKey,
      authDomain: config.authDomain,
      projectId: config.projectId,
      appId: config.appId,
    };
    return initializeApp(options);
  } catch {
    return null;
  }
}

export function getFirebaseDb(): Firestore | null {
  const app = getFirebaseApp();
  if (app === null) {
    return null;
  }

  const cached = firestoreCache.get(app);
  if (cached !== undefined) {
    return cached;
  }

  try {
    const db = getFirestore(app);
    firestoreCache.set(app, db);
    return db;
  } catch {
    return null;
  }
}

export function getFirestoreDb(): Firestore | null {
  return getFirebaseDb();
}

export function getFirebaseAuth(): Auth | null {
  const app = getFirebaseApp();
  if (app === null) {
    return null;
  }

  const cached = authCache.get(app);
  if (cached !== undefined) {
    return cached;
  }

  try {
    const auth = getAuth(app);
    authCache.set(app, auth);
    return auth;
  } catch {
    return null;
  }
}

export function getFirebaseServices(): FirebaseClientServices | null {
  const app = getFirebaseApp();
  if (app === null) {
    return null;
  }
  const db = getFirebaseDb();
  const auth = getFirebaseAuth();
  if (db === null || auth === null) {
    return null;
  }
  return { app, db, auth };
}
