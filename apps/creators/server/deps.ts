import type { Mailer } from './email.js';
import type { ProviderRegistry } from './providers/index.js';
import type { Store } from './store.js';

/** Everything the app needs from the outside world; swapped for fakes in tests. */
export interface Deps {
  store: Store;
  mailer: Mailer;
  providers: ProviderRegistry;
}
