import { useEffect, useMemo, useState } from 'react';
import { Award, Download, Eye, Lightbulb, Search, Users } from 'lucide-react';
import { api } from '../api';
import { useShareOrigin } from '../auth';
import { ConnectPanel } from '../components/ConnectPanel';
import { PlatformIcon } from '../components/PlatformIcon';
import { Bars, DemographicsView, engagementOf, GrowthChart, PostRow, SERIES } from '../components/Report';
import { ShareButtons } from '../components/Share';
import { Empty, Notice, Section, Spinner, Stat } from '../components/ui';
import { compact, pct, shortDate } from '../format';
import { Link, useQuery } from '../router';
import { PLATFORM_LABELS, type CreatorDashboard, type FullReport, type HistoryPoint, type Platform, type PostFormat, type PostSummary, type PublicAccount } from '../../shared/types';

const RANGES = [
  { id: '7', label: '7d', days: 7 },
  { id: '30', label: '30d', days: 30 },
  { id: '90', label: '90d', days: 90 },
  { id: 'all', label: 'All', days: 100_000 },
] as const;

const FORMAT_LABEL: Record<PostFormat, string> = {
  reel: 'Reels', photo: 'Photos', carousel: 'Carousels', video: 'Videos', short: 'Shorts', long_video: 'Long videos',
};
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const isoDaysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);

/** Followers on the latest day vs. the last point on or before n days ago. */
function change(history: HistoryPoint[], days: number): number | null {
  if (history.length < 2) return null;
  const now = history[history.length - 1];
  const cutoff = isoDaysAgo(days);
  const then = [...history].reverse().find((p) => p.date <= cutoff);
  return then ? now.followers - then.followers : null;
}

function changeLabel(n: number | null, days: number) {
  if (n === null) return { text: `Not enough history for ${days}d yet`, tone: undefined };
  return { text: `${n >= 0 ? '▲ +' : '▼ '}${compact(n)} in ${days} days`, tone: n >= 0 ? ('up' as const) : ('down' as const) };
}

interface Tagged { post: PostSummary; platform: Platform; followers: number }

export function Dashboard() {
  const query = useQuery();
  const origin = useShareOrigin();
  const [d, setD] = useState<CreatorDashboard | null>(null);
  const [error, setError] = useState('');
  const [sel, setSel] = useState<Platform | 'all'>('all');
  const [range, setRange] = useState<(typeof RANGES)[number]['id']>('30');

  const load = () => api<CreatorDashboard>('/api/creator/dashboard').then(setD, (e) => setError(e.message));
  useEffect(() => void load(), []);

  const view = useMemo(() => {
    if (!d) return null;
    const pairs = d.accounts
      .map((a) => ({ account: a, report: d.reports.find((r) => r.platform === a.platform)! }))
      .filter((x) => x.report && (sel === 'all' || x.account.platform === sel));
    const posts: Tagged[] = pairs.flatMap(({ account, report }) =>
      report.recentPosts.map((post) => ({ post, platform: account.platform, followers: account.stats?.followers ?? 0 })));
    return { pairs, posts };
  }, [d, sel]);

  if (error) return <div className="py-10"><Notice kind="error">{error}</Notice></div>;
  if (!d || !view) return <Spinner />;

  const connected = query.get('connected') as Platform | null;
  const connectError = query.get('connect_error');
  const reconnect = query.get('reconnect');
  const hasAccounts = d.accounts.length > 0;

  // ---- Key numbers --------------------------------------------------------
  const accs = view.pairs.map((p) => p.account);
  const totalFollowers = accs.reduce((s, a) => s + (a.stats?.followers ?? 0), 0);
  const sumChange = (days: number) => {
    const parts = view.pairs.map((p) => change(p.report.history, days));
    return parts.some((x) => x === null) ? null : parts.reduce<number>((s, x) => s + (x ?? 0), 0);
  };
  const week = changeLabel(sumChange(7), 7);
  const month = changeLabel(sumChange(30), 30);
  const ers = accs.map((a) => a.stats?.engagementRate).filter((x): x is number => x !== undefined);
  const avgEr = ers.length ? ers.reduce((s, x) => s + x, 0) / ers.length : null;
  const views = accs.map((a) => a.stats?.avgViews).filter((x): x is number => x !== null && x !== undefined);
  const avgViews = views.length ? views.reduce((s, x) => s + x, 0) / views.length : null;
  const monthStart = new Date().toISOString().slice(0, 7);
  const postsThisMonth = view.posts.filter((p) => p.post.postedAt.slice(0, 7) === monthStart).length;

  // ---- Content performance -----------------------------------------------
  const ranked = [...view.posts].sort((a, b) => engagementOf(b.post, b.followers) - engagementOf(a.post, a.followers));
  const top = ranked.slice(0, 5);
  const lowest = ranked.length >= 8 ? ranked.slice(-3).reverse() : [];

  const byFormat = new Map<PostFormat, number[]>();
  for (const t of view.posts) byFormat.set(t.post.format, [...(byFormat.get(t.post.format) ?? []), engagementOf(t.post, t.followers)]);
  const formatRows = [...byFormat.entries()]
    .filter(([, v]) => v.length >= 2)
    .map(([f, v]) => [FORMAT_LABEL[f], v.reduce((s, x) => s + x, 0) / v.length] as [string, number])
    .sort((a, b) => b[1] - a[1]);

  const byDay = new Map<number, number[]>();
  for (const t of view.posts) {
    // Day of week in Sri Lanka time.
    const day = new Date(Date.parse(t.post.postedAt) + 5.5 * 3_600_000).getUTCDay();
    byDay.set(day, [...(byDay.get(day) ?? []), engagementOf(t.post, t.followers)]);
  }
  const overall = view.posts.length ? view.posts.reduce((s, t) => s + engagementOf(t.post, t.followers), 0) / view.posts.length : 0;
  const dayRows = WEEKDAYS.map((name, i) => {
    const v = byDay.get(i) ?? [];
    return { name, n: v.length, avg: v.length ? v.reduce((s, x) => s + x, 0) / v.length : 0 };
  });
  const eligibleDays = dayRows.filter((r) => r.n >= 2);
  const bestDay = eligibleDays.sort((a, b) => b.avg - a.avg)[0];
  const bestDayLift = bestDay && overall ? Math.round(((bestDay.avg - overall) / overall) * 100) : 0;

  // ---- Growth ----------------------------------------------------------------
  const days = RANGES.find((r) => r.id === range)!.days;
  const cutoff = isoDaysAgo(days);
  const windowed = (h: HistoryPoint[]) => h.filter((p) => p.date >= cutoff);
  let bestGrowth: { date: string; gain: number; platform: Platform } | null = null;
  for (const { account, report } of view.pairs) {
    const h = windowed(report.history);
    for (let i = 1; i < h.length; i++) {
      const gain = h[i].followers - h[i - 1].followers;
      if (gain > 0 && (!bestGrowth || gain > bestGrowth.gain)) bestGrowth = { date: h[i].date, gain, platform: account.platform };
    }
  }

  const missingPlatforms = (['instagram', 'tiktok', 'youtube'] as Platform[]).filter((p) => !d.accounts.some((a) => a.platform === p));
  const profileUrl = `${origin}/c/${d.profile.slug}`;
  const referralUrl = `${origin}/r/${d.referral.code}`;

  return (
    <div className="py-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Hi, {d.profile.displayName.split(' ')[0]}</h1>
          <p className="mt-1 text-muted">Your stats, refreshed daily from each platform.</p>
        </div>
        {hasAccounts && (
          <div className="flex gap-1 rounded-xl border border-line bg-white p-1" role="tablist" aria-label="Platform">
            {(['all', ...d.accounts.map((a) => a.platform)] as const).map((p) => (
              <button key={p} role="tab" aria-selected={sel === p} onClick={() => setSel(p)}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium ${sel === p ? 'bg-brand-700 text-white' : 'text-muted hover:text-ink'}`}>
                {p === 'all' ? 'All' : PLATFORM_LABELS[p]}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="mt-5 grid gap-3">
        {connected && <Notice kind="success">{PLATFORM_LABELS[connected]} connected. Your stats are in.</Notice>}
        {connectError && <Notice kind="error">{connectError}</Notice>}
        {d.accounts.some((a) => a.status === 'needs_reconnect') && (
          <Notice kind="warn">
            {d.accounts.filter((a) => a.status === 'needs_reconnect').map((a) => PLATFORM_LABELS[a.platform]).join(' and ')} needs reconnecting.
            Brands see your last verified numbers until you do. <a href="#accounts" className="font-semibold underline">Reconnect</a>
          </Notice>
        )}
      </div>

      {!hasAccounts ? (
        <div className="mt-6">
          <Empty>
            <p className="text-base font-medium text-ink">Connect a platform to see your stats and appear in brand searches.</p>
            <a href="#accounts" className="btn-primary mt-4">Connect an account</a>
          </Empty>
        </div>
      ) : (
        <>
          {/* 1. Key numbers */}
          <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label={sel === 'youtube' ? 'Subscribers' : sel === 'all' ? 'Total followers' : 'Followers'} value={compact(totalFollowers)} sub={week.text} tone={week.tone} />
            <Stat label="Avg engagement rate" value={pct(avgEr)} sub={month.text} tone={month.tone} />
            <Stat label="Avg views / post" value={compact(avgViews)} sub="Across recent posts" />
            <Stat label="Posts this month" value={postsThisMonth} sub="From your recent posts" />
          </div>

          {/* 2. Growth */}
          <Section
            title="Growth"
            action={
              <div className="flex gap-1 rounded-lg border border-line bg-white p-0.5" role="tablist" aria-label="Time range">
                {RANGES.map((r) => (
                  <button key={r.id} role="tab" aria-selected={range === r.id} onClick={() => setRange(r.id)}
                    className={`rounded-md px-2.5 py-1 text-xs font-medium ${range === r.id ? 'bg-brand-50 text-brand-800' : 'text-muted'}`}>{r.label}</button>
                ))}
              </div>
            }
          >
            {bestGrowth && (
              <p className="mb-3 text-sm text-muted">
                Best growth day: <b className="text-ink">+{compact(bestGrowth.gain)}</b> on {PLATFORM_LABELS[bestGrowth.platform]}, {shortDate(bestGrowth.date)}.
              </p>
            )}
            {/* One platform per chart: different scales never share an axis. */}
            <div className={`grid gap-4 ${view.pairs.length > 1 ? 'md:grid-cols-2 xl:grid-cols-3' : ''}`}>
              {view.pairs.map(({ account, report }) => (
                <div key={account.platform} className="card p-4">
                  <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: SERIES[account.platform] }} />
                    {PLATFORM_LABELS[account.platform]} {account.platform === 'youtube' ? 'subscribers' : 'followers'}
                  </div>
                  <GrowthChart history={windowed(report.history)} platform={account.platform} height={view.pairs.length > 1 ? 180 : 240} />
                </div>
              ))}
            </div>
            {sel !== 'all' && view.pairs[0] && <EngagementTrend report={view.pairs[0].report} account={view.pairs[0].account} cutoff={cutoff} />}
          </Section>

          {/* 3. Content performance */}
          <Section title="Content performance">
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="card p-4">
                <h3 className="mb-1 font-semibold">Top posts</h3>
                <p className="mb-2 text-xs text-muted">By engagement rate, from your recent posts</p>
                {top.length ? top.map((t) => <TaggedPost key={t.post.id} t={t} showPlatform={sel === 'all'} />) : <p className="text-sm text-muted">No posts yet.</p>}
              </div>
              <div className="grid content-start gap-4">
                <div className="card p-4">
                  <h3 className="mb-1 font-semibold">Format comparison</h3>
                  <p className="mb-3 text-xs text-muted">Average engagement rate per post</p>
                  {formatRows.length >= 2 ? (
                    <Bars rows={formatRows.map(([l, v]) => [l, v, pct(v, 1)])} highlight={formatRows[0][0]} />
                  ) : (
                    <p className="text-sm text-muted">Post a couple of different formats to compare them.</p>
                  )}
                </div>
                <div className="card p-4">
                  <h3 className="mb-1 font-semibold">Best day to post</h3>
                  {bestDay ? (
                    <>
                      <p className="mb-3 text-sm">
                        Your posts on <b>{bestDay.name}s</b> get {bestDayLift > 0 ? <><b>{bestDayLift}% more</b> engagement than your average</> : 'your best engagement'}.
                      </p>
                      <Bars rows={dayRows.filter((r) => r.n > 0).map((r) => [r.name.slice(0, 3), r.avg, pct(r.avg, 1)])} highlight={bestDay.name.slice(0, 3)} />
                    </>
                  ) : (
                    <p className="text-sm text-muted">We need a few more posts to spot a pattern.</p>
                  )}
                </div>
              </div>
            </div>
            {lowest.length > 0 && (
              <div className="card mt-4 p-4">
                <h3 className="mb-1 font-semibold">Lowest performers</h3>
                <p className="mb-2 text-xs text-muted">Compare with your top posts: what was different?</p>
                {lowest.map((t) => <TaggedPost key={t.post.id} t={t} showPlatform={sel === 'all'} />)}
              </div>
            )}
          </Section>

          {/* 4. Audience */}
          <Section title="Audience">
            <div className="grid gap-4">
              {view.pairs.map(({ account, report }) => (
                <div key={account.platform} className="card p-5">
                  <div className="mb-4 flex items-center gap-2 font-semibold"><PlatformIcon platform={account.platform} /> {PLATFORM_LABELS[account.platform]}</div>
                  <DemographicsView d={report.demographics} platform={account.platform} />
                </div>
              ))}
            </div>
          </Section>
        </>
      )}

      {/* 5. Brand interest: counts only, never brand names */}
      <Section title="Brand interest">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          <Stat label="Profile views" value={d.interest.profileViews7d} sub={`${d.interest.profileViews30d} in the last 30 days`} />
          <Stat label="Search appearances" value={d.interest.searchAppearances7d} sub={`${d.interest.searchAppearances30d} in the last 30 days`} />
          <Stat label="Brands viewed your full report" value={d.interest.brandsViewedReportThisMonth} sub="This month" />
        </div>
        <p className="mt-2 flex items-center gap-1.5 text-xs text-muted"><Eye size={13} /> Last 7 days unless stated. Brands’ identities are kept private.</p>
      </Section>

      {/* 6. Account health */}
      <Section title="Account health" id="accounts">
        <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
          <ConnectPanel accounts={d.accounts} onChange={load} highlight={reconnect} />
          <div className="card p-5">
            <div className="flex items-baseline justify-between">
              <h3 className="font-semibold">Profile completeness</h3>
              <span className="text-lg font-bold tabular-nums">{d.completeness.percent}%</span>
            </div>
            <div className="mt-2 h-2 rounded-full bg-brand-50" role="progressbar" aria-valuenow={d.completeness.percent} aria-valuemin={0} aria-valuemax={100}>
              <div className="h-2 rounded-full bg-brand-700" style={{ width: `${d.completeness.percent}%` }} />
            </div>
            {d.completeness.missing.length > 0 && (
              <ul className="mt-4 grid gap-2 text-sm">
                {d.completeness.missing.map((m) => <li key={m} className="flex gap-2 text-muted"><Lightbulb size={15} className="mt-0.5 shrink-0 text-amber-500" />{m}</li>)}
              </ul>
            )}
            {missingPlatforms.includes('youtube') && hasAccounts && (
              <p className="mt-4 rounded-lg bg-canvas p-3 text-sm text-muted"><b className="text-ink">Tip:</b> Connect YouTube to reach brands looking for video creators.</p>
            )}
            <Link href="/settings" className="btn-secondary mt-4 w-full">Edit profile</Link>
          </div>
        </div>
      </Section>

      {/* 7. Share and invite */}
      <Section title="Share and invite">
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="card p-5">
            <h3 className="font-semibold">Your verified link</h3>
            <p className="mt-1 break-all text-sm text-brand-700">{profileUrl}</p>
            <p className="mt-1 text-sm text-muted">Put it in your bio or send it to brands. It shows your verified headline stats.</p>
            <div className="mt-4"><ShareButtons url={profileUrl} message="My verified creator stats on CreatorTrack:" /></div>
            <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-4">
              <Link href={`/c/${d.profile.slug}?preview=public`} className="btn-ghost"><Eye size={16} /> See how brands see me</Link>
              {hasAccounts && <a href="/api/creator/media-kit.pdf" className="btn-ghost"><Download size={16} /> Download my media kit (PDF)</a>}
            </div>
          </div>
          <div className="card p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-semibold">Invite a friend</h3>
                <p className="mt-1 text-sm text-muted">Know other creators? Share your link: it works for any number of friends.</p>
              </div>
              <div className="text-right">
                <div className="text-2xl font-bold tabular-nums">{d.referral.friendsJoined}</div>
                <div className="text-xs text-muted">friends joined</div>
              </div>
            </div>
            <p className="mt-2 break-all text-sm text-brand-700">{referralUrl}</p>
            <div className="mt-4">
              <ShareButtons url={referralUrl} message="I'm on CreatorTrack, where brands find creators with verified stats. Join free:" />
            </div>
            <div className="mt-4 flex items-center gap-2 border-t border-line pt-4 text-sm">
              <Award size={18} className={d.referral.communityBuilder ? 'text-amber-500' : 'text-muted'} />
              {d.referral.communityBuilder
                ? <span><b>Community Builder</b> badge earned. It’s shown on your profile.</span>
                : <span className="text-muted">{5 - d.referral.friendsJoined} more friend{5 - d.referral.friendsJoined === 1 ? '' : 's'} to earn the <b className="text-ink">Community Builder</b> badge.</span>}
            </div>
            <p className="mt-2 flex items-center gap-1.5 text-xs text-muted"><Users size={13} /> A friend counts once they’ve connected an account.</p>
          </div>
        </div>
        <p className="mt-3 flex items-center gap-1.5 text-xs text-muted"><Search size={13} /> A summary of your week arrives by email every Monday. Turn it off in <Link href="/settings" className="underline">Settings</Link>.</p>
      </Section>
    </div>
  );
}

function TaggedPost({ t, showPlatform }: { t: Tagged; showPlatform: boolean }) {
  return (
    <div className="flex items-center gap-1">
      {showPlatform && <PlatformIcon platform={t.platform} size={14} />}
      <div className="min-w-0 flex-1"><PostRow post={t.post} followers={t.followers} /></div>
    </div>
  );
}

function EngagementTrend({ report, account, cutoff }: { report: FullReport; account: PublicAccount; cutoff: string }) {
  const points = report.history.filter((h) => h.date >= cutoff && h.engagementRate !== null);
  if (points.length < 2) return null;
  const first = points[0].engagementRate!;
  const last = points[points.length - 1].engagementRate!;
  const delta = last - first;
  return (
    <div className="card mt-4 p-4">
      <h3 className="font-semibold">Engagement rate trend</h3>
      <p className="mt-1 text-sm text-muted">
        {pct(first)} → <b className="text-ink">{pct(last)}</b>{' '}
        <span className={delta >= 0 ? 'text-green-700' : 'text-red-700'}>({delta >= 0 ? '+' : ''}{delta.toFixed(2)} pts)</span>
        {' '}· your audience is {Math.abs(delta) < 0.1 ? 'about as engaged as before' : delta > 0 ? 'more engaged' : 'less engaged'} on {PLATFORM_LABELS[account.platform]}.
      </p>
    </div>
  );
}
