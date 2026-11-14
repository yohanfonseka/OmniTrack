import { useState } from 'react';
import { RefreshCw, Unplug } from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../auth';
import { ago } from '../format';
import { PLATFORM_LABELS, PLATFORMS, type Platform, type PublicAccount } from '../../shared/types';
import { PlatformIcon } from './PlatformIcon';
import { DemoBadge, Notice } from './ui';

const HELP: Record<Platform, string> = {
  instagram: 'Needs a free Creator or Business account. In Instagram: Settings → Account type and tools → Switch to professional account.',
  tiktok: 'Any TikTok account works. Audience demographics aren’t available from TikTok.',
  youtube: 'Sign in with the Google account that owns your channel.',
};

export function ConnectPanel({ accounts, from, onChange, highlight }: {
  accounts: PublicAccount[];
  from?: 'onboarding';
  onChange?: () => void;
  highlight?: string | null;
}) {
  const { config } = useAuth();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');

  const act = async (p: Platform, kind: 'sync' | 'disconnect') => {
    if (kind === 'disconnect' && !confirm(`Disconnect ${PLATFORM_LABELS[p]}? Its stats are removed from your profile.`)) return;
    setBusy(`${p}-${kind}`);
    setError('');
    try {
      await api(kind === 'sync' ? `/api/creator/accounts/${p}/sync` : `/api/creator/accounts/${p}`, { method: kind === 'sync' ? 'POST' : 'DELETE', body: kind === 'sync' ? {} : undefined });
      onChange?.();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="grid gap-3">
      {error && <Notice kind="error">{error}</Notice>}
      {PLATFORMS.map((p) => {
        const a = accounts.find((x) => x.platform === p);
        const mode = config?.platforms[p] ?? 'off';
        const href = `/api/connect/${p}/start${from ? `?from=${from}` : ''}`;
        return (
          <div key={p} className={`card flex flex-col gap-3 p-4 sm:flex-row sm:items-center ${highlight === p ? 'ring-2 ring-amber-300' : ''}`}>
            <div className="flex min-w-0 flex-1 items-start gap-3">
              <PlatformIcon platform={p} size={26} />
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2 font-semibold">
                  {PLATFORM_LABELS[p]}
                  {a?.demo && <DemoBadge />}
                  {a && a.status === 'active' && <span className="text-xs font-medium text-green-700">● Connected</span>}
                  {a && a.status === 'needs_reconnect' && <span className="text-xs font-medium text-amber-800">● Needs reconnecting</span>}
                </div>
                <div className="text-sm text-muted">
                  {a ? <>@{a.username} · synced {ago(a.lastVerifiedAt)}</> : mode === 'off' ? 'Coming soon' : HELP[p]}
                </div>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {!a && mode !== 'off' && <a className="btn-primary" href={href}>Connect {mode === 'demo' ? '(demo)' : ''}</a>}
              {a?.status === 'needs_reconnect' && <a className="btn-primary" href={href}>Reconnect</a>}
              {a?.status === 'active' && (
                <button className="btn-secondary" onClick={() => act(p, 'sync')} disabled={!!busy} title="Refresh now">
                  <RefreshCw size={15} className={busy === `${p}-sync` ? 'animate-spin' : ''} /> Refresh
                </button>
              )}
              {a && (
                <button className="btn-ghost" onClick={() => act(p, 'disconnect')} disabled={!!busy} title="Disconnect">
                  <Unplug size={15} /> <span className="sm:hidden">Disconnect</span>
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
