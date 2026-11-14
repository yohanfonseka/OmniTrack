import { config } from '../config.js';
import type { AccountTokens } from '../models.js';
import type { PostSummary } from '../../shared/types.js';
import { AuthError, fetchJson, form, type FetchedData, type PlatformProvider } from './types.js';

/**
 * TikTok Login Kit + Display API.
 * https://developers.tiktok.com/doc/login-kit-web  ·  /doc/tiktok-api-v2-get-user-info
 * TikTok's public developer API does not provide audience demographics.
 */
const SCOPES = ['user.info.basic', 'user.info.profile', 'user.info.stats', 'video.list'];

interface TokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token: string;
  refresh_expires_in: number;
  open_id: string;
  error?: string;
  error_description?: string;
}

function toTokens(r: TokenResponse): AccountTokens {
  if (r.error || !r.access_token) throw new AuthError(`TikTok token error: ${r.error} ${r.error_description ?? ''}`);
  return {
    accessToken: r.access_token,
    refreshToken: r.refresh_token,
    accessExpiresAt: new Date(Date.now() + r.expires_in * 1000).toISOString(),
    refreshExpiresAt: new Date(Date.now() + r.refresh_expires_in * 1000).toISOString(),
  };
}

export class TikTokProvider implements PlatformProvider {
  platform = 'tiktok' as const;
  mode = 'live' as const;

  authorizeUrl(state: string, redirectUri: string) {
    const p = new URLSearchParams({
      client_key: config.tiktok.clientKey,
      response_type: 'code',
      scope: SCOPES.join(','),
      redirect_uri: redirectUri,
      state,
    });
    return `https://www.tiktok.com/v2/auth/authorize/?${p}`;
  }

  async exchangeCode(code: string, redirectUri: string) {
    const r = await fetchJson<TokenResponse>(
      'https://open.tiktokapis.com/v2/oauth/token/',
      form({
        client_key: config.tiktok.clientKey,
        client_secret: config.tiktok.clientSecret,
        code,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
      }),
    );
    return { tokens: toTokens(r) };
  }

  async refreshIfNeeded(tokens: AccountTokens) {
    const expires = tokens.accessExpiresAt ? Date.parse(tokens.accessExpiresAt) : 0;
    if (expires - Date.now() > 10 * 60_000) return null;
    if (!tokens.refreshToken) throw new AuthError('TikTok refresh token missing');
    const r = await fetchJson<TokenResponse>(
      'https://open.tiktokapis.com/v2/oauth/token/',
      form({
        client_key: config.tiktok.clientKey,
        client_secret: config.tiktok.clientSecret,
        grant_type: 'refresh_token',
        refresh_token: tokens.refreshToken,
      }),
    );
    return toTokens(r);
  }

  async fetchData(tokens: AccountTokens): Promise<FetchedData> {
    const auth = { Authorization: `Bearer ${tokens.accessToken}` };
    const fields = 'open_id,avatar_url,display_name,username,follower_count,likes_count,video_count,profile_deep_link';
    const info = await fetchJson<any>(`https://open.tiktokapis.com/v2/user/info/?fields=${fields}`, { headers: auth });
    const u = info.data?.user;
    if (!u) throw new Error(`TikTok user info missing: ${JSON.stringify(info.error ?? info).slice(0, 200)}`);

    const vfields = 'id,title,video_description,cover_image_url,share_url,create_time,view_count,like_count,comment_count,share_count,duration';
    const list = await fetchJson<any>(`https://open.tiktokapis.com/v2/video/list/?fields=${vfields}`, {
      method: 'POST',
      headers: { ...auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({ max_count: 20 }),
    });
    const posts: PostSummary[] = (list.data?.videos ?? []).map((v: any) => ({
      id: String(v.id),
      caption: String(v.title || v.video_description || '').slice(0, 200),
      url: v.share_url,
      thumbnailUrl: v.cover_image_url ?? null,
      postedAt: new Date(Number(v.create_time) * 1000).toISOString(),
      format: 'video' as const,
      likes: v.like_count ?? 0,
      comments: v.comment_count ?? 0,
      views: v.view_count ?? null,
      shares: v.share_count ?? null,
    }));

    return {
      profile: {
        externalId: u.open_id,
        username: u.username || u.display_name,
        displayName: u.display_name || u.username,
        avatarUrl: u.avatar_url ?? null,
        profileUrl: u.profile_deep_link || `https://www.tiktok.com/@${u.username}`,
        followers: u.follower_count ?? 0,
        postsCount: u.video_count ?? 0,
      },
      posts,
      demographics: null,
      youtube: null,
      historyBackfill: null,
    };
  }
}
