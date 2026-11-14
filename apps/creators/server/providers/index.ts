import { config } from '../config.js';
import type { Platform } from '../../shared/types.js';
import { DemoProvider } from './demo.js';
import { disabledGoogleLogin, LiveGoogleLogin, YouTubeProvider, type GoogleLogin } from './google.js';
import { InstagramProvider } from './instagram.js';
import { TikTokProvider } from './tiktok.js';
import type { PlatformProvider } from './types.js';

export interface ProviderRegistry {
  platforms: Partial<Record<Platform, PlatformProvider>>;
  google: GoogleLogin;
}

/** Real provider when credentials exist; demo provider when DEMO_MODE=true; otherwise unavailable. */
export function createProviders(): ProviderRegistry {
  const platforms: ProviderRegistry['platforms'] = {};
  const pick = (p: Platform, configured: boolean, live: () => PlatformProvider) => {
    if (configured) platforms[p] = live();
    else if (config.demoMode) platforms[p] = new DemoProvider(p);
  };
  pick('instagram', !!(config.instagram.appId && config.instagram.appSecret), () => new InstagramProvider());
  pick('tiktok', !!(config.tiktok.clientKey && config.tiktok.clientSecret), () => new TikTokProvider());
  pick('youtube', !!(config.google.clientId && config.google.clientSecret), () => new YouTubeProvider());
  const google = config.google.clientId && config.google.clientSecret ? new LiveGoogleLogin() : disabledGoogleLogin;
  return { platforms, google };
}
