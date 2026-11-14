import express, { type NextFunction, type Request, type Response } from 'express';
import cookieParser from 'cookie-parser';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import { loadUser } from './auth.js';
import { C, type CreatorDoc, type InviteDoc } from './models.js';
import type { Deps } from './deps.js';
import { HttpError } from './util.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerCreatorRoutes } from './routes/creator.js';
import { registerPublicRoutes, findCreatorBySlug } from './routes/public.js';
import { registerAdminRoutes } from './routes/admin.js';
import { registerInternalRoutes } from './routes/internal.js';

export function createApp(deps: Deps) {
  const app = express();
  app.set('trust proxy', true);
  app.disable('x-powered-by');
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('X-Frame-Options', 'DENY');
    next();
  });
  app.use(loadUser(deps));

  app.get('/api/health', (_req, res) => res.json({ ok: true }));
  registerAuthRoutes(app, deps);
  registerCreatorRoutes(app, deps);
  registerPublicRoutes(app, deps);
  registerAdminRoutes(app, deps);
  registerInternalRoutes(app, deps);

  app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
    if ((err as any)?.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON.' });
    console.error('[error]', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  });
  return app;
}

// ---------------------------------------------------------------------------
// Link previews: WhatsApp, Messenger etc. don't run JavaScript, so the server
// writes the title/description for shared links into the HTML itself.
// ---------------------------------------------------------------------------
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

interface Meta { title: string; description: string }

const DEFAULT_META: Meta = {
  title: 'CreatorTrack · Verified creator stats',
  description: 'Find Instagram, TikTok and YouTube creators in Sri Lanka with stats verified directly from each platform. Free for creators, always.',
};

export async function metaFor(deps: Deps, urlPath: string): Promise<Meta> {
  try {
    let m = /^\/c\/([a-z0-9-]+)\/?$/.exec(urlPath);
    if (m) {
      const c = await findCreatorBySlug(deps, m[1]);
      if (c && !c.hidden) return { title: `${c.displayName} · Verified stats on CreatorTrack`, description: c.bio || `See ${c.displayName}'s verified Instagram, TikTok and YouTube stats on CreatorTrack.` };
    }
    m = /^\/join\/([A-Za-z0-9]+)\/?$/.exec(urlPath);
    if (m) {
      const i = await deps.store.get<InviteDoc>(C.invites, m[1]);
      return { title: `${i ? `${i.name}, you're` : "You're"} invited to join CreatorTrack`, description: 'Show brands your verified Instagram, TikTok and YouTube stats. Free for creators, always.' };
    }
    m = /^\/r\/([a-z0-9-]+)\/?$/.exec(urlPath);
    if (m) {
      const [c] = await deps.store.find<CreatorDoc>(C.creators, [['referralCode', '==', m[1]]], 1);
      return { title: `${c ? c.displayName : 'A creator'} invited you to CreatorTrack`, description: 'Brands find creators with verified stats on CreatorTrack. Join free.' };
    }
  } catch (err) {
    console.warn('[meta]', err);
  }
  return DEFAULT_META;
}

export function injectMeta(html: string, meta: Meta, url: string) {
  const image = `${config.baseUrl}/og-image.png`;
  const tags = [
    `<title>${esc(meta.title)}</title>`,
    `<meta name="description" content="${esc(meta.description)}" />`,
    `<meta property="og:title" content="${esc(meta.title)}" />`,
    `<meta property="og:description" content="${esc(meta.description)}" />`,
    `<meta property="og:image" content="${image}" />`,
    `<meta property="og:url" content="${esc(config.baseUrl + url)}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="CreatorTrack" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
  ].join('\n    ');
  return html.replace('<!--app-meta-->', tags);
}

/** Serves the SPA (dev: through Vite; prod: from dist/client) with link-preview tags. */
export async function attachFrontend(app: express.Express, deps: Deps, root: string) {
  if (!config.isProduction) {
    const { createServer } = await import('vite');
    const vite = await createServer({ root, server: { middlewareMode: true }, appType: 'custom' });
    app.use(vite.middlewares);
    app.get('*', async (req, res, next) => {
      try {
        const raw = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
        const html = await vite.transformIndexHtml(req.originalUrl, raw);
        res.status(200).set('Content-Type', 'text/html').send(injectMeta(html, await metaFor(deps, req.path), req.originalUrl));
      } catch (err) {
        next(err);
      }
    });
    return;
  }
  const dist = path.join(root, 'dist', 'client');
  const template = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
  app.use(express.static(dist, { index: false, maxAge: '1h' }));
  app.get('*', async (req, res) => {
    res.status(200).set('Content-Type', 'text/html').send(injectMeta(template, await metaFor(deps, req.path), req.originalUrl));
  });
}
