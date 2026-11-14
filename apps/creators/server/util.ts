/** Small shared helpers. */

export const nowIso = () => new Date().toISOString();

export function addMs(ms: number, from = Date.now()) {
  return new Date(from + ms).toISOString();
}

export const HOUR = 60 * 60 * 1000;
export const DAY = 24 * HOUR;

/** Calendar date in Sri Lanka (UTC+5:30), YYYY-MM-DD. */
export function lkDay(date = new Date()): string {
  return new Date(date.getTime() + 5.5 * HOUR).toISOString().slice(0, 10);
}

export function lkMonth(date = new Date()): string {
  return lkDay(date).slice(0, 7);
}

/** The last n Sri Lanka calendar days, newest first. */
export function lastDays(n: number, from = new Date()): string[] {
  return Array.from({ length: n }, (_, i) => lkDay(new Date(from.getTime() - i * DAY)));
}

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 30);
}

export const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{1,28}[a-z0-9])$/;

/** Simple fixed-window in-memory rate limiter, per key. */
export class RateLimiter {
  private hits = new Map<string, { count: number; resetAt: number }>();
  constructor(private max: number, private windowMs: number) {}
  check(key: string): boolean {
    const now = Date.now();
    const h = this.hits.get(key);
    if (!h || h.resetAt < now) {
      this.hits.set(key, { count: 1, resetAt: now + this.windowMs });
      if (this.hits.size > 10_000) this.prune(now);
      return true;
    }
    h.count++;
    return h.count <= this.max;
  }
  private prune(now: number) {
    for (const [k, v] of this.hits) if (v.resetAt < now) this.hits.delete(k);
  }
}
