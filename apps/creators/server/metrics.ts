import type { HistoryPoint, PostSummary, PublicStats } from '../shared/types.js';

const round = (n: number, dp = 2) => Math.round(n * 10 ** dp) / 10 ** dp;

/** How many recent posts the headline averages use. */
export const RECENT_POSTS_FOR_AVERAGES = 12;

/**
 * Engagement rate = (likes + comments) / followers, averaged over the most
 * recent posts, as a percentage. Same formula on every platform.
 */
export function computeStats(followers: number, postsCount: number, posts: PostSummary[]): PublicStats {
  const recent = [...posts].sort((a, b) => b.postedAt.localeCompare(a.postedAt)).slice(0, RECENT_POSTS_FOR_AVERAGES);
  const n = recent.length;
  const avg = (f: (p: PostSummary) => number) => (n ? recent.reduce((s, p) => s + f(p), 0) / n : 0);
  const withViews = recent.filter((p) => p.views !== null);
  return {
    followers,
    posts: postsCount,
    avgLikes: Math.round(avg((p) => p.likes)),
    avgComments: Math.round(avg((p) => p.comments)),
    engagementRate: followers > 0 && n ? round(avg((p) => ((p.likes + p.comments) / followers) * 100)) : 0,
    avgViews: withViews.length ? Math.round(withViews.reduce((s, p) => s + (p.views ?? 0), 0) / withViews.length) : null,
  };
}

const MAX_HISTORY = 1100;

/** Merges a platform-provided backfill and today's point into the stored daily history. */
export function mergeHistory(existing: HistoryPoint[], backfill: HistoryPoint[] | null, today: HistoryPoint): HistoryPoint[] {
  const byDate = new Map<string, HistoryPoint>();
  for (const p of backfill ?? []) byDate.set(p.date, p);
  // Our own snapshots win over the backfill: they include engagement rate.
  for (const p of existing) byDate.set(p.date, p);
  byDate.set(today.date, today);
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date)).slice(-MAX_HISTORY);
}
