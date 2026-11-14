import { useEffect, useState } from 'react';
import { Search, ShieldCheck, Sparkles, Users } from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../auth';
import { CreatorCardView } from '../components/CreatorCard';
import { Empty, Notice, Spinner } from '../components/ui';
import { Link, navigate, useQuery } from '../router';
import { CATEGORIES } from '../../shared/categories';
import { PLATFORM_LABELS, PLATFORMS, type CreatorCard } from '../../shared/types';

const FOLLOWER_RANGES = [
  { label: 'Any size', min: '', max: '' },
  { label: 'Nano (1K–10K)', min: '1000', max: '10000' },
  { label: 'Micro (10K–100K)', min: '10000', max: '100000' },
  { label: 'Mid (100K–500K)', min: '100000', max: '500000' },
  { label: 'Macro (500K+)', min: '500000', max: '' },
];

interface Result { total: number; page: number; pageSize: number; items: CreatorCard[] }

export function Home() {
  const { me } = useAuth();
  const query = useQuery();
  const [q, setQ] = useState(query.get('q') ?? '');
  const [location, setLocation] = useState(query.get('location') ?? '');
  const [data, setData] = useState<Result | null>(null);
  const [error, setError] = useState('');
  const qs = query.toString();

  useEffect(() => {
    setData(null);
    api<Result>(`/api/creators?${qs}`).then(setData, (e) => setError(e.message));
  }, [qs]);

  const set = (key: string, value: string) => {
    const next = new URLSearchParams(qs);
    value ? next.set(key, value) : next.delete(key);
    if (key !== 'page') next.delete('page');
    navigate(`/?${next}`, { replace: true });
  };
  const setRange = (i: number) => {
    const next = new URLSearchParams(qs);
    const r = FOLLOWER_RANGES[i];
    r.min ? next.set('minFollowers', r.min) : next.delete('minFollowers');
    r.max ? next.set('maxFollowers', r.max) : next.delete('maxFollowers');
    next.delete('page');
    navigate(`/?${next}`, { replace: true });
  };
  const rangeIndex = Math.max(0, FOLLOWER_RANGES.findIndex((r) => r.min === (query.get('minFollowers') ?? '') && r.max === (query.get('maxFollowers') ?? '')));
  const page = Number(query.get('page') || 1);
  const pages = data ? Math.ceil(data.total / data.pageSize) : 0;

  return (
    <>
      {!me && (
        <div className="py-10 sm:py-14">
          <div className="max-w-2xl">
            <span className="chip"><ShieldCheck size={14} /> Stats verified directly from each platform</span>
            <h1 className="mt-4 text-3xl font-bold tracking-tight sm:text-5xl">Find Sri Lankan creators with <span className="text-brand-700">real, verified</span> numbers.</h1>
            <p className="mt-4 text-lg text-muted">Instagram, TikTok and YouTube stats pulled straight from the platforms, with no screenshots and no guesswork. Free for creators, always.</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="/signup?role=creator" className="btn-primary"><Sparkles size={16} /> I'm a creator: join free</Link>
              <Link href="/signup?role=brand" className="btn-secondary"><Users size={16} /> I'm a brand</Link>
            </div>
          </div>
        </div>
      )}

      <div className={me ? 'pt-8' : ''}>
        <h2 className="text-xl font-semibold">{me ? 'Find creators' : 'Browse creators'}</h2>
        <form className="mt-4 grid gap-3 md:grid-cols-[1fr_200px_auto]" onSubmit={(e) => { e.preventDefault(); const n = new URLSearchParams(qs); q ? n.set('q', q) : n.delete('q'); location ? n.set('location', location) : n.delete('location'); n.delete('page'); navigate(`/?${n}`, { replace: true }); }}>
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input className="input pl-9" placeholder="Search by name, handle or bio" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <input className="input" placeholder="City or country" value={location} onChange={(e) => setLocation(e.target.value)} />
          <button className="btn-primary">Search</button>
        </form>
        <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-5">
          <select className="input" value={query.get('category') ?? ''} onChange={(e) => set('category', e.target.value)} aria-label="Category">
            <option value="">All categories</option>
            {CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
          <select className="input" value={query.get('platform') ?? ''} onChange={(e) => set('platform', e.target.value)} aria-label="Platform">
            <option value="">All platforms</option>
            {PLATFORMS.map((p) => <option key={p} value={p}>{PLATFORM_LABELS[p]}</option>)}
          </select>
          <select className="input" value={rangeIndex} onChange={(e) => setRange(Number(e.target.value))} aria-label="Followers">
            {FOLLOWER_RANGES.map((r, i) => <option key={r.label} value={i}>{r.label}</option>)}
          </select>
          <select className="input" value={query.get('minEngagement') ?? ''} onChange={(e) => set('minEngagement', e.target.value)} aria-label="Engagement">
            <option value="">Any engagement</option>
            <option value="1">1%+ engagement</option>
            <option value="3">3%+ engagement</option>
            <option value="5">5%+ engagement</option>
          </select>
          <select className="input col-span-2 md:col-span-1" value={query.get('sort') ?? ''} onChange={(e) => set('sort', e.target.value)} aria-label="Sort">
            <option value="">Sort: most followers</option>
            <option value="engagement">Sort: highest engagement</option>
            <option value="recent">Sort: recently verified</option>
          </select>
        </div>

        <div className="mt-6">
          {error && <Notice kind="error">{error}</Notice>}
          {!data && !error && <Spinner />}
          {data && (
            <>
              <p className="mb-3 text-sm text-muted">{data.total} creator{data.total === 1 ? '' : 's'}</p>
              {data.items.length ? (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {data.items.map((c) => <CreatorCardView key={c.id} card={c} />)}
                </div>
              ) : (
                <Empty>No creators match these filters yet. Try widening your search.</Empty>
              )}
              {pages > 1 && (
                <div className="mt-6 flex items-center justify-center gap-3">
                  <button className="btn-secondary" disabled={page <= 1} onClick={() => set('page', String(page - 1))}>Previous</button>
                  <span className="text-sm text-muted">Page {page} of {pages}</span>
                  <button className="btn-secondary" disabled={page >= pages} onClick={() => set('page', String(page + 1))}>Next</button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
