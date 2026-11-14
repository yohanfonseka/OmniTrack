import { Award, MapPin } from 'lucide-react';
import { Link } from '../router';
import { compact, pct } from '../format';
import { categoryLabel } from '../../shared/categories';
import type { CreatorCard as Card } from '../../shared/types';
import { PlatformIcon } from './PlatformIcon';
import { DemoBadge, VerifiedBadge } from './ui';

export function Avatar({ name, url, size = 48 }: { name: string; url?: string | null; size?: number }) {
  const initials = name.split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  return url ? (
    <img src={url} alt="" width={size} height={size} referrerPolicy="no-referrer" className="shrink-0 rounded-full object-cover" style={{ width: size, height: size }} />
  ) : (
    <div className="flex shrink-0 items-center justify-center rounded-full bg-brand-100 font-semibold text-brand-800" style={{ width: size, height: size, fontSize: size * 0.36 }}>
      {initials}
    </div>
  );
}

export function CreatorCardView({ card }: { card: Card }) {
  const avatar = card.accounts.find((a) => a.avatarUrl)?.avatarUrl;
  const best = Math.max(0, ...card.accounts.map((a) => a.stats?.engagementRate ?? 0));
  const demo = card.accounts.some((a) => a.demo);
  return (
    <Link href={`/c/${card.slug}`} className="card flex flex-col p-5 transition hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-sm">
      <div className="flex items-start gap-3">
        <Avatar name={card.displayName} url={avatar} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <h3 className="truncate font-semibold">{card.displayName}</h3>
            {card.communityBuilder && <Award size={15} className="shrink-0 text-amber-500" aria-label="Community Builder" />}
          </div>
          <div className="mt-0.5 flex items-center gap-2">
            <VerifiedBadge small />
            {demo && <DemoBadge />}
          </div>
          {(card.city || card.country) && (
            <div className="mt-1 flex items-center gap-1 text-xs text-muted">
              <MapPin size={12} /> {[card.city, card.country].filter(Boolean).join(', ')}
            </div>
          )}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {card.categories.slice(0, 3).map((c) => <span key={c} className="chip">{categoryLabel(c)}</span>)}
        {card.categories.length > 3 && <span className="chip">+{card.categories.length - 3}</span>}
      </div>
      <div className="mt-auto grid grid-cols-2 gap-3 border-t border-line pt-4 mt-4">
        <div>
          <div className="eyebrow">Followers</div>
          <div className="text-lg font-bold tabular-nums">{compact(card.totalFollowers)}</div>
        </div>
        <div>
          <div className="eyebrow">Engagement</div>
          <div className="text-lg font-bold tabular-nums">{pct(best, 1)}</div>
        </div>
      </div>
      <div className="mt-3 flex items-center gap-3">
        {card.accounts.map((a) => (
          <span key={a.platform} className="flex items-center gap-1 text-xs text-muted">
            <PlatformIcon platform={a.platform} size={15} /> {compact(a.stats?.followers)}
          </span>
        ))}
      </div>
    </Link>
  );
}
