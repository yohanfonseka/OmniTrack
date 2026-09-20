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
 * The client a request is confined to, or undefined when it is not confined.
 *
 * A client viewer is pinned to their own client and nothing else. When the
 * account carries no client the scope becomes a value nothing matches, so the
 * account sees nothing rather than everything - a missing field must not widen
 * access.
 */
export function clientScopeOf(req: AuthedRequest): string | undefined {
  const user = req.appUser;
  if (user?.role !== 'client_viewer') return undefined;
  return user.client_id || '__no_client_assigned__';
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
    if (!(await db.persistUser(existing))) {
      throw new Error('The account could not be saved. It would be lost on the next restart, so it was not granted access.');
    }
    return existing;
  }

  // Optional fields are omitted rather than sent as undefined.
  const user = db.createUser({
    email,
    name: params.name,
    role: params.role,
    ...(params.agency_id ? { agency_id: params.agency_id } : {}),
    ...(params.client_id ? { client_id: params.client_id } : {}),
    ...(params.brand_id ? { brand_id: params.brand_id } : {}),
    auth_uid: uid
  } as Omit<User, 'id' | 'created_at'>);

  if (!(await db.persistUser(user))) {
    // Do not report success for an account that exists only in this process.
    db.deleteUser(user.id);
    throw new Error('The account could not be saved. It would be lost on the next restart, so it was not granted access.');
  }
  return user;
}

/**
 * Changes an existing account's name, email, password or role.
 *
 * Email and password live in Firebase, the rest in our own user record, and the
 * two must not drift: an address changed here but not there would leave the
 * person signing in with the old one, and a record whose auth_uid no longer
 * matches any identity cannot sign in at all. Firebase is updated first because
 * it is the half that can reject the change - a duplicate address, a weak
 * password - and our record is only written once it has accepted.
 */
export async function updateAccount(
  userId: string,
  changes: { name?: string; email?: string; password?: string; role?: UserRole; client_id?: string }
): Promise<User> {
  const user = db.users.find(u => u.id === userId);
  if (!user) throw new Error('User not found.');

  const email = changes.email?.trim().toLowerCase();
  if (email !== undefined && !email) throw new Error('Email cannot be empty.');
  if (changes.password !== undefined && changes.password.length < 8) {
    throw new Error('Password must be at least 8 characters.');
  }

  if (email && email !== (user.email || '').toLowerCase()) {
    const clash = db.users.find(u => u.id !== user.id && (u.email || '').toLowerCase() === email);
    if (clash) throw new Error('Another account already uses that email address.');
  }

  const firebaseChanges: Record<string, any> = {};
  if (email && email !== (user.email || '').toLowerCase()) firebaseChanges.email = email;
  if (changes.password) firebaseChanges.password = changes.password;
  if (changes.name && changes.name !== user.name) firebaseChanges.displayName = changes.name;

  if (Object.keys(firebaseChanges).length > 0) {
    if (!user.auth_uid) {
      throw new Error('This account has no sign-in identity yet, so its email and password cannot be changed.');
    }
    try {
      await getAuth().updateUser(user.auth_uid, firebaseChanges);
    } catch (err: any) {
      if (err?.code === 'auth/email-already-exists') {
        throw new Error('Another account already uses that email address.');
      }
      throw new Error(err?.message || 'Could not update the sign-in details.');
    }
  }

  const before = { ...user };
  if (changes.name) user.name = changes.name;
  if (email) user.email = email;
  if (changes.role) user.role = changes.role;
  if (changes.client_id !== undefined) {
    if (changes.client_id) user.client_id = changes.client_id;
    else delete user.client_id;
  }

  if (!(await db.persistUser(user))) {
    // Firebase has already accepted the change, so leaving our record rolled
    // back is the lesser evil: the two disagree either way, and this way the
    // failure is reported rather than silently kept in memory until a restart.
    Object.assign(user, before);
    throw new Error('The change could not be saved, so it was rolled back. Firebase sign-in details may already have changed - try again.');
  }

  return user;
}

/** True once any account has been linked to a Firebase identity. */
export function hasBootstrappedAdmin(): boolean {
  return db.users.some(u => !!u.auth_uid);
}

export function firestoreReady(): boolean {
  return getFirestoreDb() !== null;
}
