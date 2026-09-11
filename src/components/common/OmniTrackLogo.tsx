import React from 'react';

interface OmniTrackLogoProps {
  /**
   * 'full': Icon mark + 'OmniTrack' typography (matches uploaded logo image)
   * 'mark': Circular logo mark only (transparent background)
   * 'app-icon': Circular logo mark inside dark navy squircle (matches uploaded favicon image)
   */
  variant?: 'full' | 'mark' | 'app-icon';
  /**
   * Overall height class or scale: 'sm' (28px), 'md' (36px), 'lg' (44px), 'xl' (56px)
   */
  size?: 'sm' | 'md' | 'lg' | 'xl';
  /**
   * 'light' for white/light backgrounds (Omni is dark navy)
   * 'dark' for dark backgrounds (Omni is white)
   */
  theme?: 'light' | 'dark';
  showBadge?: boolean;
  badgeText?: string;
  className?: string;
  onClick?: () => void;
}

export const OmniTrackLogo: React.FC<OmniTrackLogoProps> = ({
  variant = 'full',
  size = 'md',
  theme = 'light',
  showBadge = false,
  badgeText = 'v2.0',
  className = '',
  onClick
}) => {
  // Dimensions for mark
  const iconDimensions = {
    sm: 'w-7 h-7',
    md: 'w-9 h-9',
    lg: 'w-11 h-11',
    xl: 'w-14 h-14'
  }[size];

  const fontSize = {
    sm: 'text-base',
    md: 'text-xl',
    lg: 'text-2xl',
    xl: 'text-3xl'
  }[size];

  // App-Icon / Favicon variant: Dark Navy Squircle with centered vector mark
  if (variant === 'app-icon') {
    return (
      <div
        id="omnitrack-app-icon"
        onClick={onClick}
        className={`relative inline-flex items-center justify-center shrink-0 rounded-xl overflow-hidden shadow-sm transition-transform ${iconDimensions} ${className}`}
        style={{
          background: 'linear-gradient(135deg, #0d1738 0%, #050a1c 100%)'
        }}
      >
        <svg
          viewBox="0 0 320 320"
          className="w-[82%] h-[82%]"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <linearGradient id="appIconRingGrad" x1="15%" y1="85%" x2="85%" y2="15%">
              <stop offset="0%" stopColor="#0047e1" />
              <stop offset="25%" stopColor="#006eff" />
              <stop offset="60%" stopColor="#00c0ff" />
              <stop offset="85%" stopColor="#00e6a0" />
              <stop offset="100%" stopColor="#00f59b" />
            </linearGradient>
            <linearGradient id="appIconBarsGrad" x1="20%" y1="80%" x2="85%" y2="15%">
              <stop offset="0%" stopColor="#0084ff" />
              <stop offset="35%" stopColor="#00beff" />
              <stop offset="70%" stopColor="#00e5a3" />
              <stop offset="100%" stopColor="#00f79d" />
            </linearGradient>
          </defs>
          <g transform="translate(160, 160)">
            <path
              d="M 92 46 A 102 102 0 1 1 72 -72 L 104 -104 A 146 146 0 1 0 131 65 Z"
              fill="url(#appIconRingGrad)"
            />
            <path
              d="M -84 26 C -84 22 -81 18 -77 18 L -60 18 C -56 18 -53 22 -53 26 L -53 74 C -63 62 -75 46 -84 26 Z"
              fill="url(#appIconBarsGrad)"
            />
            <path
              d="M -42 -26 C -42 -30 -39 -34 -34 -34 L -17 -34 C -12 -34 -9 -30 -9 -26 L -9 94 C -19 96 -30 94 -42 88 Z"
              fill="url(#appIconBarsGrad)"
            />
            <path
              d="M 2 -32 C 2 -36 5 -40 10 -40 L 27 -40 C 30 -40 33 -38 35 -36 L 62 -63 L 93 -32 L 48 13 L 48 84 C 34 89 18 90 2 87 Z"
              fill="url(#appIconBarsGrad)"
            />
            <path
              d="M 28 -37 L 76 -85 L 106 -55 L 58 -7 Z"
              fill="url(#appIconBarsGrad)"
            />
            <path
              d="M 60 -150 L 150 -150 L 150 -60 L 118 -76 L 96 -98 L 76 -118 Z"
              fill="url(#appIconBarsGrad)"
            />
          </g>
        </svg>
      </div>
    );
  }

  // Mark-only variant (transparent background)
  if (variant === 'mark') {
    return (
      <svg
        id="omnitrack-mark"
        onClick={onClick}
        viewBox="0 0 320 320"
        className={`shrink-0 ${iconDimensions} ${className}`}
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient id="markRingGrad" x1="15%" y1="85%" x2="85%" y2="15%">
            <stop offset="0%" stopColor="#0047e1" />
            <stop offset="25%" stopColor="#006eff" />
            <stop offset="60%" stopColor="#00c0ff" />
            <stop offset="85%" stopColor="#00e6a0" />
            <stop offset="100%" stopColor="#00f59b" />
          </linearGradient>
          <linearGradient id="markBarsGrad" x1="20%" y1="80%" x2="85%" y2="15%">
            <stop offset="0%" stopColor="#0084ff" />
            <stop offset="35%" stopColor="#00beff" />
            <stop offset="70%" stopColor="#00e5a3" />
            <stop offset="100%" stopColor="#00f79d" />
          </linearGradient>
        </defs>
        <g transform="translate(160, 160)">
          <path
            d="M 92 46 A 102 102 0 1 1 72 -72 L 104 -104 A 146 146 0 1 0 131 65 Z"
            fill="url(#markRingGrad)"
          />
          <path
            d="M -84 26 C -84 22 -81 18 -77 18 L -60 18 C -56 18 -53 22 -53 26 L -53 74 C -63 62 -75 46 -84 26 Z"
            fill="url(#markBarsGrad)"
          />
          <path
            d="M -42 -26 C -42 -30 -39 -34 -34 -34 L -17 -34 C -12 -34 -9 -30 -9 -26 L -9 94 C -19 96 -30 94 -42 88 Z"
            fill="url(#markBarsGrad)"
          />
          <path
            d="M 2 -32 C 2 -36 5 -40 10 -40 L 27 -40 C 30 -40 33 -38 35 -36 L 62 -63 L 93 -32 L 48 13 L 48 84 C 34 89 18 90 2 87 Z"
            fill="url(#markBarsGrad)"
          />
          <path
            d="M 28 -37 L 76 -85 L 106 -55 L 58 -7 Z"
            fill="url(#markBarsGrad)"
          />
          <path
            d="M 60 -150 L 150 -150 L 150 -60 L 118 -76 L 96 -98 L 76 -118 Z"
            fill="url(#markBarsGrad)"
          />
        </g>
      </svg>
    );
  }

  // Full Logo variant: Mark + Typography ('OmniTrack')
  return (
    <div
      id="omnitrack-full-logo"
      onClick={onClick}
      className={`inline-flex items-center gap-2.5 select-none ${onClick ? 'cursor-pointer' : ''} ${className}`}
    >
      {/* Exact Circular Mark */}
      <svg
        viewBox="0 0 320 320"
        className={`shrink-0 ${iconDimensions}`}
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient id="fullLogoRingGrad" x1="15%" y1="85%" x2="85%" y2="15%">
            <stop offset="0%" stopColor="#0047e1" />
            <stop offset="25%" stopColor="#006eff" />
            <stop offset="60%" stopColor="#00c0ff" />
            <stop offset="85%" stopColor="#00e6a0" />
            <stop offset="100%" stopColor="#00f59b" />
          </linearGradient>
          <linearGradient id="fullLogoBarsGrad" x1="20%" y1="80%" x2="85%" y2="15%">
            <stop offset="0%" stopColor="#0084ff" />
            <stop offset="35%" stopColor="#00beff" />
            <stop offset="70%" stopColor="#00e5a3" />
            <stop offset="100%" stopColor="#00f79d" />
          </linearGradient>
        </defs>
        <g transform="translate(160, 160)">
          <path
            d="M 92 46 A 102 102 0 1 1 72 -72 L 104 -104 A 146 146 0 1 0 131 65 Z"
            fill="url(#fullLogoRingGrad)"
          />
          <path
            d="M -84 26 C -84 22 -81 18 -77 18 L -60 18 C -56 18 -53 22 -53 26 L -53 74 C -63 62 -75 46 -84 26 Z"
            fill="url(#fullLogoBarsGrad)"
          />
          <path
            d="M -42 -26 C -42 -30 -39 -34 -34 -34 L -17 -34 C -12 -34 -9 -30 -9 -26 L -9 94 C -19 96 -30 94 -42 88 Z"
            fill="url(#fullLogoBarsGrad)"
          />
          <path
            d="M 2 -32 C 2 -36 5 -40 10 -40 L 27 -40 C 30 -40 33 -38 35 -36 L 62 -63 L 93 -32 L 48 13 L 48 84 C 34 89 18 90 2 87 Z"
            fill="url(#fullLogoBarsGrad)"
          />
          <path
            d="M 28 -37 L 76 -85 L 106 -55 L 58 -7 Z"
            fill="url(#fullLogoBarsGrad)"
          />
          <path
            d="M 60 -150 L 150 -150 L 150 -60 L 118 -76 L 96 -98 L 76 -118 Z"
            fill="url(#fullLogoBarsGrad)"
          />
        </g>
      </svg>

      {/* Typography: OmniTrack */}
      <div className="flex flex-col">
        <div className="flex items-center gap-1.5">
          <span className={`font-extrabold tracking-tight leading-none ${fontSize}`}>
            <span className={theme === 'dark' ? 'text-white' : 'text-[#0a152e]'}>
              Omni
            </span>
            <span
              className="bg-clip-text text-transparent bg-gradient-to-r from-[#0055ff] via-[#00a6ff] to-[#00d494]"
              style={{
                backgroundImage: 'linear-gradient(90deg, #0059ff 0%, #0088ff 35%, #00c4ff 65%, #00dca0 85%, #00f59b 100%)'
              }}
            >
              Track
            </span>
          </span>

          {showBadge && (
            <span className="text-[10px] font-bold tracking-wider uppercase px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-600 border border-slate-200/60">
              {badgeText}
            </span>
          )}
        </div>
        <span className="text-[10.5px] font-medium text-slate-400 tracking-normal mt-0.5">
          Campaign Monitor
        </span>
      </div>
    </div>
  );
};
