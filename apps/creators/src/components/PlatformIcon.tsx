import type { Platform } from '../../shared/types';

const COLORS: Record<Platform, string> = { instagram: '#d62976', tiktok: '#111111', youtube: '#e62117' };

/** Simple generic glyphs (not the platforms' trademarked logos). */
export function PlatformIcon({ platform, size = 18 }: { platform: Platform; size?: number }) {
  const c = COLORS[platform];
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" className="shrink-0">
      {platform === 'instagram' && (
        <g fill="none" stroke={c} strokeWidth="2">
          <rect x="3" y="3" width="18" height="18" rx="5" />
          <circle cx="12" cy="12" r="4" />
          <circle cx="17.3" cy="6.7" r="0.6" fill={c} />
        </g>
      )}
      {platform === 'tiktok' && (
        <path fill={c} d="M14 3h3a4 4 0 0 0 4 4v3a7 7 0 0 1-4-1.3V15a6 6 0 1 1-6-6h.5v3.2a3 3 0 1 0 2.5 2.8z" />
      )}
      {platform === 'youtube' && (
        <g>
          <rect x="2" y="5" width="20" height="14" rx="4" fill={c} />
          <path d="M10 9l5 3-5 3z" fill="#fff" />
        </g>
      )}
    </svg>
  );
}
