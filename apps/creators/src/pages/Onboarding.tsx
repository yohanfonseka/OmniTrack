import { useEffect, useState, type FormEvent } from 'react';
import { api } from '../api';
import { useAuth } from '../auth';
import { CategoryPicker } from '../components/CategoryPicker';
import { ConnectPanel } from '../components/ConnectPanel';
import { Field, Notice, Spinner } from '../components/ui';
import { navigate, useQuery } from '../router';
import { PLATFORM_LABELS, type CreatorDashboard, type Platform } from '../../shared/types';
import type { CategoryId } from '../../shared/categories';

export function ProfileForm({ initial, submitLabel, onSaved }: { initial: CreatorDashboard['profile']; submitLabel: string; onSaved: () => void }) {
  const [f, setF] = useState(initial);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF({ ...f, [k]: v });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api('/api/creator/profile', { method: 'PUT', body: f });
      onSaved();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="grid gap-5" onSubmit={submit}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Display name"><input className="input" value={f.displayName} onChange={(e) => set('displayName', e.target.value)} required minLength={2} maxLength={60} /></Field>
        <Field label="Your link" hint={`creatortrack.lk/c/${f.slug || '…'}`}>
          <input className="input" value={f.slug} onChange={(e) => set('slug', e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))} required minLength={3} maxLength={30} />
        </Field>
      </div>
      <Field label="Short bio" hint={`${f.bio.length}/400 · what you create and who your audience is`}>
        <textarea className="input min-h-24" value={f.bio} onChange={(e) => set('bio', e.target.value)} maxLength={400} />
      </Field>
      <div>
        <span className="label">Categories <span className="font-normal text-muted">(pick up to 5, used in brand search)</span></span>
        <CategoryPicker value={f.categories} onChange={(v: CategoryId[]) => set('categories', v)} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="City"><input className="input" value={f.city} onChange={(e) => set('city', e.target.value)} maxLength={60} placeholder="e.g. Colombo" /></Field>
        <Field label="Country"><input className="input" value={f.country} onChange={(e) => set('country', e.target.value)} maxLength={60} /></Field>
      </div>
      <Field label="Contact email" hint="Private. Only CreatorTrack uses it for now; it’s never shown to brands.">
        <input className="input" type="email" value={f.contactEmail} onChange={(e) => set('contactEmail', e.target.value)} />
      </Field>
      {error && <Notice kind="error">{error}</Notice>}
      <div><button className="btn-primary" disabled={busy || f.categories.length === 0}>{busy ? 'Saving…' : submitLabel}</button></div>
    </form>
  );
}

export function Onboarding() {
  const query = useQuery();
  const { refresh } = useAuth();
  const [dash, setDash] = useState<CreatorDashboard | null>(null);
  const step = query.get('step') === 'connect' ? 'connect' : 'profile';
  const load = () => api<CreatorDashboard>('/api/creator/dashboard').then(setDash);
  useEffect(() => void load(), []);
  if (!dash) return <Spinner />;

  const connected = query.get('connected') as Platform | null;
  const connectError = query.get('connect_error');

  return (
    <div className="mx-auto max-w-2xl py-8">
      <div className="text-sm font-medium text-brand-700">Step {step === 'profile' ? 1 : 2} of 2</div>
      {step === 'profile' ? (
        <>
          <h1 className="mt-1 text-2xl font-bold">Set up your profile</h1>
          <p className="mt-1 text-muted">This is what brands see. You can change it any time.</p>
          <div className="card mt-6 p-6">
            <ProfileForm initial={dash.profile} submitLabel="Save and continue" onSaved={() => { refresh(); navigate('/onboarding?step=connect'); }} />
          </div>
        </>
      ) : (
        <>
          <h1 className="mt-1 text-2xl font-bold">Connect your accounts</h1>
          <p className="mt-1 text-muted">
            We read your stats straight from each platform, so brands know they’re real. We never post anything, and you can disconnect at any time.
            Connect at least one to appear in search.
          </p>
          <div className="mt-6 grid gap-4">
            {connected && <Notice kind="success">{PLATFORM_LABELS[connected]} connected. Your stats are in.</Notice>}
            {connectError && <Notice kind="error">{connectError}</Notice>}
            <ConnectPanel accounts={dash.accounts} from="onboarding" onChange={load} />
            <div className="flex flex-wrap items-center justify-between gap-3">
              <button className="btn-ghost" onClick={() => navigate('/onboarding')}>Back</button>
              <button className="btn-primary" onClick={() => { refresh(); navigate('/dashboard'); }}>
                {dash.accounts.length ? 'Go to my dashboard' : 'Skip for now'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
