import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertProductionConfig, config } from './config.js';
import { createApp, attachFrontend } from './app.js';
import { flushCounters } from './directory.js';
import { createMailer } from './email.js';
import { createProviders } from './providers/index.js';
import { createStore } from './store.js';
import type { Deps } from './deps.js';

async function main() {
  assertProductionConfig();
  const deps: Deps = { store: createStore(), mailer: createMailer(), providers: createProviders() };
  const modes = Object.entries(deps.providers.platforms).map(([p, v]) => `${p}=${v!.mode}`).join(' ') || 'none';
  console.log(`[boot] platforms: ${modes}; google sign-in: ${deps.providers.google.enabled ? 'on' : 'off'}`);

  const app = createApp(deps);
  // Bundled to dist/server.cjs in production; the app root is one level up either way.
  const here = typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url));
  await attachFrontend(app, deps, path.resolve(here, '..'));

  const timer = setInterval(() => flushCounters(deps).catch(() => {}), 60_000);
  const server = app.listen(config.port, '0.0.0.0', () => console.log(`[boot] CreatorTrack on ${config.baseUrl} (port ${config.port})`));

  // Cloud Run sends SIGTERM before stopping an instance: save buffered counters first.
  process.on('SIGTERM', async () => {
    clearInterval(timer);
    await flushCounters(deps).catch(() => {});
    server.close(() => process.exit(0));
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
