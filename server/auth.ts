import fs from 'fs';
import path from 'path';
import express from 'express';
import { getAuth } from 'firebase-admin/auth';
import { db } from './db.js';
import { User, UserRole } from './types.js';
import { getFirestoreDb } from './firestore.js';

export const SESSION_COOKIE = 'omnitrack_session';
const SESSION_DURATION_MS = 5 * 24 * 60 * 60 * 1000; // 5 days

export interface AuthedRequest extends express.Request {
  /** The application user behind the verified session. Set by requireAuth. */
  appUser?: User;
}

function webApiKey(): string {
  if (process.env.FIREBASE_WEB_API_KEY) return process.env.FIREBASE_WEB_API_KEY;
  try {
    const configPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
    if (fs.existsSync(configPath)) {
      return JSON.parse(fs.readFileSync(configPath, 'utf-8')).apiKey || '';
    }
  } catch {
    // fall through to the empty key, which surfaces as a clear login error
  }
  return '';
}

/**
 * Exchanges an email and password for a Firebase ID token using the Identity
 * Toolkit REST API. Done server-side so the browser never loads the Firebase
 * SDK and never holds a token.
 */
async function signInWithPassword(email: string, password: string): Promise<string> {
  const key = webApiKey();
  if (!key) throw new Error('Sign-in is not configured: no Firebase web API key available.');

  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(key)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, returnSecureToken: true })
    }
  );

  const body: any = await res.json().catch(() => ({}));
  if (!res.ok) {
    // Firebase distinguishes wrong-password from unknown-email; deliberately collapse
    // both so the response cannot be used to enumerate accounts.
    const code = body?.error?.message || '';
    if (['EMAIL_NOT_FOUND', 'INVALID_PASSWORD', 'INVALID_LOGIN_CREDENTIALS'].includes(code)) {
      throw new Error('Incorrect email or password.');
    }
    if (code === 'USER_DISABLED') throw new Error('This account has been disabled.');
    if (code.startsWith('TOO_MANY_ATTEMPTS')) {
      throw new Error('Too many failed attempts. Please wait and try again.');
    }
    if (code === 'PASSWORD_LOGIN_DISABLED' || code === 'OPERATION_NOT_ALLOWED') {
      // Configuration fault rather than a user error - say so, or this looks
      // like "wrong password" to everyone including the administrator.
      console.error('[Auth] Email/password sign-in is disabled for this Firebase project.');
      throw new Error('Email/password sign-in is not enabled for this project. An administrator must enable it in Firebase Authentication.');
    }
    console.error('[Auth] Unexpected sign-in failure:', code);
    throw new Error('Could not sign in. Please try again.');
  }
  return body.idToken as string;
}

/**
 * Resolves a verified Firebase identity to its app account, strictly by uid.
 *
 * Matching on email would be unsafe: Firebase's accounts:signUp REST endpoint
 * is callable by anyone holding the (public) web API key, so a stranger could
 * register an address that happens to match a seeded account and inherit its
 * role. A uid is only ever attached by bootstrap or by an admin invite, so
 * access must be granted deliberately.
 */
function findAppUser(uid: string): User | undefined {
  return db.users.find(u => u.auth_uid === uid);
}

export async function loginWithPassword(email: string, password: string): Promise<{ cookie: string; user: User }> {
  const idToken = await signInWithPassword(email, password);
  const decoded = await getAuth().verifyIdToken(idToken);

  const user = findAppUser(decoded.uid);
  if (!user) {
    // Authenticating against Firebase is not enough: the account must also have
    // been granted access to an agency by an admin.
    throw new Error('This account is not set up for OmniTrack. Ask an administrator to invite you.');
  }

  const cookie = await getAuth().createSessionCookie(idToken, { expiresIn: SESSION_DURATION_MS });
  return { cookie, user };
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    maxAge: SESSION_DURATION_MS,
    path: '/'
  };
}

/**
 * Verifies the session cookie and attaches the application user. Every /api
 * route other than health and the auth routes themselves goes through this, so
 * the caller's agency is always derived from a verified identity rather than
 * from a request header.
 */
export async function requireAuth(req: AuthedRequest, res: express.Response, next: express.NextFunction) {
  const cookie = req.cookies?.[SESSION_COOKIE];
  if (!cookie) return res.status(401).json({ error: 'Not signed in' });

  try {
    const decoded = await getAuth().verifySessionCookie(cookie, true);
    const user = findAppUser(decoded.uid);
    if (!user) return res.status(403).json({ error: 'This account has no OmniTrack access.' });
    req.appUser = user;
    next();
  } catch {
    res.clearCookie(SESSION_COOKIE, { ...sessionCookieOptions(), maxAge: undefined });
    res.status(401).json({ error: 'Session expired. Please sign in again.' });
  }
}

export function requireRole(...roles: UserRole[]) {
  return (req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
    if (!req.appUser) return res.status(401).json({ error: 'Not signed in' });
    if (!roles.includes(req.appUser.role)) {
      return res.status(403).json({ error: 'You do not have permission to do that.' });
    }
    next();
  };
}

/**
 * The agency a request may act on. Taken from the signed-in user, never from a
 * client-supplied header; only a super user may act on another agency.
 */
export function resolveAgencyId(req: AuthedRequest): string {
  const user = req.appUser;
  if (!user) throw new Error('resolveAgencyId called without an authenticated user');

  if (user.role === 'super_user') {
    const requested = (req.headers['x-agency-id'] as string) || (req.query.agency_id as string);
    if (requested) return requested;
  }
  return user.agency_id || '';
}

/**
 * Creates a Firebase account and the matching app user. Used both by admin
 * invites and by the one-off bootstrap of the very first administrator.
 */
export async function createAccount(params: {
  email: string;
  password: string;
  name: string;
  role: UserRole;
  agency_id?: string;
  client_id?: string;
  brand_id?: string;
}): Promise<User> {
  const email = params.email.trim().toLowerCase();
  if (!email || !params.password) throw new Error('Email and password are required.');
  if (params.password.length < 8) throw new Error('Password must be at least 8 characters.');

  let uid: string;
  try {
    const created = await getAuth().createUser({
      email,
      password: params.password,
      displayName: params.name
    });
    uid = created.uid;
  } catch (err: any) {
    if (err?.code === 'auth/email-already-exists') {
      // A Firebase identity already exists for this address. Reuse it, but reset
      // the credential to the one the admin just chose: anyone can pre-register
      // an arbitrary email with Firebase, and reusing their password as-is would
      // hand them the access being granted here.
      uid = (await getAuth().getUserByEmail(email)).uid;
      await getAuth().updateUser(uid, { password: params.password, displayName: params.name });
    } else {
      throw new Error(err?.message || 'Could not create the account.');
    }
  }

  const existing = db.users.find(u => (u.email || '').toLowerCase() === email);
  if (existing) {
    existing.auth_uid = uid;
    existing.name = params.name || existing.name;
    existing.role = params.role;
    existing.agency_id = params.agency_id ?? existing.agency_id;
    db.persistUser(existing);
    return existing;
  }

  return db.createUser({
    email,
    name: params.name,
    role: params.role,
    agency_id: params.agency_id,
    client_id: params.client_id,
    brand_id: params.brand_id,
    auth_uid: uid
  } as Omit<User, 'id' | 'created_at'>);
}

/** True once any account has been linked to a Firebase identity. */
export function hasBootstrappedAdmin(): boolean {
  return db.users.some(u => !!u.auth_uid);
}

export function firestoreReady(): boolean {
  return getFirestoreDb() !== null;
}
