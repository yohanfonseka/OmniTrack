import type { Express } from 'express';
import { config } from '../config.js';
import { hashPassword, randomToken, sha256, verifyPassword } from '../crypto.js';
import {
  createUser, endSession, findUserByEmail, requireUser, sendResetEmail, sendVerificationEmail, startSession, toMe,
} from '../auth.js';
import { C, type CreatorDoc, type EmailTokenDoc, type OAuthStateDoc, type UserDoc } from '../models.js';
import type { Deps } from '../deps.js';
import { HttpError, nowIso, RateLimiter } from '../util.js';
import { isDisposableEmail, isValidEmail } from '../../shared/disposable.js';
import type { Role } from '../../shared/types.js';
import { ah, clientIp, safeReturnTo, str } from './helpers.js';

const loginLimiter = new RateLimiter(10, 15 * 60_000);
const signupLimiter = new RateLimiter(10, 60 * 60_000);
const emailLimiter = new RateLimiter(5, 60 * 60_000);

function checkEmail(raw: unknown): string {
  const email = str(raw, 'Email', { min: 3, max: 254 }).toLowerCase();
  if (!isValidEmail(email)) throw new HttpError(400, 'Please enter a valid email address.');
  if (isDisposableEmail(email)) throw new HttpError(400, 'Please use a permanent email address, not a disposable one.');
  return email;
}

function checkPassword(raw: unknown): string {
  if (typeof raw !== 'string' || raw.length < 8) throw new HttpError(400, 'Password must be at least 8 characters.');
  if (raw.length > 200) throw new HttpError(400, 'Password is too long.');
  return raw;
}

/** Where to send someone right after they sign in. */
export async function landingFor(deps: Deps, user: UserDoc, returnTo: string | null): Promise<string> {
  if (user.role === 'creator') {
    const c = await deps.store.get<CreatorDoc>(C.creators, user.id);
    if (c && !c.onboarded) return '/onboarding';
    return returnTo ?? '/dashboard';
  }
  return returnTo ?? '/';
}

export function registerAuthRoutes(app: Express, deps: Deps) {
  const googleRedirect = `${config.baseUrl}/api/auth/google/callback`;

  app.get('/api/config', (_req, res) => {
    const platforms = Object.fromEntries(
      (['instagram', 'tiktok', 'youtube'] as const).map((p) => [p, deps.providers.platforms[p]?.mode ?? 'off']),
    );
    res.json({ google: deps.providers.google.enabled, platforms, baseUrl: config.baseUrl });
  });

  app.get('/api/auth/me', ah(async (req, res) => {
    res.json({ user: req.user ? await toMe(deps, req.user) : null });
  }));

  app.post('/api/auth/signup', ah(async (req, res) => {
    if (!signupLimiter.check(clientIp(req))) throw new HttpError(429, 'Too many sign-ups from this network. Please try later.');
    const role = req.body.role as Role;
    if (role !== 'creator' && role !== 'brand') throw new HttpError(400, 'Choose creator or brand.');
    const email = checkEmail(req.body.email);
    const password = checkPassword(req.body.password);
    const name = str(req.body.name, 'Name', { min: 2, max: 80 });
    const companyName = role === 'brand' ? str(req.body.companyName, 'Company name', { min: 2, max: 120 }) : null;
    if (await findUserByEmail(deps, email)) throw new HttpError(409, 'An account with this email already exists. Try signing in.');

    const user = await createUser(deps, {
      email, name, role, companyName,
      passwordHash: await hashPassword(password),
      ref: typeof req.body.ref === 'string' ? req.body.ref : null,
      inviteToken: typeof req.body.invite === 'string' ? req.body.invite : null,
    });
    if (!user.emailVerified) await sendVerificationEmail(deps, user);
    await startSession(deps, res, user.id);
    res.status(201).json({ user: await toMe(deps, user), next: await landingFor(deps, user, safeReturnTo(req.body.returnTo)) });
  }));

  app.post('/api/auth/login', ah(async (req, res) => {
    const email = String(req.body.email ?? '').trim().toLowerCase();
    if (!loginLimiter.check(`${clientIp(req)}|${email}`)) throw new HttpError(429, 'Too many attempts. Please wait 15 minutes.');
    const user = await findUserByEmail(deps, email);
    const ok = user?.passwordHash && (await verifyPassword(String(req.body.password ?? ''), user.passwordHash));
    if (!user || !ok) {
      if (user && !user.passwordHash && user.googleSub) throw new HttpError(401, 'This account uses Google sign-in. Use "Continue with Google".');
      throw new HttpError(401, 'Incorrect email or password.');
    }
    if (user.disabled) throw new HttpError(403, 'This account has been disabled.');
    await startSession(deps, res, user.id);
    res.json({ user: await toMe(deps, user), next: await landingFor(deps, user, safeReturnTo(req.body.returnTo)) });
  }));

  app.post('/api/auth/logout', ah(async (req, res) => {
    await endSession(deps, req, res);
    res.json({ ok: true });
  }));

  app.post('/api/auth/verify-email', ah(async (req, res) => {
    const token = String(req.body.token ?? '');
    const doc = await deps.store.get<EmailTokenDoc>(C.emailTokens, sha256(token));
    if (!doc || doc.kind !== 'verify' || doc.expiresAt < nowIso()) {
      throw new HttpError(400, 'This link is invalid or has expired. Sign in and request a new one.');
    }
    await deps.store.patch(C.users, doc.userId, { emailVerified: true });
    await deps.store.delete(C.emailTokens, doc.id);
    res.json({ ok: true });
  }));

  app.post('/api/auth/resend-verification', ah(async (req, res) => {
    const user = requireUser(req);
    if (user.emailVerified) return res.json({ ok: true, alreadyVerified: true });
    if (!emailLimiter.check(`verify|${user.id}`)) throw new HttpError(429, 'Please wait before requesting another email.');
    await sendVerificationEmail(deps, user);
    res.json({ ok: true });
  }));

  app.post('/api/auth/forgot-password', ah(async (req, res) => {
    const email = String(req.body.email ?? '').trim().toLowerCase();
    if (!emailLimiter.check(`reset|${clientIp(req)}`)) throw new HttpError(429, 'Please wait before requesting another email.');
    const user = await findUserByEmail(deps, email);
    // Same response either way, so this can't be used to discover accounts.
    if (user && !user.disabled) await sendResetEmail(deps, user);
    res.json({ ok: true });
  }));

  app.post('/api/auth/reset-password', ah(async (req, res) => {
    const doc = await deps.store.get<EmailTokenDoc>(C.emailTokens, sha256(String(req.body.token ?? '')));
    if (!doc || doc.kind !== 'reset' || doc.expiresAt < nowIso()) throw new HttpError(400, 'This link is invalid or has expired.');
    const password = checkPassword(req.body.password);
    // Following the emailed link also proves the address.
    await deps.store.patch(C.users, doc.userId, { passwordHash: await hashPassword(password), emailVerified: true });
    await deps.store.delete(C.emailTokens, doc.id);
    // Sign out every other session.
    for (const s of await deps.store.find<{ id: string }>(C.sessions, [['userId', '==', doc.userId]])) {
      await deps.store.delete(C.sessions, s.id);
    }
    res.json({ ok: true });
  }));

  // ---- Google sign-in ---------------------------------------------------
  app.get('/api/auth/google', ah(async (req, res) => {
    if (!deps.providers.google.enabled) throw new HttpError(404, 'Google sign-in is not available.');
    const role = req.query.role === 'creator' || req.query.role === 'brand' ? (req.query.role as Role) : null;
    const state: OAuthStateDoc = {
      id: randomToken(24),
      purpose: 'login',
      platform: 'google',
      userId: null,
      role,
      ref: typeof req.query.ref === 'string' ? req.query.ref : null,
      invite: typeof req.query.invite === 'string' ? req.query.invite : null,
      returnTo: safeReturnTo(req.query.returnTo),
      createdAt: nowIso(),
    };
    await deps.store.set(C.oauthStates, state.id, state);
    res.redirect(deps.providers.google.authorizeUrl(state.id, googleRedirect));
  }));

  app.get('/api/auth/google/callback', ah(async (req, res) => {
    const fail = (msg: string) => res.redirect(`/login?error=${encodeURIComponent(msg)}`);
    const state = await deps.store.get<OAuthStateDoc>(C.oauthStates, String(req.query.state ?? ''));
    if (state) await deps.store.delete(C.oauthStates, state.id);
    if (!state || state.purpose !== 'login' || Date.parse(state.createdAt) < Date.now() - 15 * 60_000) {
      return fail('Sign-in expired. Please try again.');
    }
    if (req.query.error || !req.query.code) return fail('Google sign-in was cancelled.');

    const id = await deps.providers.google.identify(String(req.query.code), googleRedirect);
    if (!id.emailVerified) return fail('Your Google email address is not verified.');

    let user: UserDoc | null = (await deps.store.find<UserDoc>(C.users, [["googleSub", "==", id.sub]], 1))[0] ?? null;
    if (!user) {
      user = await findUserByEmail(deps, id.email);
      if (user) {
        // Google has verified this address, so it's safe to link it to the existing account.
        await deps.store.patch(C.users, user.id, { googleSub: id.sub, emailVerified: true });
        user = { ...user, googleSub: id.sub, emailVerified: true };
      }
    }
    if (!user) {
      if (!state.role) return fail('No account found for this Google address. Please sign up first.');
      if (isDisposableEmail(id.email)) return fail('Please use a permanent email address.');
      user = await createUser(deps, {
        email: id.email, name: id.name, role: state.role, googleSub: id.sub, emailVerified: true,
        ref: state.ref, inviteToken: state.invite,
        companyName: null,
      });
    }
    if (user.disabled) return fail('This account has been disabled.');
    await startSession(deps, res, user.id);
    const next = user.role === 'brand' && !user.companyName ? '/onboarding/brand' : await landingFor(deps, user, state.returnTo);
    res.redirect(next);
  }));
}
