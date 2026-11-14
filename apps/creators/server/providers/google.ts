import { config } from '../config.js';
import type { AccountTokens } from '../models.js';
import type { Demographics, HistoryPoint, PostSummary } from '../../shared/types.js';
import { AuthError, fetchJson, form, toPercentages, type FetchedData, type PlatformProvider } from './types.js';

/** Google OAuth, shared by "Sign in with Google" and "Connect YouTube". */
const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';

export function googleAuthorizeUrl(state: string, redirectUri: string, scopes: string[], offline: boolean) {
  const p = new URLSearchParams({
    client_id: config.google.clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: scopes.join(' '),
    state,
    include_granted_scopes: 'true',
  });
  if (offline) {
    p.set('access_type', 'offline');
    p.set('prompt', 'consent'); // guarantees a refresh token
  } else {
    p.set('prompt', 'select_account');
  }
  return `${AUTH_URL}?${p}`;
}

export async function googleExchange(code: string, redirectUri: string) {
  return fetchJson<{ access_token: string; expires_in: number; refresh_token?: string }>(
    TOKEN_URL,
    form({
      code,
      client_id: config.google.clientId,
      client_secret: config.google.clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  );
}

export interface GoogleIdentity {
  sub: string;
  email: string;
  emailVerified: boolean;
  name: string;
}

export interface GoogleLogin {
  enabled: boolean;
  authorizeUrl(state: string, redirectUri: string): string;
  identify(code: string, redirectUri: string): Promise<GoogleIdentity>;
}

export class LiveGoogleLogin implements GoogleLogin {
  enabled = true;
  authorizeUrl(state: string, redirectUri: string) {
    return googleAuthorizeUrl(state, redirectUri, ['openid', 'email', 'profile'], false);
  }
  async identify(code: string, redirectUri: string) {
    const t = await googleExchange(code, redirectUri);
    const u = await fetchJson<any>('https://openidconnect.googleapis.com/v1/userinfo', {
      headers: { Authorization: `Bearer ${t.access_token}` },
    });
    return { sub: u.sub, email: String(u.email).toLowerCase(), emailVerified: !!u.email_verified, name: u.name || u.email };
  }
}

export const disabledGoogleLogin: GoogleLogin = {
  enabled: false,
  authorizeUrl: () => {
    throw new Error('Google sign-in is not configured');
  },
  identify: async () => {
    throw new Error('Google sign-in is not configured');
  },
};

/** ISO 8601 duration (PT1M5S) to seconds. */
function durationSec(iso: string): number {
  const m = /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso || '');
  if (!m) return 0;
  const [, d, h, min, s] = m.map((x) => Number(x || 0));
  return d * 86400 + h * 3600 + min * 60 + s;
}

const ymd = (d: Date) => d.toISOString().slice(0, 10);

/**
 * YouTube Data API v3 + YouTube Analytics API, read-only.
 * https://developers.google.com/youtube/v3  ·  https://developers.google.com/youtube/analytics
 */
export class YouTubeProvider implements PlatformProvider {
  platform = 'youtube' as const;
  mode = 'live' as const;

  authorizeUrl(state: string, redirectUri: string) {
    return googleAuthorizeUrl(
      state,
      redirectUri,
      ['https://www.googleapis.com/auth/youtube.readonly', 'https://www.googleapis.com/auth/yt-analytics.readonly'],
      true,
    );
  }

  async exchangeCode(code: string, redirectUri: string) {
    const t = await googleExchange(code, redirectUri);
    return {
      tokens: {
        accessToken: t.access_token,
        refreshToken: t.refresh_token ?? null,
        accessExpiresAt: new Date(Date.now() + t.expires_in * 1000).toISOString(),
        refreshExpiresAt: null,
      },
    };
  }

  async refreshIfNeeded(tokens: AccountTokens) {
    const expires = tokens.accessExpiresAt ? Date.parse(tokens.accessExpiresAt) : 0;
    if (expires - Date.now() > 5 * 60_000) return null;
    if (!tokens.refreshToken) throw new AuthError('YouTube refresh token missing');
    const t = await fetchJson<{ access_token: string; expires_in: number }>(
      TOKEN_URL,
      form({
        client_id: config.google.clientId,
        client_secret: config.google.clientSecret,
        refresh_token: tokens.refreshToken,
        grant_type: 'refresh_token',
      }),
    );
    return { ...tokens, accessToken: t.access_token, accessExpiresAt: new Date(Date.now() + t.expires_in * 1000).toISOString() };
  }

  async fetchData(tokens: AccountTokens): Promise<FetchedData> {
    const headers = { Authorization: `Bearer ${tokens.accessToken}` };
    const api = (path: string) => fetchJson<any>(`https://www.googleapis.com/youtube/v3/${path}`, { headers });

    const ch = (await api('channels?part=snippet,statistics,contentDetails&mine=true')).items?.[0];
    if (!ch) throw new Error('This Google account has no YouTube channel.');
    const uploads = ch.contentDetails?.relatedPlaylists?.uploads;
    const subs = Number(ch.statistics?.subscriberCount ?? 0);

    let posts: PostSummary[] = [];
    if (uploads) {
      const items = (await api(`playlistItems?part=contentDetails&maxResults=20&playlistId=${uploads}`)).items ?? [];
      const ids = items.map((i: any) => i.contentDetails.videoId).join(',');
      if (ids) {
        const vids = (await api(`videos?part=snippet,statistics,contentDetails&id=${ids}`)).items ?? [];
        posts = vids.map((v: any) => {
          // Shorts can be up to 3 minutes; the API has no explicit flag.
          const isShort = durationSec(v.contentDetails?.duration) <= 180;
          return {
            id: v.id,
            caption: String(v.snippet?.title ?? '').slice(0, 200),
            url: isShort ? `https://www.youtube.com/shorts/${v.id}` : `https://www.youtube.com/watch?v=${v.id}`,
            thumbnailUrl: v.snippet?.thumbnails?.medium?.url ?? v.snippet?.thumbnails?.default?.url ?? null,
            postedAt: v.snippet?.publishedAt,
            format: isShort ? 'short' : 'long_video',
            likes: Number(v.statistics?.likeCount ?? 0),
            comments: Number(v.statistics?.commentCount ?? 0),
            views: Number(v.statistics?.viewCount ?? 0),
            shares: null,
          } satisfies PostSummary;
        });
      }
    }

    const analytics = (params: Record<string, string>) =>
      fetchJson<any>(`https://youtubeanalytics.googleapis.com/v2/reports?${new URLSearchParams({ ids: 'channel==MINE', ...params })}`, { headers });
    const today = new Date();
    const end = ymd(today);
    const start28 = ymd(new Date(today.getTime() - 28 * 86_400_000));
    const start365 = ymd(new Date(today.getTime() - 365 * 86_400_000));

    let youtube = { totalViews: Number(ch.statistics?.viewCount ?? 0), views28d: 0, watchMinutes28d: 0, avgViewDurationSec: 0 };
    let demographics: Demographics | null = null;
    let history: HistoryPoint[] | null = null;
    try {
      const totals = await analytics({ startDate: start28, endDate: end, metrics: 'views,estimatedMinutesWatched,averageViewDuration' });
      const [views, minutes, avgDur] = totals.rows?.[0] ?? [0, 0, 0];
      youtube = { ...youtube, views28d: views, watchMinutes28d: minutes, avgViewDurationSec: avgDur };

      const demo: Demographics = {};
      const ag = await analytics({ startDate: start365, endDate: end, metrics: 'viewerPercentage', dimensions: 'ageGroup,gender' });
      const age: Record<string, number> = {};
      const gender: Record<string, number> = {};
      for (const [ageGroup, g, pct] of ag.rows ?? []) {
        const a = String(ageGroup).replace(/^age/, '').replace(/-$/, '+');
        age[a] = (age[a] ?? 0) + pct;
        const gl = g === 'female' ? 'Female' : g === 'male' ? 'Male' : 'Other';
        gender[gl] = (gender[gl] ?? 0) + pct;
      }
      if (Object.keys(age).length) demo.age = toPercentages(age);
      if (Object.keys(gender).length) demo.gender = toPercentages(gender);
      const c = await analytics({ startDate: start365, endDate: end, metrics: 'views', dimensions: 'country', sort: '-views', maxResults: '10' });
      const country: Record<string, number> = {};
      for (const [code, v] of c.rows ?? []) country[String(code)] = v;
      if (Object.keys(country).length) demo.country = toPercentages(country);
      demographics = Object.keys(demo).length ? demo : null;

      // Rebuild a year of daily subscriber counts by walking back from today's total.
      const daily = await analytics({ startDate: start365, endDate: end, metrics: 'subscribersGained,subscribersLost', dimensions: 'day', sort: 'day' });
      const rows: [string, number, number][] = daily.rows ?? [];
      let running = subs;
      const points: HistoryPoint[] = [];
      for (let i = rows.length - 1; i >= 0; i--) {
        const [day, gained, lost] = rows[i];
        points.push({ date: day, followers: Math.max(0, running), engagementRate: null });
        running -= gained - lost;
      }
      history = points.reverse();
    } catch (err) {
      if (err instanceof AuthError) throw err;
      console.warn('[youtube] analytics unavailable:', (err as Error).message);
    }

    return {
      profile: {
        externalId: ch.id,
        username: ch.snippet?.customUrl || ch.snippet?.title,
        displayName: ch.snippet?.title,
        avatarUrl: ch.snippet?.thumbnails?.default?.url ?? null,
        profileUrl: ch.snippet?.customUrl ? `https://www.youtube.com/${ch.snippet.customUrl}` : `https://www.youtube.com/channel/${ch.id}`,
        followers: subs,
        postsCount: Number(ch.statistics?.videoCount ?? 0),
      },
      posts,
      demographics,
      youtube,
      historyBackfill: history,
    };
  }
}
