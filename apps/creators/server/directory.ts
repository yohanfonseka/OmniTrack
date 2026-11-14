import { C, type AccountDoc, type CreatorDailyDoc, type CreatorDoc, type ReportViewersDoc, type BrandViewDoc } from './models.js';
import type { Deps } from './deps.js';
import { lastDays, lkDay, lkMonth, nowIso } from './util.js';
import type { CreatorCard, DirectoryQuery, InterestCounts, PublicAccount } from '../shared/types.js';
import { PLATFORMS } from '../shared/types.js';

/** Friends a creator must bring in to earn the Community Builder badge. */
export const COMMUNITY_BUILDER_THRESHOLD = 5;

export function toPublicAccount(a: AccountDoc): PublicAccount {
  return {
    platform: a.platform,
    username: a.username,
    displayName: a.displayName,
    avatarUrl: a.avatarUrl,
    profileUrl: a.profileUrl,
    stats: a.stats,
    lastVerifiedAt: a.lastSyncedAt,
    status: a.status,
    demo: a.demo,
  };
}

export function buildCard(c: CreatorDoc, accounts: AccountDoc[]): CreatorCard {
  const pub = accounts
    .map(toPublicAccount)
    .sort((a, b) => PLATFORMS.indexOf(a.platform) - PLATFORMS.indexOf(b.platform));
  return {
    id: c.id,
    slug: c.slug,
    displayName: c.displayName,
    bio: c.bio,
    categories: c.categories,
    country: c.country,
    city: c.city,
    totalFollowers: pub.reduce((s, a) => s + (a.stats?.followers ?? 0), 0),
    communityBuilder: c.friendsJoined >= COMMUNITY_BUILDER_THRESHOLD,
    accounts: pub,
  };
}

// ---------------------------------------------------------------------------
// Directory cache. Every search would otherwise read every creator document;
// caching for a short time keeps Firestore reads (and cost) flat.
// ---------------------------------------------------------------------------
const TTL_MS = 2 * 60_000;
let cache: { at: number; cards: CreatorCard[] } | null = null;

export function invalidateDirectory() {
  cache = null;
}

async function listedCards(deps: Deps): Promise<CreatorCard[]> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.cards;
  const [creators, accounts] = await Promise.all([
    deps.store.all<CreatorDoc>(C.creators),
    deps.store.all<AccountDoc>(C.accounts),
  ]);
  const byUser = new Map<string, AccountDoc[]>();
  for (const a of accounts) byUser.set(a.userId, [...(byUser.get(a.userId) ?? []), a]);
  const cards = creators
    .filter((c) => !c.hidden && byUser.has(c.id))
    .map((c) => buildCard(c, byUser.get(c.id)!));
  cache = { at: Date.now(), cards };
  return cards;
}

export const PAGE_SIZE = 24;

export async function searchDirectory(deps: Deps, q: DirectoryQuery, page = 1) {
  const text = q.q?.trim().toLowerCase();
  const location = q.location?.trim().toLowerCase();
  const platform = PLATFORMS.find((p) => p === q.platform);

  const followersOf = (c: CreatorCard) =>
    platform ? c.accounts.find((a) => a.platform === platform)?.stats?.followers ?? 0 : c.totalFollowers;
  const engagementOf = (c: CreatorCard) => {
    const accs = platform ? c.accounts.filter((a) => a.platform === platform) : c.accounts;
    return Math.max(0, ...accs.map((a) => a.stats?.engagementRate ?? 0));
  };

  let results = (await listedCards(deps)).filter((c) => {
    if (platform && !c.accounts.some((a) => a.platform === platform)) return false;
    if (q.category && !c.categories.includes(q.category as any)) return false;
    if (q.minFollowers && followersOf(c) < q.minFollowers) return false;
    if (q.maxFollowers && followersOf(c) > q.maxFollowers) return false;
    if (q.minEngagement && engagementOf(c) < q.minEngagement) return false;
    if (location && !`${c.city} ${c.country}`.toLowerCase().includes(location)) return false;
    if (text) {
      const hay = [c.displayName, c.bio, c.slug, ...c.accounts.map((a) => a.username)].join(' ').toLowerCase();
      if (!hay.includes(text)) return false;
    }
    return true;
  });

  const sort = q.sort ?? 'followers';
  results = results.sort((a, b) => {
    if (sort === 'engagement') return engagementOf(b) - engagementOf(a);
    if (sort === 'recent') {
      const last = (c: CreatorCard) => c.accounts.map((x) => x.lastVerifiedAt ?? '').sort().pop() ?? '';
      return last(b).localeCompare(last(a));
    }
    return followersOf(b) - followersOf(a);
  });

  const total = results.length;
  const items = results.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  for (const c of items) bump(c.id, 'searchAppearances');
  return { total, page, pageSize: PAGE_SIZE, items };
}

export async function directoryStats(deps: Deps) {
  return { listedCreators: (await listedCards(deps)).length };
}

// ---------------------------------------------------------------------------
// Profile-view and search-appearance counters. Buffered in memory and written
// once a minute, so a busy search page doesn't cost a write per result.
// ---------------------------------------------------------------------------
type Counter = 'profileViews' | 'searchAppearances';
const buffer = new Map<string, { creatorId: string; day: string; profileViews: number; searchAppearances: number }>();

export function bump(creatorId: string, counter: Counter) {
  const day = lkDay();
  const key = `${creatorId}_${day}`;
  const entry = buffer.get(key) ?? { creatorId, day, profileViews: 0, searchAppearances: 0 };
  entry[counter]++;
  buffer.set(key, entry);
}

export async function flushCounters(deps: Deps) {
  const entries = [...buffer.entries()];
  buffer.clear();
  for (const [id, e] of entries) {
    try {
      await deps.store.mutate<CreatorDailyDoc>(C.creatorDaily, id, (cur) => ({
        id,
        creatorId: e.creatorId,
        day: e.day,
        profileViews: (cur?.profileViews ?? 0) + e.profileViews,
        searchAppearances: (cur?.searchAppearances ?? 0) + e.searchAppearances,
      }));
    } catch (err) {
      console.warn('[counters] flush failed, will retry', err);
      const back = buffer.get(id) ?? { ...e, profileViews: 0, searchAppearances: 0 };
      back.profileViews += e.profileViews;
      back.searchAppearances += e.searchAppearances;
      buffer.set(id, back);
    }
  }
}

/**
 * Records a brand opening a creator's full report: feeds the creator's
 * "brands viewed your report" count now, and the paid-report limits later.
 */
export async function recordReportView(deps: Deps, brandId: string, creatorId: string, kind: 'view' | 'pdf' = 'view') {
  const month = lkMonth();
  await deps.store.mutate<ReportViewersDoc>(C.reportViewers, `${creatorId}_${month}`, (cur) => {
    const brandIds = cur?.brandIds ?? [];
    if (brandIds.includes(brandId)) return cur;
    return { id: `${creatorId}_${month}`, creatorId, month, brandIds: [...brandIds, brandId] };
  });
  const id = `${brandId}_${creatorId}`;
  await deps.store.mutate<BrandViewDoc>(C.brandViews, id, (cur) => ({
    id,
    brandId,
    creatorId,
    firstViewedAt: cur?.firstViewedAt ?? nowIso(),
    lastViewedAt: nowIso(),
    views: (cur?.views ?? 0) + (kind === 'view' ? 1 : 0),
    pdfDownloads: (cur?.pdfDownloads ?? 0) + (kind === 'pdf' ? 1 : 0),
  }));
}

export async function interestCounts(deps: Deps, creatorId: string): Promise<InterestCounts> {
  const days = lastDays(30);
  const docs = await deps.store.getMany<CreatorDailyDoc>(C.creatorDaily, days.map((d) => `${creatorId}_${d}`));
  const sum = (field: Counter, n: number) =>
    days.slice(0, n).reduce((s, d, i) => s + (docs[i]?.[field] ?? 0) + (buffer.get(`${creatorId}_${d}`)?.[field] ?? 0), 0);
  const viewers = await deps.store.get<ReportViewersDoc>(C.reportViewers, `${creatorId}_${lkMonth()}`);
  return {
    profileViews7d: sum('profileViews', 7),
    profileViews30d: sum('profileViews', 30),
    searchAppearances7d: sum('searchAppearances', 7),
    searchAppearances30d: sum('searchAppearances', 30),
    brandsViewedReportThisMonth: viewers?.brandIds.length ?? 0,
  };
}
