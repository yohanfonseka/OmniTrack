import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Building2, Sparkles } from 'lucide-react';
import { api, ApiError } from '../api';
import { useAuth } from '../auth';
import { Field, GoogleButton, Notice, Spinner } from '../components/ui';
import { Link, navigate, useQuery } from '../router';
import type { Me, Role } from '../../shared/types';

function Shell({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-md py-10">
      <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
      {subtitle && <p className="mt-1.5 text-muted">{subtitle}</p>}
      <div className="card mt-6 p-6">{children}</div>
    </div>
  );
}

function Or() {
  return (
    <div className="my-5 flex items-center gap-3 text-xs text-muted">
      <div className="h-px flex-1 bg-line" /> or <div className="h-px flex-1 bg-line" />
    </div>
  );
}

interface SignupProps {
  inviteToken?: string;
  inviteName?: string;
  inviteEmail?: string;
  refCode?: string;
  referrerName?: string;
}

export function Signup(props: SignupProps) {
  const { config, refresh } = useAuth();
  const query = useQuery();
  const fixedCreator = !!(props.inviteToken || props.refCode);
  const [role, setRole] = useState<Role | null>(fixedCreator ? 'creator' : (query.get('role') as Role) || null);
  const [name, setName] = useState(props.inviteName ?? '');
  const [companyName, setCompanyName] = useState('');
  const [email, setEmail] = useState(props.inviteEmail ?? '');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const returnTo = query.get('returnTo') ?? undefined;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const r = await api<{ user: Me; next: string }>('/api/auth/signup', {
        body: { role, name, companyName, email, password, invite: props.inviteToken, ref: props.refCode, returnTo },
      });
      await refresh();
      navigate(r.next);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (!role) {
    return (
      <Shell title="Join CreatorTrack" subtitle="Which describes you?">
        <div className="grid gap-3">
          <button className="card flex items-start gap-3 p-4 text-left hover:border-brand-300" onClick={() => setRole('creator')}>
            <Sparkles className="mt-0.5 text-brand-700" />
            <div>
              <div className="font-semibold">I'm a creator</div>
              <div className="text-sm text-muted">Show brands your verified stats and get a free dashboard. Free, always.</div>
            </div>
          </button>
          <button className="card flex items-start gap-3 p-4 text-left hover:border-brand-300" onClick={() => setRole('brand')}>
            <Building2 className="mt-0.5 text-brand-700" />
            <div>
              <div className="font-semibold">I'm a brand or agency</div>
              <div className="text-sm text-muted">Find creators and see full verified reports.</div>
            </div>
          </button>
        </div>
        <p className="mt-5 text-center text-sm text-muted">Already have an account? <Link href="/login" className="font-semibold text-brand-700">Sign in</Link></p>
      </Shell>
    );
  }

  const googleParams = new URLSearchParams({ role });
  if (props.refCode) googleParams.set('ref', props.refCode);
  if (props.inviteToken) googleParams.set('invite', props.inviteToken);
  if (returnTo) googleParams.set('returnTo', returnTo);

  const title = props.inviteName
    ? `Welcome, ${props.inviteName}!`
    : props.referrerName
      ? `${props.referrerName} invited you`
      : role === 'creator' ? 'Create your creator profile' : 'Create a brand account';
  const subtitle = role === 'creator'
    ? 'Free forever. Connect Instagram, TikTok or YouTube and get a verified link to share with brands.'
    : 'Free to join. Confirm your email to see full creator reports and download PDFs.';

  return (
    <Shell title={title} subtitle={subtitle}>
      {config?.google && (
        <>
          <GoogleButton href={`/api/auth/google?${googleParams}`} />
          <Or />
        </>
      )}
      <form className="grid gap-4" onSubmit={submit}>
        <Field label={role === 'creator' ? 'Your name' : 'Your name'}>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} required minLength={2} autoComplete="name" />
        </Field>
        {role === 'brand' && (
          <Field label="Company or brand name">
            <input className="input" value={companyName} onChange={(e) => setCompanyName(e.target.value)} required minLength={2} autoComplete="organization" />
          </Field>
        )}
        <Field label="Email" hint={props.inviteEmail ? 'Use this address and it’s confirmed automatically.' : undefined}>
          <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
        </Field>
        <Field label="Password" hint="At least 8 characters.">
          <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} autoComplete="new-password" />
        </Field>
        {error && <Notice kind="error">{error}</Notice>}
        <button className="btn-primary" disabled={busy}>{busy ? 'Creating account…' : 'Create account'}</button>
        <p className="text-center text-xs text-muted">
          By joining you agree to our <Link href="/terms" className="underline">Terms</Link> and <Link href="/privacy" className="underline">Privacy Policy</Link>.
        </p>
      </form>
      {!fixedCreator && (
        <p className="mt-4 text-center text-sm text-muted">
          {role === 'creator' ? 'Signing up for a brand?' : 'Are you a creator?'}{' '}
          <button className="font-semibold text-brand-700" onClick={() => setRole(role === 'creator' ? 'brand' : 'creator')}>Switch</button>
        </p>
      )}
    </Shell>
  );
}

export function Login() {
  const { config, refresh } = useAuth();
  const query = useQuery();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(query.get('error') ?? '');
  const [busy, setBusy] = useState(false);
  const returnTo = query.get('returnTo') ?? undefined;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const r = await api<{ next: string }>('/api/auth/login', { body: { email, password, returnTo } });
      await refresh();
      navigate(r.next);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Shell title="Welcome back">
      {config?.google && (
        <>
          <GoogleButton href={`/api/auth/google${returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : ''}`} />
          <Or />
        </>
      )}
      <form className="grid gap-4" onSubmit={submit}>
        <Field label="Email">
          <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
        </Field>
        <Field label="Password">
          <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" />
        </Field>
        {error && <Notice kind="error">{error}</Notice>}
        <button className="btn-primary" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
      </form>
      <div className="mt-4 flex justify-between text-sm">
        <Link href="/forgot-password" className="text-muted hover:text-ink">Forgot password?</Link>
        <Link href={`/signup${returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : ''}`} className="font-semibold text-brand-700">Create an account</Link>
      </div>
    </Shell>
  );
}

export function VerifyEmail() {
  const token = useQuery().get('token') ?? '';
  const { me, refresh } = useAuth();
  const [state, setState] = useState<'working' | 'ok' | string>('working');
  const started = useRef(false);
  useEffect(() => {
    // The link is single-use: never send it twice (React dev mode runs effects twice).
    if (started.current) return;
    started.current = true;
    api('/api/auth/verify-email', { body: { token } })
      .then(() => refresh())
      .then(() => setState('ok'), (e) => setState(e.message));
  }, [token, refresh]);
  if (state === 'working') return <Spinner label="Confirming your email…" />;
  return (
    <Shell title={state === 'ok' ? 'Email confirmed' : 'Link problem'}>
      {state === 'ok' ? (
        <>
          <Notice kind="success">Thanks, your email address is confirmed.</Notice>
          <Link href={me?.role === 'creator' ? '/dashboard' : '/'} className="btn-primary mt-4 w-full">Continue</Link>
        </>
      ) : (
        <Notice kind="error">{state}</Notice>
      )}
    </Shell>
  );
}

export function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await api('/api/auth/forgot-password', { body: { email } });
      setSent(true);
    } catch (err) {
      setError((err as Error).message);
    }
  };
  return (
    <Shell title="Reset your password" subtitle="We’ll email you a link to choose a new one.">
      {sent ? (
        <Notice kind="success">If an account exists for {email}, a reset link is on its way. It’s valid for 1 hour.</Notice>
      ) : (
        <form className="grid gap-4" onSubmit={submit}>
          <Field label="Email"><input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></Field>
          {error && <Notice kind="error">{error}</Notice>}
          <button className="btn-primary">Send reset link</button>
        </form>
      )}
    </Shell>
  );
}

export function ResetPassword() {
  const token = useQuery().get('token') ?? '';
  const [password, setPassword] = useState('');
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await api('/api/auth/reset-password', { body: { token, password } });
      setDone(true);
    } catch (err) {
      setError((err as Error).message);
    }
  };
  return (
    <Shell title="Choose a new password">
      {done ? (
        <>
          <Notice kind="success">Password updated. Please sign in.</Notice>
          <Link href="/login" className="btn-primary mt-4 w-full">Sign in</Link>
        </>
      ) : (
        <form className="grid gap-4" onSubmit={submit}>
          <Field label="New password" hint="At least 8 characters.">
            <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} autoComplete="new-password" />
          </Field>
          {error && <Notice kind="error">{error}</Notice>}
          <button className="btn-primary">Save password</button>
        </form>
      )}
    </Shell>
  );
}

/** /join/:token — personal invitation from the admin. */
export function Join({ token }: { token: string }) {
  const { me } = useAuth();
  const [invite, setInvite] = useState<{ name: string; email: string } | null>(null);
  const [error, setError] = useState<{ status: number; message: string } | null>(null);
  useEffect(() => {
    api<{ name: string; email: string }>(`/api/invites/${token}`).then(setInvite, (e: ApiError) => setError({ status: e.status, message: e.message }));
  }, [token]);
  if (me) return <Shell title="You’re signed in"><Notice>You already have an account.</Notice><Link href="/dashboard" className="btn-primary mt-4 w-full">Go to my dashboard</Link></Shell>;
  if (error) {
    return (
      <Shell title="Invitation">
        <Notice kind="warn">{error.message}</Notice>
        <Link href={error.status === 409 ? '/login' : '/signup?role=creator'} className="btn-primary mt-4 w-full">{error.status === 409 ? 'Sign in' : 'Sign up as a creator'}</Link>
      </Shell>
    );
  }
  if (!invite) return <Spinner />;
  return <Signup inviteToken={token} inviteName={invite.name} inviteEmail={invite.email} />;
}

/** /r/:code — a creator's reusable "invite a friend" link. */
export function Referral({ code }: { code: string }) {
  const { me } = useAuth();
  const [info, setInfo] = useState<{ referrerName: string; code: string } | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    api<{ referrerName: string; code: string }>(`/api/referrals/${code}`).then(setInfo, (e) => setError(e.message));
  }, [code]);
  if (me) return <Shell title="You’re signed in"><Link href="/" className="btn-primary w-full">Continue</Link></Shell>;
  if (error) return <Signup />;
  if (!info) return <Spinner />;
  return <Signup refCode={info.code} referrerName={info.referrerName} />;
}

/** Brands who joined with Google still need a company name. */
export function BrandOnboarding() {
  const { me, refresh } = useAuth();
  const [companyName, setCompanyName] = useState(me?.companyName ?? '');
  const [error, setError] = useState('');
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await api('/api/brand/profile', { method: 'PUT', body: { companyName } });
      await refresh();
      navigate('/');
    } catch (err) {
      setError((err as Error).message);
    }
  };
  return (
    <Shell title="One more thing" subtitle="Which company or brand are you with?">
      <form className="grid gap-4" onSubmit={submit}>
        <Field label="Company or brand name"><input className="input" value={companyName} onChange={(e) => setCompanyName(e.target.value)} required minLength={2} /></Field>
        {error && <Notice kind="error">{error}</Notice>}
        <button className="btn-primary">Continue</button>
      </form>
    </Shell>
  );
}
