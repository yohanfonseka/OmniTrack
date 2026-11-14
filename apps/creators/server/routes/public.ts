import type { Express, Request } from 'express';
import { config } from '../config.js';
import { isAdmin, requireRole } from '../auth.js';
import { buildCard, bump, recordReportView, searchDirectory } from '../directory.js';
import { C, type AccountDoc, type BrandViewDoc, type CreatorDoc, type InviteDoc, type UserDoc } from '../models.js';
import type { Deps } from '../deps.js';
import { renderPdf } from '../pdf.js';
import { HttpError, nowIso } from '../util.js';
import type { CreatorProfilePage, DirectoryQuery, ProfileAccess } from '../../shared/types.js';
import { loadReports } from './creator.js';
import { ah } from './helpers.js';

const num = (v: unknown) => (v === undefined || v === '' ? undefined : Number(v) || undefined);

export function accessFor(viewer: UserDoc | null | undefined, creatorId: string): ProfileAccess {
  if (!viewer) return 'locked_visitor';
  if (viewer.id === creatorId) return 'owner';
  if (isAdmin(viewer)) return 'full';
  if (viewer.role === 'brand') return viewer.emailVerified ? 'full' : 'locked_unverified';
  return 'locked_creator';
}

export async function findCreatorBySlug(deps: Deps, slug: string) {
  const [c] = await deps.store.find<CreatorDoc>(C.creators, [['slug', '==', slug.toLowerCase()]], 1);
  return c ?? null;
}

export function registerPublicRoutes(app: Express, deps: Deps) {
  app.get('/api/creators', ah(async (req, res) => {
    const q: DirectoryQuery = {
      q: typeof req.query.q === 'string' ? req.query.q.slice(0, 100) : undefined,
      category: typeof req.query.category === 'string' ? req.query.category : undefined,
      platform: typeof req.query.platform === 'string' ? req.query.platform : undefined,
      minFollowers: num(req.query.minFollowers),
      maxFollowers: num(req.query.maxFollowers),
      minEngagement: num(req.query.minEngagement),
      location: typeof req.query.location === 'string' ? req.query.location.slice(0, 60) : undefined,
      sort: ['followers', 'engagement', 'recent'].includes(String(req.query.sort)) ? (req.query.sort as DirectoryQuery['sort']) : undefined,
    };
    const page = Math.max(1, Math.min(500, Number(req.query.page) || 1));
    res.json(await searchDirectory(deps, q, page));
  }));

  app.get('/api/creators/:slug', ah(async (req, res) => {
    const c = await findCreatorBySlug(deps, req.params.slug);
    const access = c ? accessFor(req.user, c.id) : 'locked_visitor';
    if (!c || (c.hidden && access !== 'owner' && !isAdmin(req.user))) throw new HttpError(404, 'Creator not found.');
    const accounts = await deps.store.find<AccountDoc>(C.accounts, [['userId', '==', c.id]]);
    // "See how brands see you": the owner can preview the locked view.
    const effective: ProfileAccess = access === 'owner' && req.query.preview === 'public' ? 'locked_visitor' : access;
    const unlocked = effective === 'owner' || effective === 'full';

    if (access !== 'owner') bump(c.id, 'profileViews');
    if (unlocked && req.user && req.user.role === 'brand' && accounts.length) await recordReportView(deps, req.user.id, c.id);

    const page: CreatorProfilePage = {
      ...buildCard(c, accounts),
      access: effective,
      reports: unlocked ? await loadReports(deps, accounts) : null,
    };
    res.json(page);
  }));

  app.get('/api/creators/:slug/report.pdf', ah(async (req: Request, res) => {
    const c = await findCreatorBySlug(deps, req.params.slug);
    if (!c || c.hidden) throw new HttpError(404, 'Creator not found.');
    const access = accessFor(req.user, c.id);
    if (access === 'owner') return res.redirect('/api/creator/media-kit.pdf');
    if (access !== 'full') throw new HttpError(403, 'Sign up as a brand and verify your email to download reports.');
    const viewer = req.user!;
    const accounts = await deps.store.find<AccountDoc>(C.accounts, [['userId', '==', c.id]]);
    if (!accounts.length) throw new HttpError(400, 'This creator has no connected platforms yet.');
    const when = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    const who = viewer.companyName ? `${viewer.companyName} (${viewer.name})` : viewer.name;
    const pdf = await renderPdf({
      card: buildCard(c, accounts), reports: await loadReports(deps, accounts), kind: 'report',
      stamp: `Prepared for ${who} · downloaded ${when} · not for redistribution`, baseUrl: config.baseUrl,
    });
    if (viewer.role === 'brand') await recordReportView(deps, viewer.id, c.id, 'pdf');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${c.slug}-creatortrack-report.pdf"`);
    res.send(pdf);
  }));

  /** Invite landing page: shows the name and marks the invite opened. */
  app.get('/api/invites/:token', ah(async (req, res) => {
    const invite = await deps.store.get<InviteDoc>(C.invites, req.params.token);
    if (!invite || invite.status === 'cancelled') throw new HttpError(404, 'This invitation is not valid.');
    if (invite.expiresAt < nowIso() && ['sent', 'opened'].includes(invite.status)) throw new HttpError(410, 'This invitation has expired. Ask for a new one, or sign up below.');
    if (['signed_up', 'connected'].includes(invite.status)) throw new HttpError(409, 'This invitation has already been used. Please sign in.');
    if (invite.status === 'sent') await deps.store.patch(C.invites, invite.token, { status: 'opened', openedAt: nowIso() });
    res.json({ name: invite.name, email: invite.email });
  }));

  app.get('/api/referrals/:code', ah(async (req, res) => {
    const [c] = await deps.store.find<CreatorDoc>(C.creators, [['referralCode', '==', req.params.code.toLowerCase()]], 1);
    if (!c) throw new HttpError(404, 'This invite link is not valid.');
    res.json({ referrerName: c.displayName, code: c.referralCode });
  }));

  /** Brand home: creators this brand has opened recently. */
  app.get('/api/brand/recent', ah(async (req, res) => {
    const user = requireRole(req, 'brand');
    const views = (await deps.store.find<BrandViewDoc>(C.brandViews, [['brandId', '==', user.id]]))
      .sort((a, b) => b.lastViewedAt.localeCompare(a.lastViewedAt))
      .slice(0, 12);
    const creators = await deps.store.getMany<CreatorDoc>(C.creators, views.map((v) => v.creatorId));
    const items = [];
    for (let i = 0; i < views.length; i++) {
      const c = creators[i];
      if (!c || c.hidden) continue;
      const accounts = await deps.store.find<AccountDoc>(C.accounts, [['userId', '==', c.id]]);
      items.push({ card: buildCard(c, accounts), lastViewedAt: views[i].lastViewedAt });
    }
    res.json({ items });
  }));
}
