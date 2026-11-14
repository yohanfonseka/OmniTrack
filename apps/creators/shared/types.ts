import type { CategoryId } from './categories';

export type Role = 'creator' | 'brand';
export type Platform = 'instagram' | 'tiktok' | 'youtube';
export const PLATFORMS: Platform[] = ['instagram', 'tiktok', 'youtube'];

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

export interface PostSummary {
  id: string;
  caption: string;
  url: string;
  thumbnailUrl: string | null;
  postedAt: string;
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
  date: string;
  followers: number;
  engagementRate: number;
}

/** The paid part of a profile: what a brand unlocks with a report. */
export interface FullReport {
  platform: Platform;
  recentPosts: PostSummary[];
  demographics: Demographics | null;
  history: HistoryPoint[];
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
  accounts: PublicAccount[];
}

export interface CreatorProfilePage extends CreatorCard {
  /** Present when the viewer is the creator or has unlocked the report. */
  reports: FullReport[] | null;
  access: 'owner' | 'unlocked' | 'locked';
  unlockExpiresAt: string | null;
  reportPrice: { amountCents: number; currency: string; accessDays: number };
}

export type CampaignStatus = 'open' | 'closed';
export type MemberStatus = 'invited' | 'applied' | 'accepted' | 'declined' | 'rejected';

export interface Campaign {
  id: string;
  brandId: string;
  brandName: string;
  title: string;
  brief: string;
  deliverables: string;
  categories: CategoryId[];
  platforms: Platform[];
  /** Fee offered per creator, in whole currency units. */
  budgetPerCreator: number | null;
  currency: string;
  deadline: string | null;
  status: CampaignStatus;
  createdAt: string;
}

export interface CampaignMember {
  id: string;
  campaignId: string;
  creatorId: string;
  brandId: string;
  status: MemberStatus;
  initiatedBy: Role;
  fee: number | null;
  note: string;
  createdAt: string;
  updatedAt: string;
}

export interface Me {
  id: string;
  email: string;
  name: string;
  role: Role;
  slug?: string;
}
