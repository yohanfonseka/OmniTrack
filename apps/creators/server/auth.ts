import type { NextFunction, Request, Response } from 'express';
import { config } from './config.js';
import { randomToken, sha256 } from './crypto.js';
import { emails } from './email.js';
import { C, type CreatorDoc, type SessionDoc, type UserDoc } from './models.js';
import type { Deps } from './deps.js';
import { addMs, DAY, HOUR, HttpError, nowIso, slugify } from './util.js';
import type { Me, Platform, Role } from '../shared/types.js';

export const SESSION_COOKIE = 'ct_session';
const SESSION_MS = 30 * DAY;

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: UserDoc | null;
    }
  }
}

export function isAdmin(user: UserDoc | null | undefined): boolean {
  return !!user && user.emailVerified && config.adminEmails.includes(user.email);
}

export async function startSession(deps: Deps, res: Response, userId: string) {
  const token = randomToken(32);
  const doc: SessionDoc = { id: sha256(token), userId, createdAt: nowIso(), expiresAt: addMs(SESSION_MS) };
  await deps.store.set(C.sessions, doc.id, doc);
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.isProduction,
    maxAge: SESSION_MS,
    path: '/',
  });
}

export async function endSession(deps: Deps, req: Request, res: Response) {
  const token = req.cookies?.[SESSION_COOKIE];
  if (token) await deps.store.delete(C.sessions, sha256(token));
  res.clearCookie(SESSION_COOKIE, { path: '/' });
}

/** Attaches req.user (or null) from the session cookie. */
export function loadUser(deps: Deps) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    req.user = null;
    const token = req.cookies?.[SESSION_COOKIE];
    if (!token) return next();
    try {
      const session = await deps.store.get<SessionDoc>(C.sessions, sha256(token));
      if (session && session.expiresAt > nowIso()) {
        const user = await deps.store.get<UserDoc>(C.users, session.userId);
        if (user && !user.disabled) req.user = user;
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

export function requireUser(req: Request): UserDoc {
  if (!req.user) throw new HttpError(401, 'Please sign in.');
  return req.user;
}

export function requireRole(req: Request, role: Role): UserDoc {
  const user = requireUser(req);
  if (user.role !== role) throw new HttpError(403, `This is only available to ${role} accounts.`);
  return user;
}

export function requireAdmin(req: Request): UserDoc {
  const user = requireUser(req);
  if (!isAdmin(user)) throw new HttpError(403, 'Admins only.');
  return user;
}

export async function findUserByEmail(deps: Deps, email: string): Promise<UserDoc | null> {
  const [u] = await deps.store.find<UserDoc>(C.users, [['email', '==', email.toLowerCase()]], 1);
  return u ?? null;
}

/** Picks a free slug starting from the given name: anne, anne-2, anne-3… */
export async function uniqueSlug(deps: Deps, name: string, field: 'slug' | 'referralCode' = 'slug'): Promise<string> {
  let base = slugify(name);
  if (base.length < 3) base = `creator-${base || 'new'}`.slice(0, 30).replace(/-$/, '');
  for (let i = 1; i < 200; i++) {
    const candidate = i === 1 ? base : `${base.slice(0, 26)}-${i}`;
    const taken = await deps.store.find(C.creators, [[field, '==', candidate]], 1);
    if (!taken.length) return candidate;
  }
  return `${base.slice(0, 20)}-${Date.now().toString(36)}`;
}

export interface NewUserInput {
  email: string;
  name: string;
  role: Role;
  companyName?: string | null;
  passwordHash?: string | null;
  googleSub?: string | null;
  emailVerified?: boolean;
  ref?: string | null;
  inviteToken?: string | null;
}

/** Creates the user (and, for creators, an empty profile), resolving referral and invite links. */
export async function createUser(deps: Deps, input: NewUserInput): Promise<UserDoc> {
  const { store } = deps;
  const id = randomToken(15);
  let referredBy: string | null = null;
  let inviteToken: string | null = null;
  let emailVerified = !!input.emailVerified;

  if (input.role === 'creator' && input.ref) {
    const [referrer] = await store.find<CreatorDoc>(C.creators, [['referralCode', '==', input.ref.toLowerCase()]], 1);
    if (referrer) referredBy = referrer.id;
  }
  if (input.role === 'creator' && input.inviteToken) {
    const invite = await store.get<import('./models.js').InviteDoc>(C.invites, input.inviteToken);
    if (invite && invite.expiresAt > nowIso() && !['cancelled', 'signed_up', 'connected'].includes(invite.status)) {
      inviteToken = invite.token;
      // The invite was sent to this address, so following it proves ownership.
      if (invite.email && invite.email.toLowerCase() === input.email.toLowerCase()) emailVerified = true;
      await store.patch(C.invites, invite.token, { status: 'signed_up', creatorId: id });
    }
  }

  const user: UserDoc = {
    id,
    email: input.email.toLowerCase(),
    name: input.name.trim(),
    role: input.role,
    companyName: input.role === 'brand' ? (input.companyName || '').trim() || null : null,
    passwordHash: input.passwordHash ?? null,
    googleSub: input.googleSub ?? null,
    emailVerified,
    disabled: false,
    createdAt: nowIso(),
    referredBy,
    referralCredited: false,
    inviteToken,
  };
  await store.set(C.users, id, user);

  if (user.role === 'creator') {
    const slug = await uniqueSlug(deps, user.name);
    const referralCode = await uniqueSlug(deps, user.name, 'referralCode');
    const creator: CreatorDoc = {
      id,
      slug,
      displayName: user.name,
      bio: '',
      categories: [],
      city: '',
      country: 'Sri Lanka',
      contactEmail: user.email,
      referralCode,
      friendsJoined: 0,
      hidden: false,
      weeklyEmail: true,
      onboarded: false,
      createdAt: user.createdAt,
      updatedAt: user.createdAt,
    };
    await store.set(C.creators, id, creator);
  }
  return user;
}

export async function sendVerificationEmail(deps: Deps, user: UserDoc) {
  const token = randomToken(32);
  await deps.store.set(C.emailTokens, sha256(token), {
    id: sha256(token), userId: user.id, kind: 'verify', expiresAt: addMs(48 * HOUR),
  });
  await deps.mailer.send(emails.verify(user.email, user.name, `${config.baseUrl}/verify-email?token=${token}`));
}

export async function sendResetEmail(deps: Deps, user: UserDoc) {
  const token = randomToken(32);
  await deps.store.set(C.emailTokens, sha256(token), {
    id: sha256(token), userId: user.id, kind: 'reset', expiresAt: addMs(HOUR),
  });
  await deps.mailer.send(emails.reset(user.email, `${config.baseUrl}/reset-password?token=${token}`));
}

export async function toMe(deps: Deps, user: UserDoc): Promise<Me> {
  let creator: Me['creator'] = null;
  if (user.role === 'creator') {
    const c = await deps.store.get<CreatorDoc>(C.creators, user.id);
    const accounts = await deps.store.find<{ platform: Platform }>(C.accounts, [['userId', '==', user.id]]);
    creator = c ? { slug: c.slug, onboarded: c.onboarded, connectedPlatforms: accounts.map((a) => a.platform) } : null;
  }
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    companyName: user.companyName,
    emailVerified: user.emailVerified,
    isAdmin: isAdmin(user),
    hasPassword: !!user.passwordHash,
    creator,
  };
}
