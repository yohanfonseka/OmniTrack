import { config } from './config.js';
import { decrypt, encrypt } from './crypto.js';
import { emails } from './email.js';
import { invalidateDirectory } from './directory.js';
import { computeStats, mergeHistory } from './metrics.js';
import { C, type AccountDetailsDoc, type AccountDoc, type AccountTokens, type CreatorDoc, type InviteDoc, type UserDoc } from './models.js';
import type { Deps } from './deps.js';
import { AuthError, type FetchedData } from './providers/types.js';
import { DAY, lkDay, nowIso } from './util.js';
import { PLATFORM_LABELS, type Platform } from '../shared/types.js';

export const accountId = (userId: string, platform: Platform) => `${userId}_${platform}`;

/** Writes freshly fetched data onto the account and its details document. */
async function applyData(deps: Deps, account: AccountDoc, data: FetchedData) {
  const stats = computeStats(data.profile.followers, data.profile.postsCount, data.posts);
  const prev = await deps.store.get<AccountDetailsDoc>(C.accountDetails, account.id);
  const details: AccountDetailsDoc = {
    id: account.id,
    recentPosts: [...data.posts].sort((a, b) => b.postedAt.localeCompare(a.postedAt)).slice(0, 20),
    // Platforms sometimes omit demographics on a given day; keep the last known breakdown.
    demographics: data.demographics ?? prev?.demographics ?? null,
    youtube: data.youtube ?? prev?.youtube ?? null,
    history: mergeHistory(prev?.history ?? [], data.historyBackfill, {
      date: lkDay(),
      followers: stats.followers,
      engagementRate: stats.engagementRate,
    }),
  };
  await deps.store.set(C.accountDetails, account.id, details);
  const updated: AccountDoc = {
    ...account,
    externalId: data.profile.externalId,
    username: data.profile.username,
    displayName: data.profile.displayName,
    avatarUrl: data.profile.avatarUrl,
    profileUrl: data.profile.profileUrl,
    stats,
    status: 'active',
    lastSyncedAt: nowIso(),
    lastError: null,
    reconnectEmailSentAt: null,
  };
  await deps.store.set(C.accounts, account.id, updated);
  invalidateDirectory();
  return updated;
}

/** Refreshes tokens if needed, pulls data, and records the result. Never throws. */
export async function syncAccount(deps: Deps, account: AccountDoc): Promise<{ ok: boolean; error?: string }> {
  const provider = deps.providers.platforms[account.platform];
  if (!provider) return { ok: false, error: 'platform not configured' };
  if (account.demo !== (provider.mode === 'demo')) return { ok: false, error: 'provider mode changed; reconnect required' };
  try {
    let tokens = JSON.parse(decrypt(account.tokens)) as AccountTokens;
    const refreshed = await provider.refreshIfNeeded(tokens);
    if (refreshed) {
      tokens = refreshed;
      account = { ...account, tokens: encrypt(JSON.stringify(tokens)) };
      await deps.store.patch(C.accounts, account.id, { tokens: account.tokens });
    }
    await applyData(deps, account, await provider.fetchData(tokens));
    return { ok: true };
  } catch (err) {
    const message = (err as Error).message.slice(0, 500);
    if (err instanceof AuthError) {
      await markNeedsReconnect(deps, account, message);
    } else {
      await deps.store.patch(C.accounts, account.id, { lastError: message });
    }
    console.warn(`[sync] ${account.id} failed: ${message}`);
    return { ok: false, error: message };
  }
}

async function markNeedsReconnect(deps: Deps, account: AccountDoc, message: string) {
  const recentlyEmailed = account.reconnectEmailSentAt && Date.parse(account.reconnectEmailSentAt) > Date.now() - 7 * DAY;
  await deps.store.patch(C.accounts, account.id, {
    status: 'needs_reconnect',
    lastError: message,
    ...(recentlyEmailed ? {} : { reconnectEmailSentAt: nowIso() }),
  });
  invalidateDirectory();
  if (recentlyEmailed) return;
  const user = await deps.store.get<UserDoc>(C.users, account.userId);
  if (user) {
    const label = PLATFORM_LABELS[account.platform];
    await deps.mailer
      .send(emails.reconnect(user.email, user.name, label, `${config.baseUrl}/dashboard?reconnect=${account.platform}`))
      .catch((e) => console.warn('[sync] reconnect email failed', e));
  }
}

/** Saves a newly authorised connection and pulls its first data. */
export async function connectAccount(deps: Deps, userId: string, platform: Platform, tokens: AccountTokens) {
  const provider = deps.providers.platforms[platform]!;
  const data = await provider.fetchData(tokens);

  // One platform account can only belong to one creator.
  const dupes = await deps.store.find<AccountDoc>(C.accounts, [['externalId', '==', data.profile.externalId]]);
  if (dupes.some((a) => a.platform === platform && a.userId !== userId && !a.demo)) {
    throw new Error(`This ${PLATFORM_LABELS[platform]} account is already connected to another CreatorTrack profile.`);
  }

  const id = accountId(userId, platform);
  const existing = await deps.store.get<AccountDoc>(C.accounts, id);
  if (existing && existing.externalId !== data.profile.externalId) {
    // A different account on the same platform: drop the old one's data.
    await deps.store.delete(C.accountDetails, id);
  }
  const account: AccountDoc = {
    id,
    userId,
    platform,
    externalId: data.profile.externalId,
    username: data.profile.username,
    displayName: data.profile.displayName,
    avatarUrl: data.profile.avatarUrl,
    profileUrl: data.profile.profileUrl,
    tokens: encrypt(JSON.stringify(tokens)),
    status: 'active',
    demo: provider.mode === 'demo',
    stats: null,
    connectedAt: existing?.connectedAt ?? nowIso(),
    lastSyncedAt: null,
    lastError: null,
    reconnectEmailSentAt: null,
  };
  await deps.store.set(C.accounts, id, account);
  await applyData(deps, account, data);
  await onFirstConnection(deps, userId);
}

/** Credits the referrer and moves the invite to "connected" the first time a creator connects anything. */
async function onFirstConnection(deps: Deps, userId: string) {
  const user = await deps.store.get<UserDoc>(C.users, userId);
  if (!user) return;
  if (user.inviteToken) {
    const invite = await deps.store.get<InviteDoc>(C.invites, user.inviteToken);
    if (invite && invite.status !== 'connected') await deps.store.patch(C.invites, invite.token, { status: 'connected' });
  }
  if (user.referredBy && !user.referralCredited) {
    await deps.store.patch(C.users, userId, { referralCredited: true });
    await deps.store.mutate<CreatorDoc>(C.creators, user.referredBy, (c) => (c ? { ...c, friendsJoined: c.friendsJoined + 1 } : null));
    invalidateDirectory();
  }
}

export async function disconnectAccount(deps: Deps, userId: string, platform: Platform) {
  const id = accountId(userId, platform);
  await deps.store.delete(C.accounts, id);
  await deps.store.delete(C.accountDetails, id);
  invalidateDirectory();
}

/** The daily job: syncs every account, a few at a time. */
export async function syncAll(deps: Deps, concurrency = 4) {
  const accounts = await deps.store.all<AccountDoc>(C.accounts);
  const today = lkDay();
  // Skip accounts already synced today (e.g. just connected) to save API quota.
  const queue = accounts.filter((a) => !a.lastSyncedAt || lkDay(new Date(a.lastSyncedAt)) !== today || a.status !== 'active');
  let ok = 0;
  let failed = 0;
  const worker = async () => {
    for (let a = queue.shift(); a; a = queue.shift()) {
      const r = await syncAccount(deps, a);
      r.ok ? ok++ : failed++;
    }
  };
  await Promise.all(Array.from({ length: concurrency }, worker));
  return { total: accounts.length, synced: ok, failed, skipped: accounts.length - ok - failed };
}
