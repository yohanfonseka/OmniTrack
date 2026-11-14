import { useEffect, useState } from 'react';
import { Award, Download, Eye, Lock, MapPin } from 'lucide-react';
import { api } from '../api';
import { useAuth, useShareOrigin } from '../auth';
import { Avatar } from '../components/CreatorCard';
import { AccountHeader, HeadlineStats, PlatformReport } from '../components/Report';
import { ShareButtons } from '../components/Share';
import { Notice, Spinner, VerifiedBadge } from '../components/ui';
import { compact } from '../format';
import { Link, useLocation, useQuery } from '../router';
import { categoryLabel } from '../../shared/categories';
import { PLATFORM_LABELS, type CreatorProfilePage, type Platform } from '../../shared/types';

function LockedPanel({ access, slug }: { access: CreatorProfilePage['access']; slug: string }) {
  const { me } = useAuth();
  const returnTo = encodeURIComponent(`/c/${slug}`);
  return (
    <div className="card mt-6 overflow-hidden">
      <div className="bg-gradient-to-br from-brand-50 to-white p-6 sm:p-8">
        <div className="flex items-center gap-2 font-semibold text-brand-800"><Lock size={18} /> Full report</div>
        <p className="mt-2 max-w-xl text-muted">
          Audience demographics (age, gender, country, city), recent posts with their stats, follower growth history and a downloadable PDF report.
        </p>
        <div className="mt-5">
          {access === 'locked_visitor' && (
            <div className="flex flex-wrap gap-3">
              <Link href={`/signup?role=brand&returnTo=${returnTo}`} className="btn-primary">Sign up free as a brand</Link>
              <Link href={`/login?returnTo=${returnTo}`} className="btn-secondary">Sign in</Link>
            </div>
          )}
          {access === 'locked_unverified' && (
            <Notice kind="warn">Confirm your email address ({me?.email}) to unlock full reports. Check your inbox for the link, or resend it from the banner above.</Notice>
          )}
          {access === 'locked_creator' && <Notice>Full reports are available to brand accounts.</Notice>}
        </div>
      </div>
    </div>
  );
}

export function Profile({ slug }: { slug: string }) {
  const { me } = useAuth();
  const origin = useShareOrigin();
  const preview = useQuery().get('preview') === 'public';
  const { search } = useLocation();
  const [page, setPage] = useState<CreatorProfilePage | null>(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<Platform | null>(null);

  useEffect(() => {
    setPage(null);
    api<CreatorProfilePage>(`/api/creators/${slug}${preview ? '?preview=public' : ''}`).then((p) => {
      setPage(p);
      setTab(p.accounts[0]?.platform ?? null);
    }, (e) => setError(e.message));
  }, [slug, preview, me?.emailVerified, search]);

  if (error) return <div className="py-10"><Notice kind="error">{error}</Notice></div>;
  if (!page) return <Spinner />;

  const unlocked = page.access === 'owner' || page.access === 'full';
  const avatar = page.accounts.find((a) => a.avatarUrl)?.avatarUrl;
  const account = page.accounts.find((a) => a.platform === tab);
  const report = page.reports?.find((r) => r.platform === tab);
  const url = `${origin}/c/${page.slug}`;

  return (
    <div className="py-8">
      {preview && (
        <div className="mb-6"><Notice>This is how brands who aren’t signed in see your profile. <Link href={`/c/${slug}`} className="font-semibold underline">Back to my view</Link></Notice></div>
      )}
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
        <Avatar name={page.displayName} url={avatar} size={88} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{page.displayName}</h1>
            <VerifiedBadge />
            {page.communityBuilder && <span className="chip bg-amber-50 text-amber-900"><Award size={13} /> Community Builder</span>}
          </div>
          {(page.city || page.country) && (
            <div className="mt-1 flex items-center gap-1 text-sm text-muted"><MapPin size={14} /> {[page.city, page.country].filter(Boolean).join(', ')}</div>
          )}
          <div className="mt-3 flex flex-wrap gap-1.5">{page.categories.map((c) => <span key={c} className="chip">{categoryLabel(c)}</span>)}</div>
          {page.bio && <p className="mt-3 max-w-2xl whitespace-pre-line text-ink/90">{page.bio}</p>}
          <div className="mt-3 text-sm text-muted">
            <b className="text-ink">{compact(page.totalFollowers)}</b> total followers across {page.accounts.length} platform{page.accounts.length === 1 ? '' : 's'}
          </div>
        </div>
        <div className="flex flex-col gap-2 sm:items-end">
          {page.access === 'owner' && !preview && (
            <Link href={`/c/${slug}?preview=public`} className="btn-secondary"><Eye size={16} /> See how brands see me</Link>
          )}
          {unlocked && page.accounts.length > 0 && (
            <a className="btn-primary" href={page.access === 'owner' ? '/api/creator/media-kit.pdf' : `/api/creators/${slug}/report.pdf`}>
              <Download size={16} /> {page.access === 'owner' ? 'Download media kit' : 'Download PDF report'}
            </a>
          )}
        </div>
      </div>

      {page.access === 'owner' && !preview && (
        <div className="card mt-6 p-4">
          <div className="mb-2 text-sm font-medium">Share your verified link</div>
          <ShareButtons url={url} message="My verified creator stats on CreatorTrack:" />
        </div>
      )}

      {page.accounts.length === 0 ? (
        <div className="mt-8"><Notice>No platforms connected yet.</Notice></div>
      ) : (
        <>
          <div className="mt-8 flex gap-1 overflow-x-auto border-b border-line" role="tablist">
            {page.accounts.map((a) => (
              <button
                key={a.platform}
                role="tab"
                aria-selected={tab === a.platform}
                onClick={() => setTab(a.platform)}
                className={`-mb-px flex items-center gap-2 whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium ${tab === a.platform ? 'border-brand-700 text-ink' : 'border-transparent text-muted hover:text-ink'}`}
              >
                {PLATFORM_LABELS[a.platform]}
              </button>
            ))}
          </div>
          {account && (
            <div className="mt-5 grid gap-5">
              <AccountHeader account={account} />
              <HeadlineStats account={account} />
              {unlocked && report ? <PlatformReport account={account} report={report} /> : null}
            </div>
          )}
          {!unlocked && <LockedPanel access={page.access} slug={slug} />}
        </>
      )}
      <p className="mt-8 text-xs text-muted">Stats are pulled directly from each platform through its official API after the creator connects their account, then refreshed daily.</p>
    </div>
  );
}
