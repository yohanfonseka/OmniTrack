import { useEffect, useState } from 'react';
import { api } from '../api';
import { CreatorCardView } from '../components/CreatorCard';
import { Empty, Spinner } from '../components/ui';
import { ago } from '../format';
import { Link } from '../router';
import type { CreatorCard } from '../../shared/types';

export function BrandHome() {
  const [items, setItems] = useState<{ card: CreatorCard; lastViewedAt: string }[] | null>(null);
  useEffect(() => void api<{ items: { card: CreatorCard; lastViewedAt: string }[] }>('/api/brand/recent').then((r) => setItems(r.items)), []);
  if (!items) return <Spinner />;
  return (
    <div className="py-8">
      <h1 className="text-2xl font-bold tracking-tight">Recently viewed creators</h1>
      <p className="mt-1 text-muted">Creators whose full report you’ve opened.</p>
      <div className="mt-6">
        {items.length ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((i) => (
              <div key={i.card.id}>
                <CreatorCardView card={i.card} />
                <p className="mt-1.5 px-1 text-xs text-muted">Viewed {ago(i.lastViewedAt)}</p>
              </div>
            ))}
          </div>
        ) : (
          <Empty>Nothing yet. <Link href="/" className="font-semibold text-brand-700">Find creators</Link></Empty>
        )}
      </div>
    </div>
  );
}
