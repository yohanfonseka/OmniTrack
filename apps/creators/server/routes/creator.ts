import type { Express, Request } from 'express';
import { config } from '../config.js';
import { randomToken } from '../crypto.js';
import { requireRole, requireUser, endSession } from '../auth.js';
import { buildCard, COMMUNITY_BUILDER_THRESHOLD, interestCounts, invalidateDirectory } from '../directory.js';
import { C, type AccountDetailsDoc, type AccountDoc, type CreatorDoc, type OAuthStateDoc, type UserDoc } from '../models.js';
import type { Deps } from '../deps.js';
import { renderPdf } from '../pdf.js';
import { accountId, connectAccount, disconnectAccount, syncAccount } from '../sync.js';
import { HttpError, nowIso, RateLimiter, SLUG_RE } from '../util.js';
import { isCategory, MAX_CATEGORIES } from '../../shared/categories.js';
import { PLATFORMS, type CreatorDashboard, type FullReport, type Platform } from '../../shared/types.js';
import { ah, str } from './helpers.js';

const syncLimiter = new RateLimiter(3, 60 * 60_000);

/** Words that would make a confusing public link. */
const RESERVED_SLUGS = new Set(['admin', 'api', 'login', 'signup', 'dashboard', 'settings', 'creatortrack', 'support', 'help', 'about', 'brand', 'brands']);

function platformParam(req: Request): Platform {
  const p = req.params.platform as Platform;
  if (!PLATFORMS.includes(p)) throw new HttpError(404, 'Unknown platform.');
  return p;
}

export async function loadReports(deps: Deps, accounts: AccountDoc[]): Promise<FullReport[]> {
  const details = await deps.store.getMany<AccountDetailsDoc>(C.accountDetails, accounts.map((a) => a.id));
  return accounts.map((a, i) => ({
    platform: a.platform,
    recentPosts: details[i]?.recentPosts ?? [],
    demographics: details[i]?.demographics ?? null,
    history: details[i]?.history ?? [],
    youtube: details[i]?.youtube ?? null,
  }));
}

export function completeness(c: CreatorDoc, accounts: AccountDoc[]) {
  const checks: [boolean, string][] = [
    [c.displayName.length >= 2, 'Add your display name'],
    [c.bio.length >= 30, 'Write a bio of at least 30 characters'],
    [c.categories.length > 0, 'Choose at least one category'],
    [!!c.city, 'Add your city'],
    [accounts.length > 0, 'Connect at least one platform'],
    [accounts.length > 1, 'Connect a second platform'],
    [accounts.every((a) => a.status === 'active'), 'Reconnect expired platforms'],
  ];
  const done = checks.filter(([ok]) => ok).length;
  return { percent: Math.round((done / checks.length) * 100), missing: checks.filter(([ok]) => !ok).map(([, m]) => m) };
}

async function deleteUserData(deps: Deps, user: UserDoc) {
  const { store } = deps;
  const del = async (col: string, field: string) => {
    for (const d of await store.find<{ id: string }>(col, [[field, '==', user.id]])) await store.delete(col, d.id);
  };
  for (const a of await store.find<AccountDoc>(C.accounts, [['userId', '==', user.id]])) {
    await store.delete(C.accounts, a.id);
    await store.delete(C.accountDetails, a.id);
  }
  await del(C.creatorDaily, 'creatorId');
  await del(C.reportViewers, 'creatorId');
  await del(C.brandViews, user.role === 'brand' ? 'brandId' : 'creatorId');
  await del(C.sessions, 'userId');
  await del(C.emailTokens, 'userId');
  await store.delete(C.creators, user.id);
  await store.delete(C.users, user.id);
  invalidateDirectory();
}

export function registerCreatorRoutes(app: Express, deps: Deps) {
  const redirectUri = (p: Platform) => `${config.baseUrl}/api/connect/${p}/callback`;

  app.get('/api/creator/dashboard', ah(async (req, res) => {
    const user = requireRole(req, 'creator');
    const c = await deps.store.get<CreatorDoc>(C.creators, user.id);
    if (!c) throw new HttpError(404, 'Profile not found.');
    const accounts = await deps.store.find<AccountDoc>(C.accounts, [['userId', '==', user.id]]);
    const body: CreatorDashboard = {
      profile: {
        slug: c.slug, displayName: c.displayName, bio: c.bio, categories: c.categories, city: c.city,
        country: c.country, contactEmail: c.contactEmail, weeklyEmail: c.weeklyEmail,
      },
      accounts: buildCard(c, accounts).accounts,
      reports: await loadReports(deps, accounts),
      interest: await interestCounts(deps, user.id),
      referral: { code: c.referralCode, friendsJoined: c.friendsJoined, communityBuilder: c.friendsJoined >= COMMUNITY_BUILDER_THRESHOLD },
      completeness: completeness(c, accounts),
    };
    res.json(body);
  }));

  app.put('/api/creator/profile', ah(async (req, res) => {
    const user = requireRole(req, 'creator');
    const c = await deps.store.get<CreatorDoc>(C.creators, user.id);
    if (!c) throw new HttpError(404, 'Profile not found.');
    const b = req.body ?? {};

    const categories = Array.isArray(b.categories) ? [...new Set(b.categories)] : c.categories;
    if (!categories.every(isCategory)) throw new HttpError(400, 'Unknown category.');
    if (categories.length < 1) throw new HttpError(400, 'Choose at least one category.');
    if (categories.length > MAX_CATEGORIES) throw new HttpError(400, `Choose at most ${MAX_CATEGORIES} categories.`);

    let slug = c.slug;
    if (b.slug !== undefined && b.slug !== c.slug) {
      slug = String(b.slug).trim().toLowerCase();
      if (!SLUG_RE.test(slug)) throw new HttpError(400, 'Link name must be 3–30 characters: letters, numbers and dashes.');
      if (RESERVED_SLUGS.has(slug)) throw new HttpError(400, 'That link name is reserved. Please pick another.');
      const taken = await deps.store.find<CreatorDoc>(C.creators, [['slug', '==', slug]], 1);
      if (taken.length && taken[0].id !== user.id) throw new HttpError(409, 'That link name is taken.');
    }

    const next: CreatorDoc = {
      ...c,
      slug,
      categories: categories as CreatorDoc['categories'],
      displayName: b.displayName !== undefined ? str(b.displayName, 'Display name', { min: 2, max: 60 }) : c.displayName,
      bio: b.bio !== undefined ? str(b.bio, 'Bio', { max: 400 }) : c.bio,
      city: b.city !== undefined ? str(b.city, 'City', { max: 60 }) : c.city,
      country: b.country !== undefined ? str(b.country, 'Country', { max: 60 }) : c.country,
      contactEmail: b.contactEmail !== undefined ? str(b.contactEmail, 'Contact email', { max: 254 }) : c.contactEmail,
      weeklyEmail: typeof b.weeklyEmail === 'boolean' ? b.weeklyEmail : c.weeklyEmail,
      onboarded: true,
      updatedAt: nowIso(),
    };
    await deps.store.set(C.creators, user.id, next);
    invalidateDirectory();
    res.json({ ok: true, slug: next.slug });
  }));

  // ---- Connecting platforms -------------------------------------------
  app.get('/api/connect/:platform/start', ah(async (req, res) => {
    const platform = platformParam(req);
    const user = requireRole(req, 'creator');
    const provider = deps.providers.platforms[platform];
    if (!provider) throw new HttpError(404, `${platform} connections are not available yet.`);
    const state: OAuthStateDoc = {
      id: randomToken(24), purpose: 'connect', platform, userId: user.id,
      role: null, ref: null, invite: null, returnTo: typeof req.query.from === 'string' && req.query.from === 'onboarding' ? '/onboarding?step=connect' : '/dashboard',
      createdAt: nowIso(),
    };
    await deps.store.set(C.oauthStates, state.id, state);
    res.redirect(provider.authorizeUrl(state.id, redirectUri(platform)));
  }));

  app.get('/api/connect/:platform/callback', ah(async (req, res) => {
    const platform = platformParam(req);
    const state = await deps.store.get<OAuthStateDoc>(C.oauthStates, String(req.query.state ?? ''));
    if (state) await deps.store.delete(C.oauthStates, state.id);
    const back = state?.returnTo ?? '/dashboard';
    const sep = back.includes('?') ? '&' : '?';
    const fail = (msg: string) => res.redirect(`${back}${sep}connect_error=${encodeURIComponent(msg)}`);

    // The state must belong to the signed-in creator, so nobody can attach their account to someone else's profile.
    if (!state || state.purpose !== 'connect' || state.platform !== platform || !req.user || state.userId !== req.user.id
      || Date.parse(state.createdAt) < Date.now() - 15 * 60_000) {
      return fail('The connection request expired. Please try again.');
    }
    if (req.query.error || !req.query.code) return fail('Connection was cancelled.');
    const provider = deps.providers.platforms[platform];
    if (!provider) return fail('This platform is not available.');
    try {
      const { tokens } = await provider.exchangeCode(String(req.query.code), redirectUri(platform));
      await connectAccount(deps, req.user.id, platform, tokens);
    } catch (err) {
      console.warn(`[connect] ${platform} failed for ${req.user.id}:`, err);
      const msg = (err as Error).message;
      return fail(msg.includes('already connected') || msg.includes('no YouTube channel') ? msg : `Could not connect ${platform}. Please try again.`);
    }
    res.redirect(`${back}${sep}connected=${platform}`);
  }));

  app.post('/api/creator/accounts/:platform/sync', ah(async (req, res) => {
    const platform = platformParam(req);
    const user = requireRole(req, 'creator');
    if (!syncLimiter.check(`${user.id}|${platform}`)) throw new HttpError(429, 'You can refresh each platform 3 times an hour.');
    const account = await deps.store.get<AccountDoc>(C.accounts, accountId(user.id, platform));
    if (!account) throw new HttpError(404, 'Not connected.');
    const r = await syncAccount(deps, account);
    if (!r.ok) throw new HttpError(502, 'Refresh failed. If this keeps happening, reconnect the account.');
    res.json({ ok: true });
  }));

  app.delete('/api/creator/accounts/:platform', ah(async (req, res) => {
    const platform = platformParam(req);
    const user = requireRole(req, 'creator');
    await disconnectAccount(deps, user.id, platform);
    res.json({ ok: true });
  }));

  // ---- Media kit (free for creators) ------------------------------------
  app.get('/api/creator/media-kit.pdf', ah(async (req, res) => {
    const user = requireRole(req, 'creator');
    const c = await deps.store.get<CreatorDoc>(C.creators, user.id);
    const accounts = await deps.store.find<AccountDoc>(C.accounts, [['userId', '==', user.id]]);
    if (!c || !accounts.length) throw new HttpError(400, 'Connect a platform first.');
    const pdf = await renderPdf({ card: buildCard(c, accounts), reports: await loadReports(deps, accounts), kind: 'media_kit', stamp: null, baseUrl: config.baseUrl });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${c.slug}-media-kit.pdf"`);
    res.send(pdf);
  }));

  // ---- Brand profile (company name, for Google sign-ups) -----------------
  app.put('/api/brand/profile', ah(async (req, res) => {
    const user = requireRole(req, 'brand');
    const companyName = str(req.body.companyName, 'Company name', { min: 2, max: 120 });
    const name = req.body.name !== undefined ? str(req.body.name, 'Name', { min: 2, max: 80 }) : user.name;
    await deps.store.patch(C.users, user.id, { companyName, name });
    res.json({ ok: true });
  }));

  // ---- Account deletion (required by Meta, TikTok and Google) ------------
  app.delete('/api/account', ah(async (req, res) => {
    const user = requireUser(req);
    if (req.body?.confirm !== 'DELETE') throw new HttpError(400, 'Type DELETE to confirm.');
    await deleteUserData(deps, user);
    await endSession(deps, req, res);
    res.json({ ok: true });
  }));

}
