import type { AccountTokens } from '../models.js';
import type { Demographics, HistoryPoint, Platform, PostFormat, PostSummary } from '../../shared/types.js';
import type { FetchedData, PlatformProvider } from './types.js';

/** Deterministic pseudo-random numbers from a string seed, so a demo account looks stable between syncs. */
function rng(seed: string) {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

const FORMATS: Record<Platform, PostFormat[]> = {
  instagram: ['reel', 'reel', 'photo', 'carousel'],
  tiktok: ['video'],
  youtube: ['short', 'short', 'long_video'],
};

/**
 * Stand-in for a platform when DEMO_MODE=true and no real credentials are set.
 * Skips the platform's login page and generates realistic-looking numbers.
 * Accounts it creates are flagged demo=true and labelled "Demo data" everywhere.
 */
export class DemoProvider implements PlatformProvider {
  mode = 'demo' as const;
  constructor(public platform: Platform) {}

  authorizeUrl(state: string, redirectUri: string) {
    return `${redirectUri}?code=demo&state=${encodeURIComponent(state)}`;
  }

  async exchangeCode(_code: string) {
    // The access token doubles as the seed for this account's fake data.
    const seed = `${this.platform}-${Math.random().toString(36).slice(2, 8)}`;
    return { tokens: { accessToken: seed, refreshToken: null, accessExpiresAt: null, refreshExpiresAt: null } };
  }

  async refreshIfNeeded(_tokens: AccountTokens) {
    return null;
  }

  async fetchData(tokens: AccountTokens): Promise<FetchedData> {
    const seed = tokens.accessToken;
    const r = rng(seed);
    const day = Math.floor(Date.now() / 86_400_000);
    const base = Math.round(2000 + r() * 120_000);
    // Grows a little every day so the growth chart has something to show.
    const followers = Math.round(base * (1 + ((day % 365) * 0.0012)));
    const er = 1.5 + r() * 6; // engagement rate %
    const handle = `demo_${seed.split('-')[1] ?? 'creator'}`;

    const now = Date.now();
    const posts: PostSummary[] = Array.from({ length: 12 }, (_, i) => {
      const pr = rng(`${seed}-post-${i}`);
      const format = FORMATS[this.platform][Math.floor(pr() * FORMATS[this.platform].length)];
      const interactions = followers * (er / 100) * (0.4 + pr() * 1.4);
      const likes = Math.round(interactions * 0.92);
      const comments = Math.round(interactions * 0.08);
      const hasViews = this.platform !== 'instagram' || format === 'reel';
      return {
        id: `${seed}-${i}`,
        caption: `Demo post ${i + 1}`,
        url: 'https://example.com/demo-post',
        thumbnailUrl: null,
        postedAt: new Date(now - (i * 2.5 + pr()) * 86_400_000).toISOString(),
        format,
        likes,
        comments,
        views: hasViews ? Math.round(followers * (0.3 + pr() * 2.2)) : null,
        shares: this.platform === 'tiktok' ? Math.round(likes * 0.05) : null,
      };
    });

    const demographics: Demographics | null =
      this.platform === 'tiktok'
        ? null
        : {
            age: { '18-24': 34.1, '25-34': 41.6, '35-44': 15.2, '13-17': 4.4, '45-54': 3.5, '55+': 1.2 },
            gender: { Female: Math.round(40 + r() * 30), Male: 0 },
            country: { LK: 64.2, AE: 9.8, GB: 7.1, AU: 6.3, IN: 4.9, QA: 2.6 },
            ...(this.platform === 'instagram' ? { city: { Colombo: 38.5, Kandy: 9.2, Negombo: 6.8, Galle: 5.1, Dubai: 4.7 } } : {}),
          };
    if (demographics?.gender) demographics.gender.Male = Math.round((100 - demographics.gender.Female) * 10) / 10;

    let historyBackfill: HistoryPoint[] | null = null;
    if (this.platform === 'youtube') {
      historyBackfill = Array.from({ length: 180 }, (_, i) => {
        const d = new Date(now - (180 - i) * 86_400_000);
        return { date: d.toISOString().slice(0, 10), followers: Math.round(followers * (0.8 + (i / 180) * 0.2)), engagementRate: null };
      });
    }

    return {
      profile: {
        externalId: seed,
        username: handle,
        displayName: `Demo ${this.platform}`,
        avatarUrl: null,
        profileUrl: 'https://example.com/demo-profile',
        followers,
        postsCount: Math.round(80 + r() * 600),
      },
      posts,
      demographics,
      youtube:
        this.platform === 'youtube'
          ? { totalViews: followers * 140, views28d: followers * 6, watchMinutes28d: followers * 9, avgViewDurationSec: Math.round(45 + r() * 200) }
          : null,
      historyBackfill,
    };
  }
}
