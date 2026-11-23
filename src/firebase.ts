import { initializeApp } from 'firebase/app';
import {
  browserLocalPersistence,
  browserPopupRedirectResolver,
  browserSessionPersistence,
  getAuth,
  GoogleAuthProvider,
  initializeAuth,
  type Auth,
} from 'firebase/auth';
import {
  doc,
  getDocFromServer,
  getFirestore,
  initializeFirestore,
  memoryLocalCache,
  persistentLocalCache,
  persistentMultipleTabManager,
  persistentSingleTabManager,
  setLogLevel,
} from 'firebase/firestore';
import firebaseConfigJson from '../firebase-applet-config.json';

const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env || {};

const firebaseConfig = {
  ...firebaseConfigJson,
  apiKey: env.VITE_FIREBASE_API_KEY || firebaseConfigJson.apiKey,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || firebaseConfigJson.authDomain,
  projectId: env.VITE_FIREBASE_PROJECT_ID || firebaseConfigJson.projectId,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET || firebaseConfigJson.storageBucket,
  messagingSenderId:
    env.VITE_FIREBASE_MESSAGING_SENDER_ID || firebaseConfigJson.messagingSenderId,
  appId: env.VITE_FIREBASE_APP_ID || firebaseConfigJson.appId,
};

const firestoreDatabaseId = env.VITE_FIREBASE_DATABASE_ID || firebaseConfigJson.firestoreDatabaseId;

const app = initializeApp(firebaseConfig);

// Evita spam de warnings internos de WebChannelConnection en reconexiones transitorias
// manteniendo visibles errores reales y los reportes JSON de handleFirestoreError.
setLogLevel('error');

function resolveLocalCache() {
  if (typeof window === 'undefined') {
    return memoryLocalCache();
  }
  try {
    return persistentLocalCache({
      tabManager: persistentMultipleTabManager(),
    });
  } catch {
    try {
      return persistentLocalCache({
        tabManager: persistentSingleTabManager({}),
      });
    } catch {
      return memoryLocalCache();
    }
  }
}

function createFirestoreDb() {
  try {
    return initializeFirestore(
      app,
      {
        experimentalAutoDetectLongPolling: true,
        experimentalLongPollingOptions: { timeoutSeconds: 20 },
        ignoreUndefinedProperties: true,
        localCache: resolveLocalCache(),
      },
      firestoreDatabaseId
    );
  } catch {
    return getFirestore(app, firestoreDatabaseId);
  }
}

function createFirebaseAuth(): Auth {
  try {
    // Evita indexedDBLocalPersistence para eliminar timeouts de cross-tab polling (DB_TIMEOUT)
    // en entornos embebidos/iframe, manteniendo sesión persistente en localStorage y login por popup.
    return initializeAuth(app, {
      persistence: [browserLocalPersistence, browserSessionPersistence],
      popupRedirectResolver: browserPopupRedirectResolver,
    });
  } catch {
    return getAuth(app);
  }
}

export const db = createFirestoreDb();
export const auth = createFirebaseAuth();
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error:', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

let activeConnectionCheck: Promise<boolean> | null = null;

export async function testConnection(): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return false;
  }
  if (activeConnectionCheck) {
    return activeConnectionCheck;
  }

  activeConnectionCheck = (async () => {
    const checkServer = async () => {
      await getDocFromServer(doc(db, 'test', 'connection'));
    };

    try {
      await checkServer();
      return true;
    } catch (firstError) {
      const msg = firstError instanceof Error ? firstError.message : String(firstError);
      const code = (firstError as { code?: string })?.code;
      const isTransientOffline =
        msg.includes('the client is offline') ||
        code === 'unavailable' ||
        code === 'deadline-exceeded';

      if (isTransientOffline) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        if (typeof navigator !== 'undefined' && navigator.onLine === false) {
          return false;
        }
        try {
          await checkServer();
          return true;
        } catch (retryError) {
          if (typeof navigator === 'undefined' || navigator.onLine !== false) {
            const retryMsg =
              retryError instanceof Error ? retryError.message : String(retryError);
            if (
              retryMsg.includes('the client is offline') ||
              (retryError as { code?: string })?.code === 'unavailable'
            ) {
              console.warn(
                'Conexión intermitente con Cloud Firestore; esperando recuperación automática.'
              );
            }
          }
        }
      }
      return false;
    } finally {
      activeConnectionCheck = null;
    }
  })();

  return activeConnectionCheck;
}
