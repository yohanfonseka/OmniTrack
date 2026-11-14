import { useEffect, useState, type FormEvent } from 'react';
import { api } from '../api';
import { useAuth } from '../auth';
import { Field, Notice, Spinner } from '../components/ui';
import { navigate } from '../router';
import { ProfileForm } from './Onboarding';
import type { CreatorDashboard } from '../../shared/types';

function DeleteAccount() {
  const { refresh } = useAuth();
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await api('/api/account', { method: 'DELETE', body: { confirm } });
      await refresh();
      navigate('/');
    } catch (err) {
      setError((err as Error).message);
    }
  };
  return (
    <div className="card mt-6 border-red-200 p-6">
      <h2 className="font-semibold text-red-800">Delete my account</h2>
      <p className="mt-1 text-sm text-muted">This permanently removes your account, your profile, every connected platform and all stats we hold. It can’t be undone.</p>
      <form className="mt-4 flex flex-col gap-3 sm:flex-row" onSubmit={submit}>
        <input className="input sm:max-w-xs" placeholder="Type DELETE to confirm" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        <button className="btn-danger" disabled={confirm !== 'DELETE'}>Delete everything</button>
      </form>
      {error && <div className="mt-3"><Notice kind="error">{error}</Notice></div>}
    </div>
  );
}

function CreatorSettings() {
  const [dash, setDash] = useState<CreatorDashboard | null>(null);
  const [saved, setSaved] = useState('');
  const load = () => api<CreatorDashboard>('/api/creator/dashboard').then(setDash);
  useEffect(() => void load(), []);
  if (!dash) return <Spinner />;
  const toggleWeekly = async () => {
    await api('/api/creator/profile', { method: 'PUT', body: { weeklyEmail: !dash.profile.weeklyEmail } });
    await load();
  };
  return (
    <>
      <div className="card mt-6 p-6">
        <h2 className="mb-4 font-semibold">Profile</h2>
        {saved && <div className="mb-4"><Notice kind="success">{saved}</Notice></div>}
        <ProfileForm initial={dash.profile} submitLabel="Save changes" onSaved={() => { setSaved('Profile saved.'); load(); }} />
      </div>
      <div className="card mt-6 flex items-center justify-between gap-4 p-6">
        <div>
          <h2 className="font-semibold">Weekly summary email</h2>
          <p className="text-sm text-muted">Every Monday: follower change, your top post and brand interest.</p>
        </div>
        <button role="switch" aria-checked={dash.profile.weeklyEmail} onClick={toggleWeekly}
          className={`relative h-7 w-12 shrink-0 rounded-full transition ${dash.profile.weeklyEmail ? 'bg-brand-700' : 'bg-line'}`}>
          <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition ${dash.profile.weeklyEmail ? 'left-6' : 'left-1'}`} />
          <span className="sr-only">Weekly summary email</span>
        </button>
      </div>
    </>
  );
}

function BrandSettings() {
  const { me, refresh } = useAuth();
  const [name, setName] = useState(me?.name ?? '');
  const [companyName, setCompanyName] = useState(me?.companyName ?? '');
  const [msg, setMsg] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await api('/api/brand/profile', { method: 'PUT', body: { name, companyName } });
      await refresh();
      setMsg({ kind: 'success', text: 'Saved.' });
    } catch (err) {
      setMsg({ kind: 'error', text: (err as Error).message });
    }
  };
  return (
    <form className="card mt-6 grid gap-4 p-6" onSubmit={submit}>
      <h2 className="font-semibold">Brand details</h2>
      <Field label="Your name"><input className="input" value={name} onChange={(e) => setName(e.target.value)} required minLength={2} /></Field>
      <Field label="Company or brand name" hint="Printed on the PDF reports you download."><input className="input" value={companyName} onChange={(e) => setCompanyName(e.target.value)} required minLength={2} /></Field>
      {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
      <div><button className="btn-primary">Save</button></div>
    </form>
  );
}

export function Settings() {
  const { me } = useAuth();
  if (!me) return null;
  return (
    <div className="mx-auto max-w-2xl py-8">
      <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
      <p className="mt-1 text-muted">Signed in as {me.email}{me.hasPassword ? '' : ' (Google sign-in)'}</p>
      {me.role === 'creator' ? <CreatorSettings /> : <BrandSettings />}
      <DeleteAccount />
    </div>
  );
}
