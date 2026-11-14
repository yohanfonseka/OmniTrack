import type { Express, NextFunction, Request, Response } from 'express';
import { config } from '../config.js';
import { safeEqual } from '../crypto.js';
import { emails } from '../email.js';
import { flushCounters, interestCounts } from '../directory.js';
import { C, type AccountDetailsDoc, type AccountDoc, type CreatorDoc, type OAuthStateDoc, type SessionDoc, type EmailTokenDoc, type UserDoc } from '../models.js';
import type { Deps } from '../deps.js';
import { syncAll } from '../sync.js';
import { DAY, lastDays, nowIso } from '../util.js';
import { PLATFORM_LABELS } from '../../shared/types.js';
import { ah } from './helpers.js';

/** Cloud Scheduler sends INTERNAL_SECRET in this header. */
function requireInternal(req: Request, res: Response, next: NextFunction) {
  const got = String(req.headers['x-internal-secret'] ?? '');
  if (!config.internalSecret || !safeEqual(got, config.internalSecret)) return res.status(404).json({ error: 'Not found' });
  next();
}

const fmt = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}K` : String(Math.round(n)));

/** Builds the lines of one creator's weekly summary email, or null if there's nothing to say. */
export async function weeklyLines(deps: Deps, c: CreatorDoc): Promise<string[] | null> {
  const accounts = await deps.store.find<AccountDoc>(C.accounts, [['userId', '==', c.id]]);
  if (!accounts.length) return null;
  const details = await deps.store.getMany<AccountDetailsDoc>(C.accountDetails, accounts.map((a) => a.id));
  const weekAgo = lastDays(8)[7];
  const lines: string[] = [];

  let change = 0;
  for (const d of details) {
    const h = d?.history ?? [];
    const now = h[h.length - 1];
    const then = [...h].reverse().find((p) => p.date <= weekAgo);
    if (now && then) change += now.followers - then.followers;
  }
  lines.push(`${change >= 0 ? '+' : ''}${fmt(change)} followers across your platforms`);

  const since = new Date(Date.now() - 7 * DAY).toISOString();
  const recent = details.flatMap((d, i) => (d?.recentPosts ?? []).filter((p) => p.postedAt >= since).map((p) => ({ p, platform: accounts[i].platform })));
  const top = recent.sort((a, b) => (b.p.views ?? b.p.likes) - (a.p.views ?? a.p.likes))[0];
  if (top) {
    lines.push(`Your top ${PLATFORM_LABELS[top.platform]} post this week got ${top.p.views !== null ? `${fmt(top.p.views)} views` : `${fmt(top.p.likes)} likes`}`);
  }
  const interest = await interestCounts(deps, c.id);
  lines.push(`${interest.profileViews7d} profile views and ${interest.searchAppearances7d} search appearances`);
  if (interest.brandsViewedReportThisMonth) lines.push(`${interest.brandsViewedReportThisMonth} brands have viewed your full report this month`);
  const broken = accounts.filter((a) => a.status === 'needs_reconnect');
  if (broken.length) lines.push(`Action needed: reconnect ${broken.map((a) => PLATFORM_LABELS[a.platform]).join(' and ')}`);
  return lines;
}

export function registerInternalRoutes(app: Express, deps: Deps) {
  app.use('/internal', requireInternal);

  /** Daily, from Cloud Scheduler. */
  app.post('/internal/sync', ah(async (_req, res) => {
    const result = await syncAll(deps);
    await flushCounters(deps);
    console.log('[internal] sync', result);
    res.json(result);
  }));

  /** Mondays, from Cloud Scheduler. */
  app.post('/internal/weekly-digest', ah(async (_req, res) => {
    await flushCounters(deps);
    let sent = 0;
    for (const c of await deps.store.all<CreatorDoc>(C.creators)) {
      if (!c.weeklyEmail || c.hidden) continue;
      const user = await deps.store.get<UserDoc>(C.users, c.id);
      if (!user || user.disabled) continue;
      const lines = await weeklyLines(deps, c);
      if (!lines) continue;
      try {
        await deps.mailer.send(emails.weekly(user.email, c.displayName, lines, `${config.baseUrl}/dashboard`));
        sent++;
      } catch (err) {
        console.warn('[weekly] send failed', c.id, err);
      }
    }
    res.json({ sent });
  }));

  /** Daily housekeeping: expired sessions, tokens and OAuth states. */
  app.post('/internal/cleanup', ah(async (_req, res) => {
    const now = nowIso();
    let removed = 0;
    for (const s of await deps.store.all<SessionDoc>(C.sessions)) if (s.expiresAt < now) { await deps.store.delete(C.sessions, s.id); removed++; }
    for (const t of await deps.store.all<EmailTokenDoc>(C.emailTokens)) if (t.expiresAt < now) { await deps.store.delete(C.emailTokens, t.id); removed++; }
    const cutoff = new Date(Date.now() - DAY).toISOString();
    for (const s of await deps.store.all<OAuthStateDoc>(C.oauthStates)) if (s.createdAt < cutoff) { await deps.store.delete(C.oauthStates, s.id); removed++; }
    res.json({ removed });
  }));
}
