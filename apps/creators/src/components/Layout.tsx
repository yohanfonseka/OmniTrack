import { useState, type ReactNode } from 'react';
import { LogOut, Menu, X } from 'lucide-react';
import { useAuth } from '../auth';
import { Link, navigate } from '../router';
import { Notice } from './ui';
import { api } from '../api';

export function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2 font-bold text-ink">
      <img src="/favicon.svg" alt="" width={28} height={28} />
      <span className="text-lg tracking-tight">Creator<span className="text-brand-700">Track</span></span>
    </Link>
  );
}

function VerifyEmailBanner() {
  const { me } = useAuth();
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState('');
  if (!me || me.emailVerified) return null;
  const resend = async () => {
    try {
      await api('/api/auth/resend-verification', { body: {} });
      setSent(true);
    } catch (e) {
      setErr((e as Error).message);
    }
  };
  return (
    <div className="mx-auto max-w-6xl px-4 pt-4">
      <Notice kind="warn">
        Please confirm your email: we sent a link to <b>{me.email}</b>.
        {me.role === 'brand' && ' Full creator reports unlock once it’s confirmed.'}{' '}
        {sent ? <span className="font-medium">New link sent.</span> : <button className="font-semibold underline" onClick={resend}>Resend link</button>}
        {err && <span className="ml-2 text-red-700">{err}</span>}
      </Notice>
    </div>
  );
}

export function Layout({ children }: { children: ReactNode }) {
  const { me, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const links: { href: string; label: string }[] = [{ href: '/', label: 'Find creators' }];
  if (me?.role === 'creator') links.push({ href: '/dashboard', label: 'My dashboard' }, { href: '/settings', label: 'Settings' });
  if (me?.role === 'brand') links.push({ href: '/brand', label: 'Recently viewed' }, { href: '/settings', label: 'Settings' });
  if (me?.isAdmin) links.push({ href: '/admin', label: 'Admin' });

  const doLogout = async () => {
    await logout();
    navigate('/');
  };

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-20 border-b border-line bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4">
          <Logo />
          <nav className="hidden items-center gap-1 md:flex">
            {links.map((l) => <Link key={l.href} href={l.href} className="btn-ghost">{l.label}</Link>)}
            {me ? (
              <button className="btn-ghost" onClick={doLogout}><LogOut size={16} /> Sign out</button>
            ) : (
              <>
                <Link href="/login" className="btn-ghost">Sign in</Link>
                <Link href="/signup" className="btn-primary">Join free</Link>
              </>
            )}
          </nav>
          <button className="btn-ghost md:hidden" onClick={() => setOpen(!open)} aria-label="Menu">{open ? <X size={20} /> : <Menu size={20} />}</button>
        </div>
        {open && (
          <nav className="flex flex-col gap-1 border-t border-line px-4 py-3 md:hidden" onClick={() => setOpen(false)}>
            {links.map((l) => <Link key={l.href} href={l.href} className="btn-ghost justify-start">{l.label}</Link>)}
            {me ? <button className="btn-ghost justify-start" onClick={doLogout}>Sign out</button> : (
              <>
                <Link href="/login" className="btn-ghost justify-start">Sign in</Link>
                <Link href="/signup" className="btn-primary">Join free</Link>
              </>
            )}
          </nav>
        )}
      </header>
      <VerifyEmailBanner />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-16">{children}</main>
      <footer className="border-t border-line bg-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-6 text-sm text-muted sm:flex-row sm:items-center sm:justify-between">
          <span>© {new Date().getFullYear()} CreatorTrack · creatortrack.lk · Free for creators, always.</span>
          <div className="flex gap-4">
            <Link href="/privacy" className="hover:text-ink">Privacy</Link>
            <Link href="/terms" className="hover:text-ink">Terms</Link>
            <Link href="/data-deletion" className="hover:text-ink">Delete my data</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
