import type { CategoryId } from '../shared/categories.js';
import type {
  Demographics, HistoryPoint, InviteStatus, Platform, PostSummary, PublicStats, Role, YouTubeExtras,
} from '../shared/types.js';

/** Firestore collection names, in one place. */
export const C = {
  users: 'users',
  sessions: 'sessions',
  emailTokens: 'emailTokens',
  oauthStates: 'oauthStates',
  creators: 'creators',
  accounts: 'accounts',
  accountDetails: 'accountDetails',
  invites: 'invites',
  creatorDaily: 'creatorDaily',
  reportViewers: 'reportViewers',
  brandViews: 'brandViews',
} as const;

export interface UserDoc {
  id: string;
  email: string; // lower-cased
  name: string;
  role: Role;
  companyName: string | null;
  passwordHash: string | null;
  googleSub: string | null;
  emailVerified: boolean;
  disabled: boolean;
  createdAt: string;
  /** Creator who referred this user (their user id). */
  referredBy: string | null;
  /** Set once this user's first platform connection has been credited to the referrer. */
  referralCredited: boolean;
  inviteToken: string | null;
}

export interface SessionDoc {
  id: string; // sha256 of the cookie token
  userId: string;
  createdAt: string;
  expiresAt: string;
}

export interface EmailTokenDoc {
  id: string; // sha256 of the token in the link
  userId: string;
  kind: 'verify' | 'reset';
  expiresAt: string;
}

export interface OAuthStateDoc {
  id: string;
  purpose: 'login' | 'connect';
  platform: Platform | 'google';
  userId: string | null;
  /** For Google sign-in that creates an account. */
  role: Role | null;
  ref: string | null;
  invite: string | null;
  returnTo: string | null;
  createdAt: string;
}

export interface CreatorDoc {
  id: string; // = user id
  slug: string;
  displayName: string;
  bio: string;
  categories: CategoryId[];
  city: string;
  country: string;
  contactEmail: string;
  referralCode: string;
  friendsJoined: number;
  hidden: boolean;
  weeklyEmail: boolean;
  /** True once profile setup has been saved at least once. */
  onboarded: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AccountTokens {
  accessToken: string;
  refreshToken: string | null;
  accessExpiresAt: string | null;
  refreshExpiresAt: string | null;
}

export interface AccountDoc {
  id: string; // `${userId}_${platform}`
  userId: string;
  platform: Platform;
  externalId: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  profileUrl: string;
  /** Encrypted JSON of AccountTokens. */
  tokens: string;
  status: 'active' | 'needs_reconnect';
  demo: boolean;
  stats: PublicStats | null;
  connectedAt: string;
  lastSyncedAt: string | null;
  lastError: string | null;
  reconnectEmailSentAt: string | null;
}

export interface AccountDetailsDoc {
  id: string; // = account id
  recentPosts: PostSummary[];
  demographics: Demographics | null;
  youtube: YouTubeExtras | null;
  /** One point per day, oldest first, capped at ~3 years. */
  history: HistoryPoint[];
}

export interface InviteDoc {
  token: string;
  name: string;
  email: string;
  phone: string;
  status: InviteStatus;
  createdBy: string;
  createdAt: string;
  expiresAt: string;
  openedAt: string | null;
  creatorId: string | null;
}

/** Per creator per day counters. id = `${creatorId}_${YYYY-MM-DD}` */
export interface CreatorDailyDoc {
  id: string;
  creatorId: string;
  day: string;
  profileViews: number;
  searchAppearances: number;
}

/** Distinct brands that opened a creator's full report in a month. id = `${creatorId}_${YYYY-MM}` */
export interface ReportViewersDoc {
  id: string;
  creatorId: string;
  month: string;
  brandIds: string[];
}

/**
 * Every full report a brand has opened. Iteration 2 builds the daily free
 * report and paid unlocks on top of this. id = `${brandId}_${creatorId}`
 */
export interface BrandViewDoc {
  id: string;
  brandId: string;
  creatorId: string;
  firstViewedAt: string;
  lastViewedAt: string;
  views: number;
  pdfDownloads: number;
}
