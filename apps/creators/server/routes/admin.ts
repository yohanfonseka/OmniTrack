import type { Express } from 'express';
import { config } from '../config.js';
import { requireAdmin } from '../auth.js';
import { shortCode } from '../crypto.js';
import { emails } from '../email.js';
import { invalidateDirectory } from '../directory.js';
import { C, type AccountDoc, type BrandViewDoc, type CreatorDoc, type InviteDoc, type UserDoc } from '../models.js';
import type { Deps } from '../deps.js';
import { addMs, DAY, HttpError, nowIso } from '../util.js';
import { isValidEmail } from '../../shared/disposable.js';
import type { Invite } from '../../shared/types.js';
import { ah, str } from './helpers.js';

const INVITE_DAYS = 14;
export const ITERATION_2_TARGET = 100;

function toInvite(i: InviteDoc): Invite {
  const expired = i.expiresAt < nowIso() && (i.status === 'sent' || i.status === 'opened');
  return {
    token: i.token, name: i.name, email: i.email, phone: i.phone, status: expired ? 'expired' : i.status,
    createdAt: i.createdAt, expiresAt: i.expiresAt, openedAt: i.openedAt, creatorId: i.creatorId,
  };
}

export const inviteUrl = (token: string) => `${config.baseUrl}/join/${token}`;

async function createInvite(deps: Deps, adminId: string, row: { name: unknown; email?: unknown; phone?: unknown }, sendEmail: boolean) {
  const name = str(row.name, 'Name', { min: 1, max: 80 });
  const email = str(row.email, 'Email', { max: 254, optional: true }).toLowerCase();
  if (email && !isValidEmail(email)) throw new HttpError(400, `"${email}" is not a valid email.`);
  const phone = str(row.phone, 'Phone', { max: 30, optional: true }).replace(/[^\d+]/g, '');
  const invite: InviteDoc = {
    token: shortCode(8), name, email, phone, status: 'sent', createdBy: adminId,
    createdAt: nowIso(), expiresAt: addMs(INVITE_DAYS * DAY), openedAt: null, creatorId: null,
  };
  await deps.store.set(C.invites, invite.token, invite);
  if (sendEmail && email) await deps.mailer.send(emails.invite(email, name, inviteUrl(invite.token)));
  return invite;
}

export function registerAdminRoutes(app: Express, deps: Deps) {
  app.get('/api/admin/overview', ah(async (req, res) => {
    requireAdmin(req);
    const [users, accounts, views] = await Promise.all([
      deps.store.all<UserDoc>(C.users),
      deps.store.all<AccountDoc>(C.accounts),
      deps.store.all<BrandViewDoc>(C.brandViews),
    ]);
    const connected = new Set(accounts.filter((a) => !a.demo).map((a) => a.userId));
    const brands = users.filter((u) => u.role === 'brand');
    res.json({
      creatorsSignedUp: users.filter((u) => u.role === 'creator').length,
      creatorsConnected: connected.size,
      creatorsConnectedIncludingDemo: new Set(accounts.map((a) => a.userId)).size,
      iteration2Target: ITERATION_2_TARGET,
      brands: brands.length,
      verifiedBrands: brands.filter((u) => u.emailVerified).length,
      reportViews: views.reduce((s, v) => s + v.views, 0),
      pdfDownloads: views.reduce((s, v) => s + v.pdfDownloads, 0),
      accountsByPlatform: {
        instagram: accounts.filter((a) => a.platform === 'instagram').length,
        tiktok: accounts.filter((a) => a.platform === 'tiktok').length,
        youtube: accounts.filter((a) => a.platform === 'youtube').length,
      },
      needsReconnect: accounts.filter((a) => a.status === 'needs_reconnect').length,
    });
  }));

  app.get('/api/admin/creators', ah(async (req, res) => {
    requireAdmin(req);
    const [creators, users, accounts] = await Promise.all([
      deps.store.all<CreatorDoc>(C.creators), deps.store.all<UserDoc>(C.users), deps.store.all<AccountDoc>(C.accounts),
    ]);
    const userById = new Map(users.map((u) => [u.id, u]));
    const items = creators.map((c) => {
      const u = userById.get(c.id);
      const accs = accounts.filter((a) => a.userId === c.id);
      return {
        id: c.id, slug: c.slug, displayName: c.displayName, email: u?.email ?? '', emailVerified: !!u?.emailVerified,
        disabled: !!u?.disabled, hidden: c.hidden, categories: c.categories, city: c.city, createdAt: c.createdAt,
        friendsJoined: c.friendsJoined,
        platforms: accs.map((a) => ({ platform: a.platform, username: a.username, followers: a.stats?.followers ?? 0, status: a.status, demo: a.demo })),
      };
    }).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    res.json({ items });
  }));

  app.get('/api/admin/brands', ah(async (req, res) => {
    requireAdmin(req);
    const [users, views] = await Promise.all([deps.store.all<UserDoc>(C.users), deps.store.all<BrandViewDoc>(C.brandViews)]);
    const items = users.filter((u) => u.role === 'brand').map((u) => {
      const v = views.filter((x) => x.brandId === u.id);
      return {
        id: u.id, name: u.name, companyName: u.companyName, email: u.email, emailVerified: u.emailVerified,
        disabled: u.disabled, createdAt: u.createdAt, creatorsViewed: v.length, pdfDownloads: v.reduce((s, x) => s + x.pdfDownloads, 0),
      };
    }).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    res.json({ items });
  }));

  app.patch('/api/admin/creators/:id', ah(async (req, res) => {
    requireAdmin(req);
    if (typeof req.body.hidden !== 'boolean') throw new HttpError(400, 'hidden must be true or false.');
    const c = await deps.store.get<CreatorDoc>(C.creators, req.params.id);
    if (!c) throw new HttpError(404, 'Creator not found.');
    await deps.store.patch(C.creators, c.id, { hidden: req.body.hidden });
    invalidateDirectory();
    res.json({ ok: true });
  }));

  app.patch('/api/admin/users/:id', ah(async (req, res) => {
    const admin = requireAdmin(req);
    if (typeof req.body.disabled !== 'boolean') throw new HttpError(400, 'disabled must be true or false.');
    if (req.params.id === admin.id) throw new HttpError(400, "You can't disable your own account.");
    const u = await deps.store.get<UserDoc>(C.users, req.params.id);
    if (!u) throw new HttpError(404, 'User not found.');
    await deps.store.patch(C.users, u.id, { disabled: req.body.disabled });
    if (req.body.disabled) {
      for (const s of await deps.store.find<{ id: string }>(C.sessions, [['userId', '==', u.id]])) await deps.store.delete(C.sessions, s.id);
    }
    invalidateDirectory();
    res.json({ ok: true });
  }));

  // ---- Invitations --------------------------------------------------------
  app.get('/api/admin/invites', ah(async (req, res) => {
    requireAdmin(req);
    const items = (await deps.store.all<InviteDoc>(C.invites)).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(toInvite);
    res.json({ items, baseUrl: config.baseUrl });
  }));

  app.post('/api/admin/invites', ah(async (req, res) => {
    const admin = requireAdmin(req);
    const invite = await createInvite(deps, admin.id, req.body, req.body.sendEmail !== false);
    res.status(201).json({ invite: toInvite(invite), url: inviteUrl(invite.token) });
  }));

  app.post('/api/admin/invites/bulk', ah(async (req, res) => {
    const admin = requireAdmin(req);
    const rows = Array.isArray(req.body.rows) ? req.body.rows : [];
    if (!rows.length) throw new HttpError(400, 'No rows to import.');
    if (rows.length > 500) throw new HttpError(400, 'At most 500 invites at a time.');
    const created: Invite[] = [];
    const errors: { row: number; error: string }[] = [];
    for (let i = 0; i < rows.length; i++) {
      try {
        created.push(toInvite(await createInvite(deps, admin.id, rows[i], req.body.sendEmail === true)));
      } catch (err) {
        errors.push({ row: i + 1, error: (err as Error).message });
      }
    }
    res.status(201).json({ created, errors });
  }));

  app.post('/api/admin/invites/:token/resend', ah(async (req, res) => {
    requireAdmin(req);
    const i = await deps.store.get<InviteDoc>(C.invites, req.params.token);
    if (!i) throw new HttpError(404, 'Invite not found.');
    if (['signed_up', 'connected'].includes(i.status)) throw new HttpError(409, 'This creator has already signed up.');
    const next = { ...i, status: 'sent' as const, expiresAt: addMs(INVITE_DAYS * DAY) };
    await deps.store.set(C.invites, i.token, next);
    if (i.email && req.body.sendEmail !== false) await deps.mailer.send(emails.invite(i.email, i.name, inviteUrl(i.token)));
    res.json({ invite: toInvite(next) });
  }));

  app.post('/api/admin/invites/:token/cancel', ah(async (req, res) => {
    requireAdmin(req);
    const i = await deps.store.get<InviteDoc>(C.invites, req.params.token);
    if (!i) throw new HttpError(404, 'Invite not found.');
    if (['signed_up', 'connected'].includes(i.status)) throw new HttpError(409, 'This invite has already been used.');
    await deps.store.patch(C.invites, i.token, { status: 'cancelled' });
    res.json({ ok: true });
  }));

  app.get('/api/admin/referrers', ah(async (req, res) => {
    requireAdmin(req);
    const items = (await deps.store.all<CreatorDoc>(C.creators))
      .filter((c) => c.friendsJoined > 0)
      .sort((a, b) => b.friendsJoined - a.friendsJoined)
      .slice(0, 50)
      .map((c) => ({ id: c.id, slug: c.slug, displayName: c.displayName, friendsJoined: c.friendsJoined }));
    res.json({ items });
  }));
}
