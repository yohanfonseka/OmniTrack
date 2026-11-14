import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';

// Configuration is read at import time, so set it before loading the app.
process.env.ADMIN_EMAILS = 'admin@example.com';
process.env.INTERNAL_SECRET = 'test-secret';
process.env.DEMO_MODE = 'true';

const { createApp } = await import('./app.js');
const { MemoryStore } = await import('./store.js');
const { MemoryMailer } = await import('./email.js');
const { DemoProvider } = await import('./providers/demo.js');
const { flushCounters, invalidateDirectory } = await import('./directory.js');
const { C } = await import('./models.js');
type Deps = import('./deps.js').Deps;

const store = new MemoryStore();
const mailer = new MemoryMailer(false);
const deps: Deps = {
  store,
  mailer,
  providers: {
    platforms: { instagram: new DemoProvider('instagram'), tiktok: new DemoProvider('tiktok'), youtube: new DemoProvider('youtube') },
    google: {
      enabled: true,
      authorizeUrl: (state, redirect) => `${redirect}?code=google-code&state=${state}`,
      identify: async () => ({ sub: 'g-123', email: 'gcreator@example.com', emailVerified: true, name: 'Gee Creator' }),
    },
  },
};

let server: Server;
let base = '';
before(async () => {
  server = createApp(deps).listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(() => server.close());

/** A tiny browser: keeps cookies, doesn't follow redirects. */
class Client {
  cookie = '';
  async req(method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
    const res = await fetch(base + path, {
      method,
      redirect: 'manual',
      headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(this.cookie ? { Cookie: this.cookie } : {}), ...headers },
      body: body ? JSON.stringify(body) : undefined,
    });
    const set = res.headers.get('set-cookie');
    if (set) this.cookie = set.split(';')[0].endsWith('=') ? '' : set.split(';')[0];
    const type = res.headers.get('content-type') ?? '';
    const data = type.includes('json') ? await res.json() : type.includes('pdf') ? Buffer.from(await res.arrayBuffer()) : await res.text();
    return { status: res.status, data: data as any, location: res.headers.get('location') };
  }
  get = (p: string) => this.req('GET', p);
  post = (p: string, b?: unknown, h?: Record<string, string>) => this.req('POST', p, b ?? {}, h);
  put = (p: string, b: unknown) => this.req('PUT', p, b);

  /** Runs the connect flow the way a browser would: start → (demo) provider → callback. */
  async connect(platform: string) {
    const start = await this.get(`/api/connect/${platform}/start`);
    assert.equal(start.status, 302, JSON.stringify(start.data));
    const cb = new URL(start.location!);
    return this.get(cb.pathname + cb.search);
  }
}

const lastLink = (re: RegExp) => {
  const m = re.exec(mailer.outbox[mailer.outbox.length - 1].text);
  assert.ok(m, 'expected a link in the last email');
  return m[1];
};

async function signup(c: Client, body: Record<string, unknown>) {
  const r = await c.post('/api/auth/signup', { password: 'password123', ...body });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  return r.data;
}

async function verify(c: Client) {
  const token = lastLink(/verify-email\?token=([\w-]+)/);
  const r = await c.post('/api/auth/verify-email', { token });
  assert.equal(r.status, 200);
}

const anne = new Client();
let anneSlug = '';
let anneReferral = '';

test('creator signs up, verifies email and sets up profile', async () => {
  const r = await signup(anne, { role: 'creator', name: 'Anne Perera', email: 'Anne@Example.com' });
  assert.equal(r.next, '/onboarding');
  assert.equal(r.user.emailVerified, false);
  await verify(anne);
  const me = await anne.get('/api/auth/me');
  assert.equal(me.data.user.emailVerified, true);
  anneSlug = me.data.user.creator.slug;
  assert.equal(anneSlug, 'anne-perera');

  const tooMany = await anne.put('/api/creator/profile', { categories: ['fashion', 'beauty', 'travel', 'food', 'tech', 'gaming'] });
  assert.equal(tooMany.status, 400);
  const bad = await anne.put('/api/creator/profile', { categories: ['not-a-category'] });
  assert.equal(bad.status, 400);
  const reserved = await anne.put('/api/creator/profile', { categories: ['fashion'], slug: 'admin' });
  assert.equal(reserved.status, 400);

  const ok = await anne.put('/api/creator/profile', {
    categories: ['fashion', 'beauty', 'travel', 'food', 'lifestyle'], bio: 'Colombo-based fashion and travel creator.', city: 'Colombo', slug: 'anne',
  });
  assert.equal(ok.status, 200);
  anneSlug = 'anne';
});

test('rejects disposable emails and duplicate accounts', async () => {
  const c = new Client();
  assert.equal((await c.post('/api/auth/signup', { role: 'brand', name: 'X', companyName: 'X Ltd', email: 'x@mailinator.com', password: 'password123' })).status, 400);
  assert.equal((await c.post('/api/auth/signup', { role: 'creator', name: 'Anne', email: 'anne@example.com', password: 'password123' })).status, 409);
});

test('connected creator appears in search; unconnected does not', async () => {
  invalidateDirectory();
  let list = await new Client().get('/api/creators');
  assert.equal(list.data.total, 0);

  const cb = await anne.connect('instagram');
  assert.equal(cb.status, 302);
  assert.match(cb.location!, /connected=instagram/);
  await anne.connect('youtube');

  list = await new Client().get('/api/creators?category=fashion');
  assert.equal(list.data.total, 1);
  assert.equal(list.data.items[0].slug, 'anne');
  assert.equal(list.data.items[0].accounts.length, 2);
  assert.ok(list.data.items[0].accounts.every((a: any) => a.demo === true));
  assert.equal((await new Client().get('/api/creators?category=gaming')).data.total, 0);
  assert.equal((await new Client().get('/api/creators?platform=tiktok')).data.total, 0);
  assert.equal((await new Client().get('/api/creators?minFollowers=999999999')).data.total, 0);
});

test('connect callback only accepts the state of the signed-in creator', async () => {
  const start = await anne.get('/api/connect/tiktok/start');
  const cb = new URL(start.location!);
  const mallory = new Client();
  await signup(mallory, { role: 'creator', name: 'Mallory', email: 'mallory@example.com' });
  const r = await mallory.get(cb.pathname + cb.search);
  assert.match(r.location!, /connect_error=/);
  const accounts = await store.find(C.accounts, [['userId', '==', (await mallory.get('/api/auth/me')).data.user.id]]);
  assert.equal(accounts.length, 0);
});

test('visitors and unverified brands see headline stats only; verified brands see everything', async () => {
  const visitor = await new Client().get(`/api/creators/${anneSlug}`);
  assert.equal(visitor.data.access, 'locked_visitor');
  assert.equal(visitor.data.reports, null);
  assert.ok(visitor.data.accounts[0].stats.followers > 0);

  const brand = new Client();
  await signup(brand, { role: 'brand', name: 'Bimal', companyName: 'Acme Tea', email: 'bimal@acme.lk' });
  const locked = await brand.get(`/api/creators/${anneSlug}`);
  assert.equal(locked.data.access, 'locked_unverified');
  assert.equal(locked.data.reports, null);
  assert.equal((await brand.get(`/api/creators/${anneSlug}/report.pdf`)).status, 403);

  await verify(brand);
  const full = await brand.get(`/api/creators/${anneSlug}`);
  assert.equal(full.data.access, 'full');
  assert.equal(full.data.reports.length, 2);
  const ig = full.data.reports.find((r: any) => r.platform === 'instagram');
  assert.ok(ig.recentPosts.length > 0);
  assert.ok(ig.demographics.age);
  const yt = full.data.reports.find((r: any) => r.platform === 'youtube');
  assert.ok(yt.history.length > 100, 'YouTube history is backfilled');

  const pdf = await brand.get(`/api/creators/${anneSlug}/report.pdf`);
  assert.equal(pdf.status, 200);
  assert.equal((pdf.data as Buffer).subarray(0, 4).toString(), '%PDF');

  // A second brand, and the same brand again, give a distinct count of 2.
  const brand2 = new Client();
  await signup(brand2, { role: 'brand', name: 'Chaya', companyName: 'Blue Co', email: 'chaya@blue.lk' });
  await verify(brand2);
  await brand2.get(`/api/creators/${anneSlug}`);
  await brand.get(`/api/creators/${anneSlug}`);

  const recent = await brand.get('/api/brand/recent');
  assert.equal(recent.data.items[0].card.slug, anneSlug);

  await flushCounters(deps);
  const dash = await anne.get('/api/creator/dashboard');
  assert.equal(dash.data.interest.brandsViewedReportThisMonth, 2);
  assert.ok(dash.data.interest.profileViews7d >= 4);
  assert.ok(dash.data.interest.searchAppearances7d >= 1);
  // Counts only: no brand identity anywhere in the creator's dashboard.
  assert.ok(!JSON.stringify(dash.data).includes('Acme'));
});

test('owner sees their own full data and can preview the public view', async () => {
  const own = await anne.get(`/api/creators/${anneSlug}`);
  assert.equal(own.data.access, 'owner');
  const preview = await anne.get(`/api/creators/${anneSlug}?preview=public`);
  assert.equal(preview.data.access, 'locked_visitor');
  assert.equal(preview.data.reports, null);
  const kit = await anne.get('/api/creator/media-kit.pdf');
  assert.equal(kit.status, 200);
  assert.equal((kit.data as Buffer).subarray(0, 4).toString(), '%PDF');
  const dash = await anne.get('/api/creator/dashboard');
  anneReferral = dash.data.referral.code;
  assert.ok(dash.data.completeness.percent > 50);
});

test('admin invite link: opened, signed up (email auto-verified), connected', async () => {
  const admin = new Client();
  await signup(admin, { role: 'brand', name: 'Admin', companyName: 'CreatorTrack', email: 'admin@example.com' });
  assert.equal((await admin.get('/api/admin/overview')).status, 403, 'admin needs a verified email');
  await verify(admin);

  const created = await admin.post('/api/admin/invites', { name: 'Kasun', email: 'kasun@example.com', phone: '+94 77 123 4567' });
  assert.equal(created.status, 201);
  const token = created.data.invite.token;
  assert.match(created.data.url, new RegExp(`/join/${token}$`));
  assert.equal(created.data.invite.phone, '+94771234567');
  assert.match(mailer.outbox[mailer.outbox.length - 1].text, new RegExp(`/join/${token}`));

  const kasun = new Client();
  const opened = await kasun.get(`/api/invites/${token}`);
  assert.equal(opened.data.name, 'Kasun');
  const r = await signup(kasun, { role: 'creator', name: 'Kasun', email: 'kasun@example.com', invite: token });
  assert.equal(r.user.emailVerified, true);
  assert.equal((await kasun.get(`/api/invites/${token}`)).status, 409, 'single use');

  await kasun.put('/api/creator/profile', { categories: ['tech'] });
  await kasun.connect('tiktok');
  const list = await admin.get('/api/admin/invites');
  assert.equal(list.data.items.find((i: any) => i.token === token).status, 'connected');

  const bulk = await admin.post('/api/admin/invites/bulk', { rows: [{ name: 'A', phone: '0771111111' }, { name: '' }, { name: 'B', email: 'bad' }] });
  assert.equal(bulk.data.created.length, 1);
  assert.equal(bulk.data.errors.length, 2);

  const overview = await admin.get('/api/admin/overview');
  assert.equal(overview.data.creatorsConnectedIncludingDemo, 2);
  assert.equal(overview.data.iteration2Target, 100);
});

test('referral link credits the referrer only once the friend connects', async () => {
  const info = await new Client().get(`/api/referrals/${anneReferral}`);
  assert.equal(info.data.referrerName, 'Anne Perera');

  const friend = new Client();
  await signup(friend, { role: 'creator', name: 'Friend One', email: 'friend1@example.com', ref: anneReferral });
  let dash = await anne.get('/api/creator/dashboard');
  assert.equal(dash.data.referral.friendsJoined, 0);
  await friend.connect('instagram');
  await friend.connect('tiktok');
  dash = await anne.get('/api/creator/dashboard');
  assert.equal(dash.data.referral.friendsJoined, 1, 'counted once, not per platform');
});

test('Google sign-in: needs a role to create an account, then signs straight in', async () => {
  const c = new Client();
  let start = await c.get('/api/auth/google');
  let cb = new URL(start.location!);
  let r = await c.get(cb.pathname + cb.search);
  assert.match(r.location!, /^\/login\?error=/);

  start = await c.get('/api/auth/google?role=creator');
  cb = new URL(start.location!);
  r = await c.get(cb.pathname + cb.search);
  assert.equal(r.location, '/onboarding');
  const me = await c.get('/api/auth/me');
  assert.equal(me.data.user.email, 'gcreator@example.com');
  assert.equal(me.data.user.emailVerified, true);
  assert.equal(me.data.user.hasPassword, false);
});

test('password reset signs out other sessions', async () => {
  const other = new Client();
  await other.post('/api/auth/login', { email: 'anne@example.com', password: 'password123' });
  assert.ok((await other.get('/api/auth/me')).data.user);
  await new Client().post('/api/auth/forgot-password', { email: 'anne@example.com' });
  const token = lastLink(/reset-password\?token=([\w-]+)/);
  assert.equal((await new Client().post('/api/auth/reset-password', { token, password: 'newpassword1' })).status, 200);
  assert.equal((await other.get('/api/auth/me')).data.user, null);
  assert.equal((await anne.post('/api/auth/login', { email: 'anne@example.com', password: 'password123' })).status, 401);
  assert.equal((await anne.post('/api/auth/login', { email: 'anne@example.com', password: 'newpassword1' })).status, 200);
});

test('internal endpoints need the secret; daily sync runs', async () => {
  assert.equal((await new Client().post('/internal/sync')).status, 404);
  const r = await new Client().post('/internal/sync', {}, { 'x-internal-secret': 'test-secret' });
  assert.equal(r.status, 200);
  assert.ok(r.data.total >= 5);
  const w = await new Client().post('/internal/weekly-digest', {}, { 'x-internal-secret': 'test-secret' });
  assert.ok(w.data.sent >= 1);
  assert.match(mailer.outbox[mailer.outbox.length - 1].text, /followers across your platforms/);
});

test('deleting an account removes the creator and their data', async () => {
  const c = new Client();
  await c.post('/api/auth/login', { email: 'friend1@example.com', password: 'password123' });
  const id = (await c.get('/api/auth/me')).data.user.id;
  assert.equal((await c.req('DELETE', '/api/account', { confirm: 'nope' })).status, 400);
  assert.equal((await c.req('DELETE', '/api/account', { confirm: 'DELETE' })).status, 200);
  assert.equal(await store.get(C.users, id), null);
  assert.equal(await store.get(C.creators, id), null);
  assert.equal((await store.find(C.accounts, [['userId', '==', id]])).length, 0);
  assert.equal((await store.find(C.accountDetails, [['id', '==', `${id}_instagram`]])).length, 0);
  assert.equal((await c.get('/api/auth/me')).data.user, null);
});

test('daily sync refreshes stale accounts; a dead connection is flagged and emailed once', async () => {
  const { syncAll } = await import('./sync.js');
  const { AuthError } = await import('./providers/types.js');
  const accounts = await store.all<any>(C.accounts);
  for (const a of accounts) await store.patch(C.accounts, a.id, { lastSyncedAt: '2020-01-01T00:00:00.000Z' });

  let r = await syncAll(deps);
  assert.equal(r.synced, accounts.length);

  const yt = deps.providers.platforms.youtube!;
  const original = yt.fetchData.bind(yt);
  yt.fetchData = async () => { throw new AuthError('revoked'); };
  try {
    const target = (await store.all<any>(C.accounts)).find((a) => a.platform === 'youtube')!;
    await store.patch(C.accounts, target.id, { lastSyncedAt: '2020-01-01T00:00:00.000Z' });
    const before = mailer.outbox.length;
    r = await syncAll(deps);
    assert.equal(r.failed, 1);
    const after1 = await store.get<any>(C.accounts, target.id);
    assert.equal(after1.status, 'needs_reconnect');
    assert.equal(mailer.outbox.length, before + 1);
    assert.match(mailer.outbox[mailer.outbox.length - 1].subject, /reconnect your YouTube/i);
    await syncAll(deps);
    assert.equal(mailer.outbox.length, before + 1, 'no second email within a week');
    // Still listed, with last verified numbers.
    invalidateDirectory();
    const card = (await new Client().get('/api/creators')).data.items.find((c: any) => c.id === target.userId);
    assert.equal(card.accounts.find((a: any) => a.platform === 'youtube').status, 'needs_reconnect');
  } finally {
    yt.fetchData = original;
  }
});
