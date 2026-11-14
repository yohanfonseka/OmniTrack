/** Categories a creator can pick at sign-up (up to MAX_CATEGORIES). Brands filter search by these. */
export const CATEGORIES = [
  { id: 'fashion', label: 'Fashion & Style' },
  { id: 'beauty', label: 'Beauty & Makeup' },
  { id: 'fitness', label: 'Fitness & Health' },
  { id: 'food', label: 'Food & Drink' },
  { id: 'travel', label: 'Travel' },
  { id: 'lifestyle', label: 'Lifestyle' },
  { id: 'tech', label: 'Tech & Gadgets' },
  { id: 'gaming', label: 'Gaming' },
  { id: 'parenting', label: 'Parenting & Family' },
  { id: 'finance', label: 'Finance & Business' },
  { id: 'education', label: 'Education' },
  { id: 'comedy', label: 'Comedy & Entertainment' },
  { id: 'music', label: 'Music & Dance' },
  { id: 'art', label: 'Art & Design' },
  { id: 'sports', label: 'Sports' },
  { id: 'automotive', label: 'Automotive' },
  { id: 'pets', label: 'Pets & Animals' },
  { id: 'home', label: 'Home & DIY' },
  { id: 'photography', label: 'Photography' },
  { id: 'sustainability', label: 'Sustainability' },
] as const;

export type CategoryId = (typeof CATEGORIES)[number]['id'];

export const MAX_CATEGORIES = 5;

const IDS = new Set<string>(CATEGORIES.map((c) => c.id));

export function isCategory(id: unknown): id is CategoryId {
  return typeof id === 'string' && IDS.has(id);
}

export function categoryLabel(id: string): string {
  return CATEGORIES.find((c) => c.id === id)?.label ?? id;
}
