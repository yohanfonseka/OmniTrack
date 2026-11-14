/**
 * All runtime configuration, read once from the environment.
 * Platform credentials are optional: a platform without them is unavailable
 * (or served by the demo provider when DEMO_MODE=true).
 */
const env = process.env;

const isProduction = env.NODE_ENV === 'production';

export const config = {
  isProduction,
  port: Number(env.PORT || 3100),
  /** Public origin, used to build OAuth redirect URIs and links in emails. */
  baseUrl: (env.BASE_URL || `http://localhost:${env.PORT || 3100}`).replace(/\/$/, ''),
  /** 'firestore' or 'memory'. Memory is for local development and tests only. */
  store: (env.STORE || (env.FIRESTORE_DATABASE_ID ? 'firestore' : 'memory')) as 'firestore' | 'memory',
  firestore: {
    projectId: env.FIREBASE_PROJECT_ID || env.GOOGLE_CLOUD_PROJECT || '',
    databaseId: env.FIRESTORE_DATABASE_ID || 'creatortrack',
  },
  /** 32-byte key, base64. Encrypts platform access tokens at rest. */
  tokenEncryptionKey: env.TOKEN_ENCRYPTION_KEY || '',
  /** Shared secret Cloud Scheduler sends to the /internal endpoints. */
  internalSecret: env.INTERNAL_SECRET || '',
  /** Comma-separated emails that get the admin panel once verified. */
  adminEmails: (env.ADMIN_EMAILS || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean),
  /** Lets creators connect fake accounts for platforms with no credentials. Never enable in production. */
  demoMode: env.DEMO_MODE === 'true',
  email: {
    resendApiKey: env.RESEND_API_KEY || '',
    from: env.EMAIL_FROM || 'CreatorTrack <hello@creatortrack.lk>',
  },
  google: {
    clientId: env.GOOGLE_CLIENT_ID || '',
    clientSecret: env.GOOGLE_CLIENT_SECRET || '',
  },
  instagram: {
    appId: env.INSTAGRAM_APP_ID || '',
    appSecret: env.INSTAGRAM_APP_SECRET || '',
  },
  tiktok: {
    clientKey: env.TIKTOK_CLIENT_KEY || '',
    clientSecret: env.TIKTOK_CLIENT_SECRET || '',
  },
};

export function assertProductionConfig() {
  if (!config.isProduction) return;
  const missing: string[] = [];
  if (config.store !== 'firestore') missing.push('STORE=firestore (or FIRESTORE_DATABASE_ID)');
  if (!config.tokenEncryptionKey) missing.push('TOKEN_ENCRYPTION_KEY');
  if (!config.internalSecret) missing.push('INTERNAL_SECRET');
  if (!process.env.BASE_URL) missing.push('BASE_URL');
  if (config.demoMode) missing.push('DEMO_MODE must be unset in production');
  if (missing.length) {
    throw new Error(`Production configuration incomplete: ${missing.join(', ')}`);
  }
}
