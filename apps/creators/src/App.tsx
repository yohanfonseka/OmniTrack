import { useEffect, type ReactNode } from 'react';
import { useAuth } from './auth';
import { Layout } from './components/Layout';
import { Spinner } from './components/ui';
import { match, navigate, useLocation } from './router';
import { Admin } from './pages/Admin';
import { BrandOnboarding, ForgotPassword, Join, Login, Referral, ResetPassword, Signup, VerifyEmail } from './pages/Auth';
import { BrandHome } from './pages/Brand';
import { Dashboard } from './pages/Dashboard';
import { Home } from './pages/Home';
import { DataDeletion, NotFound, Privacy, Terms } from './pages/Legal';
import { Onboarding } from './pages/Onboarding';
import { Profile } from './pages/Profile';
import { Settings } from './pages/Settings';
import type { Role } from '../shared/types';

function Redirect({ to }: { to: string }) {
  useEffect(() => navigate(to, { replace: true }), [to]);
  return null;
}

/** Signed-in (and optionally role-specific) pages. */
function Guard({ role, admin, children }: { role?: Role; admin?: boolean; children: ReactNode }) {
  const { me } = useAuth();
  const { path, search } = useLocation();
  if (!me) return <Redirect to={`/login?returnTo=${encodeURIComponent(path + search)}`} />;
  if (role && me.role !== role) return <Redirect to="/" />;
  if (admin && !me.isAdmin) return <Redirect to="/" />;
  return <>{children}</>;
}

function GuestOnly({ children }: { children: ReactNode }) {
  const { me } = useAuth();
  if (me) return <Redirect to={me.role === 'creator' ? '/dashboard' : '/'} />;
  return <>{children}</>;
}

function route(path: string): ReactNode {
  let p: Record<string, string> | null;
  switch (path.replace(/\/$/, '') || '/') {
    case '/': return <Home />;
    case '/signup': return <GuestOnly><Signup /></GuestOnly>;
    case '/login': return <GuestOnly><Login /></GuestOnly>;
    case '/verify-email': return <VerifyEmail />;
    case '/forgot-password': return <ForgotPassword />;
    case '/reset-password': return <ResetPassword />;
    case '/onboarding': return <Guard role="creator"><Onboarding /></Guard>;
    case '/onboarding/brand': return <Guard role="brand"><BrandOnboarding /></Guard>;
    case '/dashboard': return <Guard role="creator"><Dashboard /></Guard>;
    case '/brand': return <Guard role="brand"><BrandHome /></Guard>;
    case '/settings': return <Guard><Settings /></Guard>;
    case '/admin': return <Guard admin><Admin /></Guard>;
    case '/privacy': return <Privacy />;
    case '/terms': return <Terms />;
    case '/data-deletion': return <DataDeletion />;
  }
  if ((p = match('/c/:slug', path))) return <Profile key={p.slug} slug={p.slug} />;
  if ((p = match('/join/:token', path))) return <Join token={p.token} />;
  if ((p = match('/r/:code', path))) return <Referral code={p.code} />;
  return <NotFound />;
}

export function App() {
  const { loading } = useAuth();
  const { path } = useLocation();
  return <Layout>{loading ? <Spinner /> : route(path)}</Layout>;
}
