import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ExternalLink, Eye, Heart, MessageCircle } from 'lucide-react';
import { compact, countryName, pct, shortDate } from '../format';
import { PLATFORM_LABELS, type Demographics, type FullReport, type HistoryPoint, type Platform, type PostFormat, type PostSummary, type PublicAccount } from '../../shared/types';
import { PlatformIcon } from './PlatformIcon';
import { DemoBadge, Stat } from './ui';

/** Fixed categorical slots (validated palette, slots 1–3): colour follows the platform, never its rank. */
export const SERIES: Record<Platform, string> = { instagram: '#2a78d6', tiktok: '#eb6834', youtube: '#1baf7a' };

const FORMAT_LABEL: Record<PostFormat, string> = {
  reel: 'Reels', photo: 'Photos', carousel: 'Carousels', video: 'Videos', short: 'Shorts', long_video: 'Long videos',
};

export const engagementOf = (p: PostSummary, followers: number) => (followers ? ((p.likes + p.comments) / followers) * 100 : 0);

/** Single-series follower line with a crosshair tooltip. The title names the series, so no legend. */
export function GrowthChart({ history, platform, height = 220 }: { history: HistoryPoint[]; platform: Platform; height?: number }) {
  if (history.length < 2) {
    return (
      <div className="flex items-center justify-center rounded-xl bg-canvas text-center text-sm text-muted" style={{ height }}>
        Growth history builds up from daily checks. Come back in a few days.
      </div>
    );
  }
  const data = history.map((h) => ({ ...h, label: shortDate(h.date) }));
  return (
    <div style={{ height }} role="img" aria-label={`${PLATFORM_LABELS[platform]} followers from ${data[0].label} to ${data[data.length - 1].label}: ${compact(data[0].followers)} to ${compact(data[data.length - 1].followers)}`}>
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="#eeecf3" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#6b6880' }} tickLine={false} axisLine={{ stroke: '#e6e3ef' }} minTickGap={40} />
          <YAxis tickFormatter={(v) => compact(v)} tick={{ fontSize: 11, fill: '#6b6880' }} tickLine={false} axisLine={false} width={44} domain={['auto', 'auto']} />
          <Tooltip
            cursor={{ stroke: '#c4b5fd', strokeWidth: 1 }}
            formatter={(v) => [compact(Number(v)), 'Followers']}
            labelStyle={{ color: '#1f1d2b', fontWeight: 600 }}
            contentStyle={{ borderRadius: 10, border: '1px solid #e6e3ef', fontSize: 12 }}
          />
          <Line type="monotone" dataKey="followers" stroke={SERIES[platform]} strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: '#fff' }} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Horizontal magnitude bars, one hue, with visible values (identity never by colour alone). */
export function Bars({ rows, highlight }: { rows: [string, number, string?][]; highlight?: string }) {
  const max = Math.max(...rows.map((r) => r[1]), 0.0001);
  return (
    <ul className="grid gap-2">
      {rows.map(([label, value, display]) => (
        <li key={label} className="grid grid-cols-[minmax(0,7.5rem)_1fr_3.5rem] items-center gap-3 text-sm" title={`${label}: ${display ?? value}`}>
          <span className={`truncate ${label === highlight ? 'font-semibold' : 'text-muted'}`}>{label}</span>
          <span className="h-2.5 rounded-full bg-brand-50">
            <span className={`block h-2.5 rounded-full ${label === highlight ? 'bg-brand-700' : 'bg-brand-500'}`} style={{ width: `${Math.max(2, (value / max) * 100)}%` }} />
          </span>
          <span className="text-right tabular-nums">{display ?? value}</span>
        </li>
      ))}
    </ul>
  );
}

export function DemographicsView({ d, platform }: { d: Demographics | null; platform: Platform }) {
  if (!d) {
    return (
      <p className="text-sm text-muted">
        {platform === 'tiktok'
          ? 'Audience demographics are not provided by TikTok.'
          : 'Audience breakdowns appear once the platform provides them (Instagram needs 100+ followers).'}
      </p>
    );
  }
  const groups: [keyof Demographics, string][] = [['age', 'Age'], ['gender', 'Gender'], ['country', 'Top countries'], ['city', 'Top cities']];
  return (
    <div className="grid gap-6 sm:grid-cols-2">
      {groups.filter(([k]) => d[k] && Object.keys(d[k]!).length).map(([k, title]) => (
        <div key={k}>
          <div className="eyebrow mb-2">{title}</div>
          <Bars rows={Object.entries(d[k]!).slice(0, 6).map(([label, v]) => [k === 'country' ? countryName(label) : label, v, `${v}%`])} />
        </div>
      ))}
    </div>
  );
}

export function PostRow({ post, followers }: { post: PostSummary; followers: number }) {
  return (
    <a href={post.url} target="_blank" rel="noreferrer" className="flex items-center gap-3 rounded-xl p-2 hover:bg-canvas">
      {post.thumbnailUrl ? (
        <img src={post.thumbnailUrl} alt="" referrerPolicy="no-referrer" className="h-14 w-14 shrink-0 rounded-lg object-cover" loading="lazy" />
      ) : (
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-[10px] font-medium text-brand-800">{FORMAT_LABEL[post.format]}</div>
      )}
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm">{post.caption || <span className="text-muted">(no caption)</span>}</div>
        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted">
          <span>{shortDate(post.postedAt)} · {FORMAT_LABEL[post.format]}</span>
          <span className="inline-flex items-center gap-1"><Heart size={12} />{compact(post.likes)}</span>
          <span className="inline-flex items-center gap-1"><MessageCircle size={12} />{compact(post.comments)}</span>
          {post.views !== null && <span className="inline-flex items-center gap-1"><Eye size={12} />{compact(post.views)}</span>}
          <span className="font-medium text-ink">{pct(engagementOf(post, followers), 1)} eng.</span>
        </div>
      </div>
      <ExternalLink size={14} className="shrink-0 text-muted" />
    </a>
  );
}

export function HeadlineStats({ account }: { account: PublicAccount }) {
  const s = account.stats;
  const followerLabel = account.platform === 'youtube' ? 'Subscribers' : 'Followers';
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <Stat label={followerLabel} value={compact(s?.followers)} />
      <Stat label="Engagement rate" value={pct(s?.engagementRate)} sub="(likes + comments) ÷ followers" />
      <Stat label="Avg views / post" value={compact(s?.avgViews)} />
      <Stat label={account.platform === 'youtube' ? 'Videos' : 'Posts'} value={compact(s?.posts)} />
    </div>
  );
}

export function AccountHeader({ account }: { account: PublicAccount }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <PlatformIcon platform={account.platform} size={20} />
      <span className="font-semibold">{PLATFORM_LABELS[account.platform]}</span>
      <a href={account.profileUrl} target="_blank" rel="noreferrer" className="text-sm text-muted hover:text-ink">@{account.username}</a>
      {account.demo && <DemoBadge />}
      <span className="ml-auto text-xs text-muted">
        {account.status === 'needs_reconnect' ? <span className="text-amber-800">Last verified {shortDate(account.lastVerifiedAt)}</span> : <>Verified {shortDate(account.lastVerifiedAt)}</>}
      </span>
    </div>
  );
}

/** The full (unlocked) report for one platform: used on profiles and in the creator dashboard. */
export function PlatformReport({ account, report }: { account: PublicAccount; report: FullReport }) {
  const followers = account.stats?.followers ?? 0;
  const top = [...report.recentPosts].sort((a, b) => b.likes + b.comments - (a.likes + a.comments)).slice(0, 5);
  const yt = report.youtube;
  return (
    <div className="grid gap-5">
      {yt && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Channel views" value={compact(yt.totalViews)} sub="All time" />
          <Stat label="Views" value={compact(yt.views28d)} sub="Last 28 days" />
          <Stat label="Watch hours" value={compact(yt.watchMinutes28d / 60)} sub="Last 28 days" />
          <Stat label="Avg view duration" value={`${Math.floor(yt.avgViewDurationSec / 60)}m ${Math.round(yt.avgViewDurationSec % 60)}s`} />
        </div>
      )}
      <div className="card p-5">
        <h3 className="font-semibold">{PLATFORM_LABELS[account.platform]} {account.platform === 'youtube' ? 'subscribers' : 'followers'}</h3>
        <div className="mt-3"><GrowthChart history={report.history.slice(-180)} platform={account.platform} /></div>
      </div>
      <div className="card p-5">
        <h3 className="mb-4 font-semibold">Audience</h3>
        <DemographicsView d={report.demographics} platform={account.platform} />
      </div>
      <div className="card p-5">
        <h3 className="mb-2 font-semibold">Top recent posts</h3>
        {top.length ? top.map((p) => <PostRow key={p.id} post={p} followers={followers} />) : <p className="text-sm text-muted">No recent posts.</p>}
      </div>
    </div>
  );
}
