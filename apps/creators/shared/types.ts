import type { CategoryId } from './categories';

export type Role = 'creator' | 'brand';
export type Platform = 'instagram' | 'tiktok' | 'youtube';
export const PLATFORMS: Platform[] = ['instagram', 'tiktok', 'youtube'];
export const PLATFORM_LABELS: Record<Platform, string> = {
  instagram: 'Instagram',
  tiktok: 'TikTok',
  youtube: 'YouTube',
};

/** Headline numbers anyone can see on a creator's verified link. */
export interface PublicStats {
  followers: number;
  posts: number;
  avgLikes: number;
  avgComments: number;
  /** (likes + comments) / followers, averaged over recent posts, as a percentage. */
  engagementRate: number;
  avgViews: number | null;
}

export interface PublicAccount {
  platform: Platform;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  profileUrl: string;
  stats: PublicStats | null;
  lastVerifiedAt: string | null;
  status: 'active' | 'needs_reconnect';
  /** True when the numbers came from the demo provider, not a real platform. */
  demo: boolean;
}

/** A post's format, used for the format comparison on the dashboard. */
export type PostFormat = 'reel' | 'photo' | 'carousel' | 'video' | 'short' | 'long_video';

export interface PostSummary {
  id: string;
  caption: string;
  url: string;
  thumbnailUrl: string | null;
  postedAt: string;
  format: PostFormat;
  likes: number;
  comments: number;
  views: number | null;
  shares: number | null;
}

/** Percentage breakdowns, e.g. { "18-24": 31.2, "25-34": 44.0 }. */
export interface Demographics {
  age?: Record<string, number>;
  gender?: Record<string, number>;
  country?: Record<string, number>;
  city?: Record<string, number>;
}

export interface HistoryPoint {
  date: string; // YYYY-MM-DD
  followers: number;
  engagementRate: number | null;
}

/** YouTube-only channel metrics over the last 28 days. */
export interface YouTubeExtras {
  totalViews: number;
  views28d: number;
  watchMinutes28d: number;
  avgViewDurationSec: number;
}

/** The full data for one platform: what a verified brand (and the creator) sees. */
export interface FullReport {
  platform: Platform;
  recentPosts: PostSummary[];
  demographics: Demographics | null;
  history: HistoryPoint[];
  youtube: YouTubeExtras | null;
}

export interface CreatorCard {
  id: string;
  slug: string;
  displayName: string;
  bio: string;
  categories: CategoryId[];
  country: string;
  city: string;
  totalFollowers: number;
  communityBuilder: boolean;
  accounts: PublicAccount[];
}

export type ProfileAccess = 'owner' | 'full' | 'locked_visitor' | 'locked_unverified' | 'locked_creator';

export interface CreatorProfilePage extends CreatorCard {
  /** Present only when access is 'owner' or 'full'. */
  reports: FullReport[] | null;
  access: ProfileAccess;
}

export interface Me {
  id: string;
  email: string;
  name: string;
  role: Role;
  companyName: string | null;
  emailVerified: boolean;
  isAdmin: boolean;
  hasPassword: boolean;
  /** Creators only. */
  creator: null | {
    slug: string;
    onboarded: boolean;
    connectedPlatforms: Platform[];
  };
}

export interface InterestCounts {
  profileViews7d: number;
  profileViews30d: number;
  searchAppearances7d: number;
  searchAppearances30d: number;
  /** Distinct brands that opened the full report this calendar month. Counts only. */
  brandsViewedReportThisMonth: number;
}

export interface CreatorDashboard {
  profile: {
    slug: string;
    displayName: string;
    bio: string;
    categories: CategoryId[];
    city: string;
    country: string;
    contactEmail: string;
    weeklyEmail: boolean;
  };
  accounts: PublicAccount[];
  reports: FullReport[];
  interest: InterestCounts;
  referral: { code: string; friendsJoined: number; communityBuilder: boolean };
  completeness: { percent: number; missing: string[] };
}

export type InviteStatus = 'sent' | 'opened' | 'signed_up' | 'connected' | 'cancelled' | 'expired';

export interface Invite {
  token: string;
  name: string;
  email: string;
  phone: string;
  status: InviteStatus;
  createdAt: string;
  expiresAt: string;
  openedAt: string | null;
  creatorId: string | null;
}

export interface DirectoryQuery {
  q?: string;
  category?: string;
  platform?: string;
  minFollowers?: number;
  maxFollowers?: number;
  minEngagement?: number;
  location?: string;
  sort?: 'followers' | 'engagement' | 'recent';
}
