import type { AccountTokens } from '../models.js';
import type { Demographics, HistoryPoint, Platform, PostSummary, YouTubeExtras } from '../../shared/types.js';

export interface FetchedProfile {
  externalId: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  profileUrl: string;
  followers: number;
  postsCount: number;
}

export interface FetchedData {
  profile: FetchedProfile;
  posts: PostSummary[];
  demographics: Demographics | null;
  youtube: YouTubeExtras | null;
  /** Past daily follower counts the platform can give us (YouTube only). */
  historyBackfill: HistoryPoint[] | null;
}

export interface ConnectResult {
  tokens: AccountTokens;
}

export interface PlatformProvider {
  platform: Platform;
  mode: 'live' | 'demo';
  authorizeUrl(state: string, redirectUri: string): string;
  exchangeCode(code: string, redirectUri: string): Promise<ConnectResult>;
  /** Returns new tokens if a refresh was needed, otherwise null. Throws AuthError if the connection is dead. */
  refreshIfNeeded(tokens: AccountTokens): Promise<AccountTokens | null>;
  fetchData(tokens: AccountTokens): Promise<FetchedData>;
}

/** The platform rejected our credentials: the creator has to reconnect. */
export class AuthError extends Error {}

export async function fetchJson<T = any>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const text = await res.text();
  let body: any = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!res.ok) {
    const msg = typeof body === 'object' ? JSON.stringify(body).slice(0, 400) : String(body).slice(0, 400);
    if (res.status === 401 || /invalid_grant|OAuthException|access_token_invalid|invalid_token|expired/i.test(msg)) {
      throw new AuthError(`${res.status} ${msg}`);
    }
    throw new Error(`${res.status} ${url.split('?')[0]}: ${msg}`);
  }
  return body as T;
}

export function form(data: Record<string, string>) {
  return { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(data) };
}

/** Turns raw counts into percentages with one decimal, largest first. */
export function toPercentages(counts: Record<string, number>, top?: number): Record<string, number> {
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  if (!total) return {};
  let entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  if (top) entries = entries.slice(0, top);
  return Object.fromEntries(entries.map(([k, v]) => [k, Math.round((v / total) * 1000) / 10]));
}
