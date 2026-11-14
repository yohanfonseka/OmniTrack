import { useEffect, useState, type FormEvent } from 'react';
import { Copy, Upload } from 'lucide-react';
import { api } from '../api';
import { useShareOrigin } from '../auth';
import { PlatformIcon } from '../components/PlatformIcon';
import { ShareButtons, whatsappTo } from '../components/Share';
import { DemoBadge, Empty, Field, Notice, Spinner, Stat } from '../components/ui';
import { ago, compact, shortDate } from '../format';
import { Link } from '../router';
import type { Invite, InviteStatus, Platform } from '../../shared/types';

type Tab = 'overview' | 'invites' | 'creators' | 'brands' | 'referrers';

const INVITE_MESSAGE = (name: string) =>
  `Hi ${name}! You're invited to join CreatorTrack, where brands find creators with verified Instagram, TikTok and YouTube stats. It's free for creators. Join here:`;

const STATUS_STYLE: Record<InviteStatus, string> = {
  sent: 'bg-slate-100 text-slate-700',
  opened: 'bg-blue-50 text-blue-800',
  signed_up: 'bg-brand-50 text-brand-800',
  connected: 'bg-green-50 text-green-800',
  cancelled: 'bg-slate-100 text-slate-500',
  expired: 'bg-amber-50 text-amber-900',
};
const STATUS_LABEL: Record<InviteStatus, string> = {
  sent: 'Sent', opened: 'Opened', signed_up: 'Signed up', connected: 'Connected', cancelled: 'Cancelled', expired: 'Expired',
};

export function Admin() {
  const [tab, setTab] = useState<Tab>('overview');
  const tabs: [Tab, string][] = [['overview', 'Overview'], ['invites', 'Invitations'], ['creators', 'Creators'], ['brands', 'Brands'], ['referrers', 'Top referrers']];
  return (
    <div className="py-8">
      <h1 className="text-2xl font-bold tracking-tight">Admin</h1>
      <div className="mt-5 flex gap-1 overflow-x-auto border-b border-line" role="tablist">
        {tabs.map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
            className={`-mb-px whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium ${tab === id ? 'border-brand-700 text-ink' : 'border-transparent text-muted hover:text-ink'}`}>
            {label}
          </button>
        ))}
      </div>
      <div className="mt-6">
        {tab === 'overview' && <Overview />}
        {tab === 'invites' && <Invites />}
        {tab === 'creators' && <Creators />}
        {tab === 'brands' && <Brands />}
        {tab === 'referrers' && <Referrers />}
      </div>
    </div>
  );
}

function Overview() {
  const [o, setO] = useState<any>(null);
  useEffect(() => void api('/api/admin/overview').then(setO), []);
  if (!o) return <Spinner />;
  const progress = Math.min(100, Math.round((o.creatorsConnected / o.iteration2Target) * 100));
  return (
    <>
      <div className="card p-5">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="font-semibold">Progress to paid reports</h2>
          <span className="text-sm text-muted"><b className="text-lg text-ink tabular-nums">{o.creatorsConnected}</b> / {o.iteration2Target} connected creators</span>
        </div>
        <div className="mt-3 h-3 rounded-full bg-brand-50" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
          <div className="h-3 rounded-full bg-brand-700" style={{ width: `${Math.max(progress, 1)}%` }} />
        </div>
        {o.creatorsConnectedIncludingDemo !== o.creatorsConnected && (
          <p className="mt-2 text-xs text-muted">Demo-only creators aren’t counted ({o.creatorsConnectedIncludingDemo} including demo).</p>
        )}
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Creators signed up" value={o.creatorsSignedUp} />
        <Stat label="Brands" value={o.brands} sub={`${o.verifiedBrands} verified`} />
        <Stat label="Full report views" value={o.reportViews} sub={`${o.pdfDownloads} PDF downloads`} />
        <Stat label="Need reconnecting" value={o.needsReconnect} />
      </div>
      <div className="mt-4 grid grid-cols-3 gap-3">
        {(['instagram', 'tiktok', 'youtube'] as Platform[]).map((p) => (
          <div key={p} className="card flex items-center gap-3 p-4">
            <PlatformIcon platform={p} size={22} />
            <div><div className="text-xl font-bold tabular-nums">{o.accountsByPlatform[p]}</div><div className="text-xs text-muted">accounts</div></div>
          </div>
        ))}
      </div>
    </>
  );
}

/** Minimal CSV parser: handles quoted fields; expects a header row with name/email/phone. */
function parseCsv(text: string): { name: string; email: string; phone: string }[] {
  const rows: string[][] = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const cells: string[] = [];
    let cur = '', q = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (q) {
        if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
        else if (ch === '"') q = false;
        else cur += ch;
      } else if (ch === '"') q = true;
      else if (ch === ',') { cells.push(cur); cur = ''; }
      else cur += ch;
    }
    cells.push(cur);
    rows.push(cells.map((c) => c.trim()));
  }
  if (!rows.length) return [];
  const header = rows[0].map((h) => h.toLowerCase());
  const hasHeader = header.includes('name');
  const idx = (k: string, fallback: number) => (hasHeader ? header.indexOf(k) : fallback);
  const [ni, ei, pi] = [idx('name', 0), idx('email', 1), idx('phone', 2)];
  return rows.slice(hasHeader ? 1 : 0).map((r) => ({ name: r[ni] ?? '', email: ei >= 0 ? r[ei] ?? '' : '', phone: pi >= 0 ? r[pi] ?? '' : '' }));
}

function Invites() {
  const origin = useShareOrigin();
  const [items, setItems] = useState<Invite[] | null>(null);
  const [form, setForm] = useState({ name: '', email: '', phone: '', sendEmail: true });
  const [created, setCreated] = useState<Invite | null>(null);
  const [error, setError] = useState('');
  const [bulk, setBulk] = useState<{ created: number; errors: { row: number; error: string }[] } | null>(null);
  const [filter, setFilter] = useState<InviteStatus | ''>('');

  const load = () => api<{ items: Invite[] }>('/api/admin/invites').then((r) => setItems(r.items));
  useEffect(() => void load(), []);
  const link = (i: Invite) => `${origin}/join/${i.token}`;

  const create = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      const r = await api<{ invite: Invite }>('/api/admin/invites', { body: form });
      setCreated(r.invite);
      setForm({ name: '', email: '', phone: '', sendEmail: form.sendEmail });
      load();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const upload = async (file: File) => {
    setError('');
    const rows = parseCsv(await file.text());
    if (!rows.length) return setError('The file has no rows.');
    try {
      const r = await api<{ created: Invite[]; errors: { row: number; error: string }[] }>('/api/admin/invites/bulk', { body: { rows, sendEmail: form.sendEmail } });
      setBulk({ created: r.created.length, errors: r.errors });
      load();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const act = async (i: Invite, action: 'resend' | 'cancel') => {
    if (action === 'cancel' && !confirm(`Cancel the invitation for ${i.name}?`)) return;
    try {
      await api(`/api/admin/invites/${i.token}/${action}`, { body: {} });
      load();
    } catch (err) {
      alert((err as Error).message);
    }
  };

  const shown = (items ?? []).filter((i) => !filter || i.status === filter);
  const counts = (items ?? []).reduce<Record<string, number>>((m, i) => ({ ...m, [i.status]: (m[i.status] ?? 0) + 1 }), {});

  return (
    <div className="grid gap-6">
      <div className="grid gap-4 lg:grid-cols-2">
        <form className="card grid gap-4 p-5" onSubmit={create}>
          <h2 className="font-semibold">Invite a creator</h2>
          <Field label="Name"><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Phone (optional)" hint="For sending on WhatsApp."><input className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="077 123 4567" /></Field>
            <Field label="Email (optional)"><input className="input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.sendEmail} onChange={(e) => setForm({ ...form, sendEmail: e.target.checked })} /> Also email the invitation when an email address is given
          </label>
          {error && <Notice kind="error">{error}</Notice>}
          <div><button className="btn-primary">Create invite link</button></div>
        </form>

        <div className="grid content-start gap-4">
          {created && (
            <div className="card border-green-200 p-5">
              <h3 className="font-semibold">Invite link for {created.name}</h3>
              <p className="mt-1 break-all text-sm text-brand-700">{link(created)}</p>
              <p className="mt-1 text-xs text-muted">Works once · valid until {shortDate(created.expiresAt)}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {created.phone && (
                  <a className="btn-whatsapp" target="_blank" rel="noreferrer" href={whatsappTo(created.phone, `${INVITE_MESSAGE(created.name)} ${link(created)}`)}>
                    Send to {created.phone} on WhatsApp
                  </a>
                )}
              </div>
              <div className="mt-2"><ShareButtons url={link(created)} message={INVITE_MESSAGE(created.name)} /></div>
            </div>
          )}
          <div className="card p-5">
            <h2 className="font-semibold">Bulk invites (CSV)</h2>
            <p className="mt-1 text-sm text-muted">Columns: <code>name,email,phone</code> (email and phone optional). You get one link per row, sendable from the list below.</p>
            <label className="btn-secondary mt-3 cursor-pointer">
              <Upload size={16} /> Choose CSV file
              <input type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
            </label>
            {bulk && (
              <div className="mt-3 grid gap-2">
                <Notice kind="success">{bulk.created} invite links created.</Notice>
                {bulk.errors.length > 0 && <Notice kind="warn">{bulk.errors.map((e) => `Row ${e.row}: ${e.error}`).join(' · ')}</Notice>}
              </div>
            )}
          </div>
        </div>
      </div>

      <div>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h2 className="mr-2 font-semibold">Invitations</h2>
          {(['', 'sent', 'opened', 'signed_up', 'connected', 'expired', 'cancelled'] as const).map((s) => (
            <button key={s} onClick={() => setFilter(s)} className={`rounded-full px-3 py-1 text-xs font-medium ${filter === s ? 'bg-brand-700 text-white' : 'bg-white text-muted ring-1 ring-line'}`}>
              {s ? STATUS_LABEL[s] : 'All'} {s ? counts[s] ?? 0 : items?.length ?? 0}
            </button>
          ))}
        </div>
        {!items ? <Spinner /> : !shown.length ? <Empty>No invitations here.</Empty> : (
          <div className="card divide-y divide-line">
            {shown.map((i) => (
              <div key={i.token} className="flex flex-col gap-3 p-4 md:flex-row md:items-center">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{i.name}</span>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[i.status]}`}>{STATUS_LABEL[i.status]}</span>
                  </div>
                  <div className="mt-0.5 text-xs text-muted">
                    {[i.phone, i.email].filter(Boolean).join(' · ') || 'No contact details'} · created {ago(i.createdAt)}
                    {i.openedAt && ` · opened ${ago(i.openedAt)}`}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {['sent', 'opened', 'expired'].includes(i.status) && (
                    <>
                      <button className="btn-ghost" onClick={() => navigator.clipboard.writeText(link(i))}><Copy size={15} /> Copy</button>
                      {i.phone && <a className="btn-whatsapp" target="_blank" rel="noreferrer" href={whatsappTo(i.phone, `${INVITE_MESSAGE(i.name)} ${link(i)}`)}>WhatsApp</a>}
                      <button className="btn-secondary" onClick={() => act(i, 'resend')}>{i.status === 'expired' ? 'Renew' : 'Resend'}</button>
                      <button className="btn-ghost" onClick={() => act(i, 'cancel')}>Cancel</button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

interface AdminCreator {
  id: string; slug: string; displayName: string; email: string; emailVerified: boolean; disabled: boolean; hidden: boolean;
  city: string; createdAt: string; friendsJoined: number;
  platforms: { platform: Platform; username: string; followers: number; status: string; demo: boolean }[];
}

function Creators() {
  const [items, setItems] = useState<AdminCreator[] | null>(null);
  const [q, setQ] = useState('');
  const load = () => api<{ items: AdminCreator[] }>('/api/admin/creators').then((r) => setItems(r.items));
  useEffect(() => void load(), []);
  const toggle = async (c: AdminCreator, field: 'hidden' | 'disabled') => {
    if (field === 'hidden') await api(`/api/admin/creators/${c.id}`, { method: 'PATCH', body: { hidden: !c.hidden } });
    else await api(`/api/admin/users/${c.id}`, { method: 'PATCH', body: { disabled: !c.disabled } });
    load();
  };
  if (!items) return <Spinner />;
  const shown = items.filter((c) => !q || `${c.displayName} ${c.email} ${c.slug}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <>
      <input className="input mb-4 max-w-sm" placeholder="Search creators" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="card divide-y divide-line">
        {shown.map((c) => (
          <div key={c.id} className="flex flex-col gap-3 p-4 md:flex-row md:items-center">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <Link href={`/c/${c.slug}`} className="font-medium hover:underline">{c.displayName}</Link>
                {c.hidden && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs">Hidden</span>}
                {c.disabled && <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs text-red-800">Disabled</span>}
                {!c.emailVerified && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-900">Email unconfirmed</span>}
              </div>
              <div className="mt-0.5 text-xs text-muted">{c.email} · joined {shortDate(c.createdAt)}{c.friendsJoined ? ` · ${c.friendsJoined} friends joined` : ''}</div>
              <div className="mt-1.5 flex flex-wrap gap-3">
                {c.platforms.length ? c.platforms.map((p) => (
                  <span key={p.platform} className="flex items-center gap-1 text-xs text-muted">
                    <PlatformIcon platform={p.platform} size={14} /> @{p.username} · {compact(p.followers)}
                    {p.status !== 'active' && <span className="text-amber-800">(reconnect)</span>}
                    {p.demo && <DemoBadge />}
                  </span>
                )) : <span className="text-xs text-muted">No platforms connected</span>}
              </div>
            </div>
            <div className="flex gap-2">
              <button className="btn-secondary" onClick={() => toggle(c, 'hidden')}>{c.hidden ? 'Unhide' : 'Hide profile'}</button>
              <button className="btn-ghost" onClick={() => toggle(c, 'disabled')}>{c.disabled ? 'Enable' : 'Disable'}</button>
            </div>
          </div>
        ))}
        {!shown.length && <div className="p-6 text-center text-sm text-muted">No creators.</div>}
      </div>
    </>
  );
}

function Brands() {
  const [items, setItems] = useState<any[] | null>(null);
  const load = () => api<{ items: any[] }>('/api/admin/brands').then((r) => setItems(r.items));
  useEffect(() => void load(), []);
  if (!items) return <Spinner />;
  return (
    <div className="card divide-y divide-line">
      {items.map((b) => (
        <div key={b.id} className="flex flex-col gap-2 p-4 md:flex-row md:items-center">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="font-medium">{b.companyName ?? '(no company)'}</span>
              {!b.emailVerified && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-900">Email unconfirmed</span>}
              {b.disabled && <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs text-red-800">Disabled</span>}
            </div>
            <div className="text-xs text-muted">{b.name} · {b.email} · joined {shortDate(b.createdAt)} · {b.creatorsViewed} creators viewed · {b.pdfDownloads} PDFs</div>
          </div>
          <button className="btn-ghost" onClick={async () => { await api(`/api/admin/users/${b.id}`, { method: 'PATCH', body: { disabled: !b.disabled } }); load(); }}>
            {b.disabled ? 'Enable' : 'Disable'}
          </button>
        </div>
      ))}
      {!items.length && <div className="p-6 text-center text-sm text-muted">No brands yet.</div>}
    </div>
  );
}

function Referrers() {
  const [items, setItems] = useState<{ id: string; slug: string; displayName: string; friendsJoined: number }[] | null>(null);
  useEffect(() => void api('/api/admin/referrers').then((r: any) => setItems(r.items)), []);
  if (!items) return <Spinner />;
  if (!items.length) return <Empty>No referrals yet.</Empty>;
  return (
    <div className="card divide-y divide-line">
      {items.map((r, i) => (
        <div key={r.id} className="flex items-center gap-3 p-4">
          <span className="w-6 text-sm text-muted tabular-nums">{i + 1}</span>
          <Link href={`/c/${r.slug}`} className="flex-1 font-medium hover:underline">{r.displayName}</Link>
          <span className="text-sm"><b className="tabular-nums">{r.friendsJoined}</b> <span className="text-muted">friends joined</span></span>
        </div>
      ))}
    </div>
  );
}
