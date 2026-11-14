import { CATEGORIES, MAX_CATEGORIES, type CategoryId } from '../../shared/categories';

export function CategoryPicker({ value, onChange }: { value: CategoryId[]; onChange: (v: CategoryId[]) => void }) {
  const toggle = (id: CategoryId) => {
    if (value.includes(id)) onChange(value.filter((v) => v !== id));
    else if (value.length < MAX_CATEGORIES) onChange([...value, id]);
  };
  const full = value.length >= MAX_CATEGORIES;
  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {CATEGORIES.map((c) => {
          const on = value.includes(c.id);
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => toggle(c.id)}
              disabled={!on && full}
              aria-pressed={on}
              className={`rounded-full border px-3 py-1.5 text-sm transition ${
                on ? 'border-brand-700 bg-brand-700 text-white' : 'border-line bg-white text-ink hover:border-brand-300 disabled:opacity-40'
              }`}
            >
              {c.label}
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-xs text-muted">
        {value.length} of {MAX_CATEGORIES} selected{full ? ' · remove one to pick another' : ''}
      </p>
    </div>
  );
}
