import { config } from '../config.js';
import type { AccountTokens } from '../models.js';
import type { Demographics, PostFormat, PostSummary } from '../../shared/types.js';
import { AuthError, fetchJson, form, toPercentages, type FetchedData, type PlatformProvider } from './types.js';

/**
 * Instagram API with Instagram Login (Creator / Business accounts).
 * https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login
 */
const GRAPH = 'https://graph.instagram.com/v23.0';
const SCOPES = ['instagram_business_basic', 'instagram_business_manage_insights'];
const DAY_MS = 86_400_000;

function format(m: any): PostFormat {
  if (m.media_product_type === 'REELS') return 'reel';
  if (m.media_type === 'CAROUSEL_ALBUM') return 'carousel';
  if (m.media_type === 'VIDEO') return 'reel';
  return 'photo';
}

export class InstagramProvider implements PlatformProvider {
  platform = 'instagram' as const;
  mode = 'live' as const;

  authorizeUrl(state: string, redirectUri: string) {
    const p = new URLSearchParams({
      client_id: config.instagram.appId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: SCOPES.join(','),
      state,
    });
    return `https://www.instagram.com/oauth/authorize?${p}`;
  }

  async exchangeCode(code: string, redirectUri: string) {
    const short = await fetchJson<{ access_token: string }>(
      'https://api.instagram.com/oauth/access_token',
      form({
        client_id: config.instagram.appId,
        client_secret: config.instagram.appSecret,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
        code,
      }),
    );
    // Swap the 1-hour token for a 60-day one.
    const long = await fetchJson<{ access_token: string; expires_in: number }>(
      `https://graph.instagram.com/access_token?${new URLSearchParams({
        grant_type: 'ig_exchange_token',
        client_secret: config.instagram.appSecret,
        access_token: short.access_token,
      })}`,
    );
    return {
      tokens: {
        accessToken: long.access_token,
        refreshToken: null,
        accessExpiresAt: new Date(Date.now() + long.expires_in * 1000).toISOString(),
        refreshExpiresAt: null,
      },
    };
  }

  async refreshIfNeeded(tokens: AccountTokens) {
    const expires = tokens.accessExpiresAt ? Date.parse(tokens.accessExpiresAt) : 0;
    if (expires && expires < Date.now()) throw new AuthError('Instagram token expired');
    // Long-lived tokens can be refreshed once they are 24h old; refresh when <30 days remain.
    if (expires - Date.now() > 30 * DAY_MS) return null;
    const r = await fetchJson<{ access_token: string; expires_in: number }>(
      `https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=${encodeURIComponent(tokens.accessToken)}`,
    );
    return { ...tokens, accessToken: r.access_token, accessExpiresAt: new Date(Date.now() + r.expires_in * 1000).toISOString() };
  }

  async fetchData(tokens: AccountTokens): Promise<FetchedData> {
    const t = encodeURIComponent(tokens.accessToken);
    const me = await fetchJson<any>(
      `${GRAPH}/me?fields=user_id,username,name,profile_picture_url,followers_count,media_count&access_token=${t}`,
    );
    const media = await fetchJson<{ data: any[] }>(
      `${GRAPH}/me/media?fields=id,caption,media_type,media_product_type,thumbnail_url,media_url,permalink,timestamp,like_count,comments_count&limit=25&access_token=${t}`,
    );

    const posts: PostSummary[] = [];
    for (const m of media.data ?? []) {
      const f = format(m);
      let views: number | null = null;
      if (f === 'reel') {
        try {
          const ins = await fetchJson<{ data: { name: string; values: { value: number }[] }[] }>(
            `${GRAPH}/${m.id}/insights?metric=views&access_token=${t}`,
          );
          views = ins.data?.[0]?.values?.[0]?.value ?? null;
        } catch (err) {
          if (err instanceof AuthError) throw err;
        }
      }
      posts.push({
        id: m.id,
        caption: (m.caption ?? '').slice(0, 200),
        url: m.permalink,
        thumbnailUrl: m.thumbnail_url ?? (m.media_type === 'VIDEO' ? null : m.media_url) ?? null,
        postedAt: m.timestamp,
        format: f,
        likes: m.like_count ?? 0,
        comments: m.comments_count ?? 0,
        views,
        shares: null,
      });
    }

    return {
      profile: {
        externalId: String(me.user_id ?? me.id),
        username: me.username,
        displayName: me.name || me.username,
        avatarUrl: me.profile_picture_url ?? null,
        profileUrl: `https://www.instagram.com/${me.username}/`,
        followers: me.followers_count ?? 0,
        postsCount: me.media_count ?? 0,
      },
      posts,
      demographics: await this.demographics(me.user_id ?? me.id, t),
      youtube: null,
      historyBackfill: null,
    };
  }

  /** Audience breakdowns. Instagram only returns these for accounts with 100+ followers. */
  private async demographics(userId: string, t: string): Promise<Demographics | null> {
    const out: Demographics = {};
    const map = { age: 'age', gender: 'gender', country: 'country', city: 'city' } as const;
    for (const [key, breakdown] of Object.entries(map) as [keyof Demographics, string][]) {
      try {
        const r = await fetchJson<any>(
          `${GRAPH}/${userId}/insights?metric=follower_demographics&period=lifetime&metric_type=total_value&breakdown=${breakdown}&access_token=${t}`,
        );
        const results: any[] = r.data?.[0]?.total_value?.breakdowns?.[0]?.results ?? [];
        const counts: Record<string, number> = {};
        for (const row of results) {
          let label = String(row.dimension_values?.[0] ?? '');
          if (key === 'gender') label = ({ F: 'Female', M: 'Male', U: 'Unknown' } as any)[label] ?? label;
          counts[label] = (counts[label] ?? 0) + Number(row.value ?? 0);
        }
        const pct = toPercentages(counts, key === 'country' || key === 'city' ? 10 : undefined);
        if (Object.keys(pct).length) out[key] = pct;
      } catch (err) {
        if (err instanceof AuthError) throw err;
        // Too few followers or metric unavailable: leave this breakdown out.
      }
    }
    return Object.keys(out).length ? out : null;
  }
}
