import express from 'express';
import path from 'path';
import { db } from './server/db.js';
import { HealthEngine } from './server/healthEngine.js';
import cookieParser from 'cookie-parser';
import { CsvEngine } from './server/csvEngine.js';
import { XlsxEngine } from './server/xlsxEngine.js';
import {
  AuthedRequest,
  SESSION_COOKIE,
  createAccount,
  hasBootstrappedAdmin,
  loginWithPassword,
  requireAuth,
  requireRole,
  resolveAgencyId,
  clientScopeOf,
  sessionCookieOptions
} from './server/auth.js';

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  // Hydrate all database state from Cloud Firestore in the background without blocking server startup
  db.initFirestore().catch(err => {
    console.warn('[Server] Firestore hydration notice:', err?.message || err);
  });

  app.use(express.json({ limit: '15mb' }));
  app.use(express.urlencoded({ extended: true, limit: '15mb' }));
  app.use(cookieParser());

  // The agency a request may act on, derived from the signed-in user rather
  // than from a client-supplied header.
  const getAgencyId = (req: express.Request): string => resolveAgencyId(req as AuthedRequest);

  // The wipe-everything and re-seed helpers are test scaffolding: they act
  // across every tenant, so they only exist while the service is started with
  // ENABLE_DESTRUCTIVE_TESTING=true. Dropping that variable from the
  // deployment is all it takes to remove them from a customer-facing build.
  const destructiveTestingEnabled = process.env.ENABLE_DESTRUCTIVE_TESTING === 'true';
  const requireDestructiveTesting = (
    req: express.Request,
    res: express.Response,
    next: express.NextFunction
  ) => {
    if (!destructiveTestingEnabled) {
      return res.status(404).json({ error: 'Not found' });
    }
    next();
  };

  // ==================== HEALTH & METADATA ====================
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', server_time: new Date().toISOString() });
  });

  // ==================== AUTHENTICATION ====================
  app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: 'Email and password are required.' });
    try {
      const { cookie, user } = await loginWithPassword(String(email), String(password));
      res.cookie(SESSION_COOKIE, cookie, sessionCookieOptions());
      res.json({ user });
    } catch (err: any) {
      res.status(401).json({ error: err.message || 'Could not sign in.' });
    }
  });

  app.post('/api/auth/logout', (req, res) => {
    res.clearCookie(SESSION_COOKIE, { ...sessionCookieOptions(), maxAge: undefined });
    res.json({ success: true });
  });

  app.get('/api/auth/me', requireAuth, (req: AuthedRequest, res) => {
    res.json({ user: req.appUser });
  });

  /**
   * Creates the first administrator. Guarded by a secret only the deployer
   * holds, and refuses once any account exists, so it cannot be used to add
   * accounts to a running system.
   */
  app.post('/api/auth/bootstrap', async (req, res) => {
    const secret = process.env.ADMIN_BOOTSTRAP_TOKEN;
    if (!secret) return res.status(404).json({ error: 'Not found' });
    if ((req.headers['x-bootstrap-token'] as string) !== secret) {
      return res.status(403).json({ error: 'Invalid bootstrap token.' });
    }
    if (hasBootstrappedAdmin()) {
      return res.status(409).json({ error: 'An administrator already exists. Invite further users from Settings.' });
    }

    const { email, password, name, agency_id } = req.body || {};
    try {
      const user = await createAccount({
        email: String(email || ''),
        password: String(password || ''),
        name: String(name || 'Administrator'),
        role: 'super_user',
        agency_id: agency_id ? String(agency_id) : db.getAgencies()[0]?.id
      });
      res.status(201).json({ user });
    } catch (err: any) {
      res.status(400).json({ error: err.message || 'Could not create the administrator.' });
    }
  });

  // Registered ahead of the auth wall so that when testing mode is off these
  // paths do not exist at all, and so the UI can ask whether to show them.
  app.use(
    ['/api/system/clear-all-data', '/api/system/seed-demo-data'],
    requireDestructiveTesting
  );
  app.get('/api/system/capabilities', (req, res) => {
    res.json({ destructive_testing: destructiveTestingEnabled });
  });

  // Everything past this point requires a verified session.
  app.use('/api', requireAuth);

  /**
   * A client viewer may read one client's performance and do nothing else.
   *
   * Enforced here rather than route by route, for two reasons. Every write is
   * refused by method, so no mutating route can forget to guard itself. And
   * reads are an allowlist rather than a blocklist, so a route added later is
   * closed to client accounts until someone decides otherwise - the failure
   * mode of forgetting is a client seeing too little, not too much.
   *
   * Until this existed the read-only badge in the client portal was decoration:
   * the server accepted deletes, imports and cross-client reads from these
   * accounts exactly as it would from an agency admin.
   */
  const CLIENT_VIEWER_READS: RegExp[] = [
    /^\/auth\/me$/,
    /^\/agencies$/,
    /^\/clients$/,
    /^\/brands$/,
    /^\/campaigns$/,
    /^\/campaigns\/[^/]+$/,
    /^\/line-items$/,
    /^\/line-items\/[^/]+$/
  ];

  app.use('/api', (req: AuthedRequest, res, next) => {
    if (req.appUser?.role !== 'client_viewer') return next();

    if (req.method !== 'GET') {
      return res.status(403).json({ error: 'Your access to this dashboard is read-only.' });
    }
    if (!CLIENT_VIEWER_READS.some(rx => rx.test(req.path))) {
      return res.status(403).json({ error: 'Not available to client accounts.' });
    }

    // The client comes from the account, never from the request, so editing the
    // query string cannot reach another client's campaigns.
    req.query.client_id = clientScopeOf(req);
    next();
  });

  // ==================== AGENCIES (Super User Portal) ====================
  app.get('/api/agencies', (req: AuthedRequest, res) => {
    // Only the platform owner has any business seeing other agencies.
    if (req.appUser?.role === 'super_user') return res.json(db.getAgencies());
    res.json(db.getAgencies().filter(a => a.id === req.appUser?.agency_id));
  });

  app.post('/api/agencies', (req, res) => {
    const { name, slug, plan, contact_email, max_clients, max_campaigns } = req.body;
    if (!name || !contact_email) {
      return res.status(400).json({ error: 'Agency name and contact email are required' });
    }
    const agency = db.createAgency({
      name,
      slug: slug || name.toLowerCase().replace(/[^a-z0-9]/g, '-'),
      plan: plan || 'boutique',
      status: 'active',
      contact_email,
      max_clients: max_clients || 10,
      max_campaigns: max_campaigns || 30
    });

    db.addAuditLog({
      user_id: 'super_admin',
      user_name: 'Platform Administrator',
      action: 'CREATED_AGENCY',
      entity_type: 'agency',
      entity_id: agency.id,
      details: `Created agency ${agency.name} on ${agency.plan} plan`
    });

    res.status(201).json(agency);
  });

  app.patch('/api/agencies/:id', (req, res) => {
    const updated = db.updateAgency(req.params.id, req.body);
    if (!updated) return res.status(404).json({ error: 'Agency not found' });
    res.json(updated);
  });

  // ==================== USERS & AUTH CONTEXT ====================
  app.get('/api/users', (req, res) => {
    // Scoped to the caller's own agency so one tenant cannot enumerate another's staff.
    res.json(db.getUsers(getAgencyId(req)));
  });

  // Invite-only: an admin creates the account, so nobody can self-serve into a tenant.
  app.post('/api/users/invite', requireRole('super_user', 'agency_admin'), async (req: AuthedRequest, res) => {
    const { email, password, name, role, client_id, brand_id } = req.body || {};
    const requestedRole = (role || 'agency_member') as any;

    if (requestedRole === 'super_user' && req.appUser?.role !== 'super_user') {
      return res.status(403).json({ error: 'Only a super user can create another super user.' });
    }

    // A client viewer's entire access is defined by its client. Without one the
    // account can see nothing, so refuse rather than create a dead login.
    if (requestedRole === 'client_viewer') {
      const target = client_id ? db.getClientById(getAgencyId(req), String(client_id)) : undefined;
      if (!target) {
        return res.status(400).json({ error: 'Choose which client this viewer may see.' });
      }
    }

    try {
      const user = await createAccount({
        email: String(email || ''),
        password: String(password || ''),
        name: String(name || '').trim() || String(email || ''),
        role: requestedRole,
        agency_id: getAgencyId(req),
        client_id: client_id ? String(client_id) : undefined,
        brand_id: brand_id ? String(brand_id) : undefined
      });
      res.status(201).json(user);
    } catch (err: any) {
      res.status(400).json({ error: err.message || 'Could not create the user.' });
    }
  });

  app.delete('/api/users/:id', requireRole('super_user', 'agency_admin'), (req: AuthedRequest, res) => {
    if (req.params.id === req.appUser?.id) {
      return res.status(400).json({ error: 'You cannot remove your own account.' });
    }
    const target = db.getUserById(req.params.id);
    if (!target || (target.agency_id && target.agency_id !== getAgencyId(req) && req.appUser?.role !== 'super_user')) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json({ success: db.deleteUser(req.params.id) });
  });

  // ==================== CLIENTS ====================
  app.get('/api/clients', (req, res) => {
    const agencyId = getAgencyId(req);
    const scope = clientScopeOf(req as AuthedRequest);
    const clients = db.getClients(agencyId);
    res.json(scope ? clients.filter(c => c.id === scope) : clients);
  });

  // Account structure is an admin concern, not day-to-day campaign work.
  app.post('/api/clients', requireRole('super_user', 'agency_admin'), (req, res) => {
    const agencyId = getAgencyId(req);
    const { name, industry, currency, contact_person, contact_email } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Client name is required.' });
    }

    const trimmedName = name.trim();
    const existing = db.getClients(agencyId).find(
      c => c.name.trim().toLowerCase() === trimmedName.toLowerCase()
    );
    if (existing) {
      return res.status(409).json({ error: `A client named "${trimmedName}" already exists in this agency.` });
    }

    const client = db.createClient({
      agency_id: agencyId,
      name: trimmedName,
      industry: (industry && industry.trim()) || 'General',
      currency: currency || 'LKR',
      contact_person: (contact_person && contact_person.trim()) || '',
      contact_email: (contact_email && contact_email.trim()) || ''
    });

    db.addAuditLog({
      agency_id: agencyId,
      user_id: req.body.user_id || 'system',
      user_name: req.body.user_name || 'Agency User',
      action: 'CREATED_CLIENT',
      entity_type: 'client',
      entity_id: client.id,
      details: `Created client ${client.name} (${client.currency})`
    });

    res.status(201).json(client);
  });

  app.patch('/api/clients/:id', requireRole('super_user', 'agency_admin'), (req, res) => {
    const agencyId = getAgencyId(req);
    const { name, industry, currency, contact_person, contact_email } = req.body;

    const existingClient = db.getClientById(agencyId, req.params.id);
    if (!existingClient) {
      return res.status(404).json({ error: 'Client not found.' });
    }

    // Name uniqueness check if name is being modified
    if (name !== undefined) {
      const trimmedName = name.trim();
      if (!trimmedName) {
        return res.status(400).json({ error: 'Client name cannot be empty.' });
      }

      const duplicate = db.getClients(agencyId).find(
        c => c.id !== req.params.id && c.name.trim().toLowerCase() === trimmedName.toLowerCase()
      );
      if (duplicate) {
        return res.status(409).json({ error: `A client named "${trimmedName}" already exists in this agency.` });
      }
      req.body.name = trimmedName;
    }

    if (industry !== undefined) req.body.industry = industry.trim();
    if (contact_person !== undefined) req.body.contact_person = contact_person.trim();
    if (contact_email !== undefined) req.body.contact_email = contact_email.trim();

    const updated = db.updateClient(agencyId, req.params.id, req.body);
    if (!updated) return res.status(404).json({ error: 'Client not found.' });

    db.addAuditLog({
      agency_id: agencyId,
      user_id: req.body.user_id || 'system',
      user_name: req.body.user_name || 'Agency User',
      action: 'UPDATED_CLIENT',
      entity_type: 'client',
      entity_id: updated.id,
      details: `Updated client ${updated.name}`
    });

    res.json(updated);
  });

  app.delete('/api/clients/:id', requireRole('super_user', 'agency_admin'), (req, res) => {
    const agencyId = getAgencyId(req);
    const existing = db.getClientById(agencyId, req.params.id);
    const clientName = existing?.name || req.params.id;

    const success = db.deleteClient(agencyId, req.params.id);
    if (!success) return res.status(404).json({ error: 'Client not found.' });

    db.addAuditLog({
      agency_id: agencyId,
      user_id: 'system',
      user_name: 'Agency User',
      action: 'DELETED_CLIENT',
      entity_type: 'client',
      entity_id: req.params.id,
      details: `Deleted client ${clientName} and associated brands and campaigns`
    });

    res.json({ message: 'Client and all associated brands and campaigns deleted successfully' });
  });

  // ==================== BRANDS ====================
  app.get('/api/brands', (req, res) => {
    const agencyId = getAgencyId(req);
    const clientId = (clientScopeOf(req as AuthedRequest) || req.query.client_id) as string;
    res.json(db.getBrands(agencyId, clientId));
  });

  app.post('/api/brands', requireRole('super_user', 'agency_admin'), (req, res) => {
    const agencyId = getAgencyId(req);
    const { client_id, name, description, default_currency, default_kpi_targets } = req.body;
    if (!client_id || !name || !name.trim()) {
      return res.status(400).json({ error: 'Client selection and brand name are required.' });
    }

    const trimmedName = name.trim();
    // Validate uniqueness under this client
    const existing = db.getBrands(agencyId, client_id).find(
      b => b.name.trim().toLowerCase() === trimmedName.toLowerCase()
    );
    if (existing) {
      return res.status(409).json({ error: `A brand named "${trimmedName}" already exists for this client.` });
    }

    const brand = db.createBrand({
      agency_id: agencyId,
      client_id,
      name: trimmedName,
      description: (description && description.trim()) || '',
      default_currency: default_currency || 'LKR',
      default_kpi_targets: default_kpi_targets || {}
    });

    db.addAuditLog({
      agency_id: agencyId,
      user_id: req.body.user_id || 'system',
      user_name: req.body.user_name || 'Agency User',
      action: 'CREATED_BRAND',
      entity_type: 'brand',
      entity_id: brand.id,
      details: `Created brand ${brand.name}`
    });

    res.status(201).json(brand);
  });

  app.patch('/api/brands/:id', requireRole('super_user', 'agency_admin'), (req, res) => {
    const agencyId = getAgencyId(req);
    const currentBrand = db.getBrandById(agencyId, req.params.id);
    if (!currentBrand) return res.status(404).json({ error: 'Brand not found.' });

    const targetClientId = req.body.client_id || currentBrand.client_id;
    const { name, description } = req.body;

    // Validate brand name uniqueness
    if (name !== undefined) {
      const trimmedName = name.trim();
      if (!trimmedName) {
        return res.status(400).json({ error: 'Brand name cannot be empty.' });
      }

      const duplicate = db.getBrands(agencyId, targetClientId).find(
        b => b.id !== req.params.id && b.name.trim().toLowerCase() === trimmedName.toLowerCase()
      );
      if (duplicate) {
        return res.status(409).json({ error: `A brand named "${trimmedName}" already exists for this client.` });
      }
      req.body.name = trimmedName;
    }

    if (description !== undefined) req.body.description = description.trim();

    const updated = db.updateBrand(agencyId, req.params.id, req.body);
    if (!updated) return res.status(404).json({ error: 'Brand not found.' });

    db.addAuditLog({
      agency_id: agencyId,
      user_id: req.body.user_id || 'system',
      user_name: req.body.user_name || 'Agency User',
      action: 'UPDATED_BRAND',
      entity_type: 'brand',
      entity_id: updated.id,
      details: `Updated brand ${updated.name}`
    });

    res.json(updated);
  });

  app.delete('/api/brands/:id', requireRole('super_user', 'agency_admin'), (req, res) => {
    const agencyId = getAgencyId(req);
    const existing = db.getBrandById(agencyId, req.params.id);
    const brandName = existing?.name || req.params.id;

    const success = db.deleteBrand(agencyId, req.params.id);
    if (!success) return res.status(404).json({ error: 'Brand not found.' });

    db.addAuditLog({
      agency_id: agencyId,
      user_id: 'system',
      user_name: 'Agency User',
      action: 'DELETED_BRAND',
      entity_type: 'brand',
      entity_id: req.params.id,
      details: `Deleted brand ${brandName} and associated campaigns`
    });

    res.json({ message: 'Brand and associated campaigns deleted successfully' });
  });

  // ==================== CAMPAIGNS (Business Campaigns) ====================
  app.get('/api/campaigns', (req, res) => {
    const agencyId = getAgencyId(req);
    const clientId = req.query.client_id as string;
    const brandId = req.query.brand_id as string;
    const campaigns = db.getCampaigns(agencyId, clientId, brandId);

    // Calculate overview for each campaign
    const calculated = campaigns.map(c => HealthEngine.calculateCampaignMetrics(agencyId, c));
    res.json(calculated);
  });

  app.get('/api/campaigns/:id', (req, res) => {
    const agencyId = getAgencyId(req);
    const campaign = db.getCampaignById(agencyId, req.params.id);
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
    // Not 403: a client account should not be able to probe which campaign ids
    // exist under other clients.
    const scope = clientScopeOf(req as AuthedRequest);
    if (scope && campaign.client_id !== scope) return res.status(404).json({ error: 'Campaign not found' });
    const metrics = HealthEngine.calculateCampaignMetrics(agencyId, campaign);
    res.json(metrics);
  });

  app.post('/api/campaigns', (req, res) => {
    const agencyId = getAgencyId(req);
    const { client_id, brand_id, name, description, objective, start_date, end_date, currency, total_budget, usd_to_lkr_rate } = req.body;
    if (!client_id || !brand_id || !name || !start_date || !end_date) {
      return res.status(400).json({ error: 'client_id, brand_id, name, start_date, and end_date are required' });
    }

    const campaign = db.createCampaign({
      agency_id: agencyId,
      client_id,
      brand_id,
      name,
      description: description || '',
      objective: objective || 'General Awareness',
      start_date,
      end_date,
      total_budget: 0, // Calculated dynamically from Line Items
      currency: currency || 'LKR',
      usd_to_lkr_rate: Number(usd_to_lkr_rate) || 305,
      status: req.body.status || 'draft'
    });

    db.addAuditLog({
      agency_id: agencyId,
      user_id: req.body.user_id || 'system',
      user_name: req.body.user_name || 'Agency User',
      action: 'CREATED_CAMPAIGN',
      entity_type: 'campaign',
      entity_id: campaign.id,
      details: `Created campaign ${campaign.name}`
    });

    res.status(201).json(campaign);
  });

  app.patch('/api/campaigns/:id', (req, res) => {
    const agencyId = getAgencyId(req);

    // Business rule: If setting status to 'active', campaign must have at least one line item
    if (req.body.status === 'active') {
      const existingLineItems = db.getLineItems(agencyId, req.params.id);
      if (existingLineItems.length === 0) {
        return res.status(400).json({
          error: 'This campaign needs at least one line item before it can be activated.'
        });
      }
    }

    const updated = db.updateCampaign(agencyId, req.params.id, req.body);
    if (!updated) return res.status(404).json({ error: 'Campaign not found' });

    db.addAuditLog({
      agency_id: agencyId,
      user_id: req.body.user_id || 'system',
      user_name: req.body.user_name || 'Agency User',
      action: 'UPDATED_CAMPAIGN',
      entity_type: 'campaign',
      entity_id: updated.id,
      details: `Updated campaign ${updated.name}`
    });

    HealthEngine.syncAlertsForAgency(agencyId);
    res.json(updated);
  });

  app.delete('/api/campaigns/:id', (req, res) => {
    const agencyId = getAgencyId(req);
    const existing = db.getCampaignById(agencyId, req.params.id);
    const campName = existing?.name || req.params.id;

    const success = db.deleteCampaign(agencyId, req.params.id);
    if (!success) return res.status(404).json({ error: 'Campaign not found' });

    db.addAuditLog({
      agency_id: agencyId,
      user_id: 'system',
      user_name: 'Agency User',
      action: 'DELETED_CAMPAIGN',
      entity_type: 'campaign',
      entity_id: req.params.id,
      details: `Deleted campaign ${campName} and all associated line items`
    });

    HealthEngine.syncAlertsForAgency(agencyId);
    res.json({ message: 'Campaign and associated line items deleted successfully' });
  });

  // ==================== CAMPAIGN LINE ITEMS ====================
  app.get('/api/line-items', (req, res) => {
    const agencyId = getAgencyId(req);
    const campaignId = req.query.campaign_id as string;
    // This route filters by campaign, not by client, so without this a client
    // account asking for no campaign would receive every line item in the agency.
    const scope = clientScopeOf(req as AuthedRequest);
    const items = db.getLineItems(agencyId, campaignId).filter(l => !scope || l.client_id === scope);
    const calculated = items.map(l => HealthEngine.calculateLineItemMetrics(agencyId, l));
    res.json(calculated);
  });

  app.get('/api/line-items/:id', (req, res) => {
    const agencyId = getAgencyId(req);
    const item = db.getLineItemById(agencyId, req.params.id);
    if (!item) return res.status(404).json({ error: 'Line item not found' });
    const scope = clientScopeOf(req as AuthedRequest);
    if (scope && item.client_id !== scope) return res.status(404).json({ error: 'Line item not found' });
    const metrics = HealthEngine.calculateLineItemMetrics(agencyId, item);
    const daily = db.getDailyMetrics(agencyId, item.id);
    res.json({ ...metrics, daily_metrics: daily });
  });

  app.post('/api/line-items', (req, res) => {
    const agencyId = getAgencyId(req);
    const {
      campaign_id,
      platform,
      platform_account_id,
      platform_campaign_id,
      name,
      objective,
      start_date,
      end_date,
      budget,
      currency,
      primary_kpi,
      primary_kpi_target,
      secondary_kpi_targets,
      pacing_tolerance
    } = req.body;

    if (!campaign_id || !name || !platform || !budget || !primary_kpi) {
      return res.status(400).json({ error: 'campaign_id, name, platform, budget, and primary_kpi are required' });
    }

    const campaign = db.getCampaignById(agencyId, campaign_id);
    if (!campaign) return res.status(404).json({ error: 'Parent campaign not found' });

    const lineItem = db.createLineItem({
      campaign_id,
      agency_id: agencyId,
      client_id: campaign.client_id,
      brand_id: campaign.brand_id,
      platform,
      platform_account_id: (platform_account_id && String(platform_account_id).trim()) || '',
      platform_campaign_id: (platform_campaign_id && String(platform_campaign_id).trim()) || '',
      name,
      objective: objective || 'General',
      start_date: start_date || campaign.start_date,
      end_date: end_date || campaign.end_date,
      budget: Number(budget),
      currency: currency || campaign.currency,
      primary_kpi,
      primary_kpi_target: Number(primary_kpi_target) || 100,
      secondary_kpi_targets: secondary_kpi_targets || {},
      status: 'active',
      pacing_tolerance: Number(pacing_tolerance) || 15
    });

    HealthEngine.syncAlertsForAgency(agencyId);

    db.addAuditLog({
      agency_id: agencyId,
      user_id: req.body.user_id || 'system',
      user_name: req.body.user_name || 'Agency User',
      action: 'CREATED_LINE_ITEM',
      entity_type: 'line_item',
      entity_id: lineItem.id,
      details: `Created line item ${lineItem.name} on ${lineItem.platform} with budget ${lineItem.currency} ${lineItem.budget}`
    });

    res.status(201).json(lineItem);
  });

  app.patch('/api/line-items/:id', (req, res) => {
    const agencyId = getAgencyId(req);
    const updated = db.updateLineItem(agencyId, req.params.id, req.body);
    if (!updated) return res.status(404).json({ error: 'Line item not found' });

    db.addAuditLog({
      agency_id: agencyId,
      user_id: req.body.user_id || 'system',
      user_name: req.body.user_name || 'Agency User',
      action: 'UPDATED_LINE_ITEM',
      entity_type: 'line_item',
      entity_id: updated.id,
      details: `Updated line item ${updated.name} on ${updated.platform}`
    });

    HealthEngine.syncAlertsForAgency(agencyId);
    res.json(updated);
  });

  app.delete('/api/line-items/:id', (req, res) => {
    const agencyId = getAgencyId(req);
    const existing = db.getLineItemById(agencyId, req.params.id);
    const lineName = existing?.name || req.params.id;

    const success = db.deleteLineItem(agencyId, req.params.id);
    if (!success) return res.status(404).json({ error: 'Line item not found' });

    db.addAuditLog({
      agency_id: agencyId,
      user_id: 'system',
      user_name: 'Agency User',
      action: 'DELETED_LINE_ITEM',
      entity_type: 'line_item',
      entity_id: req.params.id,
      details: `Deleted line item ${lineName}`
    });

    HealthEngine.syncAlertsForAgency(agencyId);
    res.json({ message: 'Line item deleted successfully' });
  });

  // ==================== PLATFORM ACCOUNTS ====================
  app.get('/api/platform-accounts', (req, res) => {
    const agencyId = getAgencyId(req);
    const platform = req.query.platform as any;
    res.json(db.getPlatformAccounts(agencyId, platform));
  });

  // ==================== LINE ITEM DATA SOURCES MAPPING ====================
  app.get('/api/line-items/:id/data-sources', (req, res) => {
    const agencyId = getAgencyId(req);
    const sources = db.getLineItemDataSources(agencyId, req.params.id);
    res.json(sources);
  });

  app.get('/api/line-items/:id/available-campaigns', (req, res) => {
    const agencyId = getAgencyId(req);
    try {
      const candidates = db.getAvailablePlatformCampaigns(
        agencyId,
        req.params.id,
        req.query.account_id as string
      );
      res.json(candidates);
    } catch (err: any) {
      res.status(400).json({ error: err.message || 'Failed to fetch available platform campaigns' });
    }
  });

  app.post('/api/line-items/:id/data-sources', (req, res) => {
    const agencyId = getAgencyId(req);
    try {
      const {
        platform,
        platform_account_id,
        platform_campaign_id,
        platform_campaign_name,
        connection_id,
        user_id,
        user_name
      } = req.body;

      if (!platform || !platform_account_id || !platform_campaign_id || !platform_campaign_name) {
        return res.status(400).json({
          error: 'platform, platform_account_id, platform_campaign_id, and platform_campaign_name are required'
        });
      }

      const mapping = db.createLineItemDataSource(agencyId, {
        line_item_id: req.params.id,
        platform,
        platform_account_id,
        platform_campaign_id,
        platform_campaign_name,
        connection_id,
        user_id,
        user_name
      });

      HealthEngine.syncAlertsForAgency(agencyId);
      res.status(201).json(mapping);
    } catch (err: any) {
      res.status(400).json({ error: err.message || 'Failed to connect data source' });
    }
  });

  app.post('/api/line-items/:id/data-sources/:sourceId/disconnect', (req, res) => {
    const agencyId = getAgencyId(req);
    try {
      const rollback = req.body?.rollback !== false;
      const disconnected = db.disconnectLineItemDataSource(
        agencyId,
        req.params.id,
        req.params.sourceId,
        req.body?.user_id,
        req.body?.user_name,
        rollback
      );
      HealthEngine.syncAlertsForAgency(agencyId);
      res.json(disconnected);
    } catch (err: any) {
      res.status(400).json({ error: err.message || 'Failed to disconnect data source' });
    }
  });

  // Explicit Unlink & Rollback endpoint
  app.post('/api/line-items/:id/data-sources/:sourceId/unlink', (req, res) => {
    const agencyId = getAgencyId(req);
    try {
      const result = db.unlinkLineItemDataSource(
        agencyId,
        req.params.id,
        req.params.sourceId,
        req.body?.user_id,
        req.body?.user_name
      );
      HealthEngine.syncAlertsForAgency(agencyId);
      res.json(result);
    } catch (err: any) {
      res.status(400).json({ error: err.message || 'Failed to unlink data source' });
    }
  });

  app.delete('/api/line-items/:id/data-sources/:sourceId', (req, res) => {
    const agencyId = getAgencyId(req);
    try {
      const result = db.unlinkLineItemDataSource(
        agencyId,
        req.params.id,
        req.params.sourceId,
        req.body?.user_id,
        req.body?.user_name
      );
      HealthEngine.syncAlertsForAgency(agencyId);
      res.json({ message: 'Data source unlinked successfully and totals rolled back', ...result });
    } catch (err: any) {
      res.status(400).json({ error: err.message || 'Failed to delete data source mapping' });
    }
  });

  // Unlink all data sources for a campaign and roll back totals
  app.post('/api/campaigns/:id/unlink-data', (req, res) => {
    const agencyId = getAgencyId(req);
    try {
      const result = db.unlinkCampaignDataSources(
        agencyId,
        req.params.id,
        req.body?.user_id,
        req.body?.user_name
      );
      HealthEngine.syncAlertsForAgency(agencyId);
      res.json(result);
    } catch (err: any) {
      res.status(400).json({ error: err.message || 'Failed to unlink campaign data' });
    }
  });

  app.post('/api/migrate-legacy-mappings', (req, res) => {
    const agencyId = getAgencyId(req);
    try {
      const result = db.migrateLegacyLineItemDataSources(agencyId);
      HealthEngine.syncAlertsForAgency(agencyId);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to execute legacy data migration' });
    }
  });

  // ==================== UNMAPPED CAMPAIGNS ====================
  app.get('/api/unmapped-campaigns', (req, res) => {
    const agencyId = getAgencyId(req);
    const status = req.query.status as string;
    const items = db.getUnmappedCampaigns(agencyId, status || 'unmapped');
    res.json(items);
  });

  app.get('/api/unmapped-campaigns/:id', (req, res) => {
    const agencyId = getAgencyId(req);
    const item = db.getUnmappedCampaignById(agencyId, req.params.id);
    if (!item) return res.status(404).json({ error: 'Unmapped campaign not found' });
    res.json(item);
  });

  app.post('/api/unmapped-campaigns/pull', (req, res) => {
    const agencyId = getAgencyId(req);
    const platform = req.body.platform as any;
    const result = db.pullPlatformData(agencyId, platform);
    res.json(result);
  });

  app.post('/api/unmapped-campaigns/:id/map', (req, res) => {
    const agencyId = getAgencyId(req);
    try {
      const result = db.mapUnmappedCampaign(agencyId, req.params.id, {
        targetCampaignId: req.body.target_campaign_id,
        targetLineItemId: req.body.target_line_item_id,
        newLineItem: req.body.new_line_item,
        newCampaign: req.body.new_campaign
      });
      HealthEngine.syncAlertsForAgency(agencyId);
      res.json(result);
    } catch (err: any) {
      res.status(400).json({ error: err.message || 'Failed to map unmapped campaign' });
    }
  });

  app.post('/api/unmapped-campaigns/:id/unmap', (req, res) => {
    const agencyId = getAgencyId(req);
    try {
      const result = db.unmapCampaign(
        agencyId,
        req.params.id,
        req.body?.user_id,
        req.body?.user_name
      );
      HealthEngine.syncAlertsForAgency(agencyId);
      res.json(result);
    } catch (err: any) {
      res.status(400).json({ error: err.message || 'Failed to unlink campaign' });
    }
  });

  app.post('/api/unmapped-campaigns/:id/unlink', (req, res) => {
    const agencyId = getAgencyId(req);
    try {
      const result = db.unmapCampaign(
        agencyId,
        req.params.id,
        req.body?.user_id,
        req.body?.user_name
      );
      HealthEngine.syncAlertsForAgency(agencyId);
      res.json(result);
    } catch (err: any) {
      res.status(400).json({ error: err.message || 'Failed to unlink campaign' });
    }
  });

  app.post('/api/unmapped-campaigns/:id/dismiss', (req, res) => {
    const agencyId = getAgencyId(req);
    const updated = db.updateUnmappedCampaign(agencyId, req.params.id, { status: 'dismissed' });
    if (!updated) return res.status(404).json({ error: 'Unmapped campaign not found' });
    res.json(updated);
  });

  app.delete('/api/unmapped-campaigns/:id', (req, res) => {
    const agencyId = getAgencyId(req);
    const success = db.deleteUnmappedCampaign(agencyId, req.params.id);
    if (!success) return res.status(404).json({ error: 'Unmapped campaign not found' });
    res.json({ message: 'Unmapped campaign deleted successfully' });
  });

  // ==================== ALERTS ====================
  app.get('/api/alerts', (req, res) => {
    const agencyId = getAgencyId(req);
    const status = req.query.status as string;
    HealthEngine.syncAlertsForAgency(agencyId);
    res.json(db.getAlerts(agencyId, status));
  });

  app.patch('/api/alerts/:id', (req, res) => {
    const agencyId = getAgencyId(req);
    const { status } = req.body;
    const updated = db.updateAlertStatus(agencyId, req.params.id, status);
    if (!updated) return res.status(404).json({ error: 'Alert not found' });
    res.json(updated);
  });

  // ==================== CSV IMPORTS ====================
  app.get('/api/imports', (req, res) => {
    const agencyId = getAgencyId(req);
    res.json(db.getImports(agencyId));
  });

  // Converts an uploaded spreadsheet to CSV so .xlsx exports (TikTok Ads
  // delivers these by default) feed the same preview/execute pipeline.
  app.post('/api/imports/convert-xlsx', async (req, res) => {
    const { file_base64 } = req.body;
    if (!file_base64) return res.status(400).json({ error: 'file_base64 is required' });
    try {
      const csv = await XlsxEngine.convertToCsv(Buffer.from(String(file_base64), 'base64'));
      res.json({ csv });
    } catch (err: any) {
      res.status(400).json({ error: err.message || 'Could not read the uploaded spreadsheet.' });
    }
  });

  app.post('/api/imports/preview', (req, res) => {
    const { csv_content } = req.body;
    if (!csv_content) return res.status(400).json({ error: 'csv_content is required' });
    try {
      const preview = CsvEngine.parseAndPreview(csv_content);
      res.json(preview);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  /**
   * What the same payload would do if executed: which line items already hold
   * the days in the file, and which ad sets match nothing and would be created.
   * Takes exactly the body /execute takes, so the answer describes the import
   * the user is about to run rather than an approximation of it.
   */
  app.post('/api/imports/preview-impact', (req, res) => {
    const agencyId = getAgencyId(req);
    const {
      client_id, brand_id, campaign_id, platform, csv_content,
      column_mapping, campaign_matches, currency, direct_to_unmapped
    } = req.body;

    if (!client_id || !brand_id || !platform || !csv_content) {
      return res.status(400).json({ error: 'client_id, brand_id, platform, and csv_content are required' });
    }

    try {
      const impact = CsvEngine.analyzeImpact({
        agency_id: agencyId,
        client_id,
        brand_id,
        campaign_id,
        platform,
        file_name: 'preview',
        csv_content,
        column_mapping: column_mapping || {},
        campaign_matches: campaign_matches || {},
        currency: currency || 'LKR',
        direct_to_unmapped: direct_to_unmapped !== false
      });
      res.json(impact);
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Could not analyse the file' });
    }
  });

  /** Removes the rows a given import wrote. See db.revertImport for what it does not do. */
  app.post('/api/imports/:id/revert', async (req, res) => {
    const agencyId = getAgencyId(req);
    const job = db.getImports(agencyId).find(j => j.id === req.params.id);
    if (!job) return res.status(404).json({ error: 'Import not found.' });

    try {
      const result = await db.revertImport(agencyId, req.params.id);
      db.addAuditLog({
        agency_id: agencyId,
        user_id: (req as AuthedRequest).appUser?.id || 'system',
        user_name: (req as AuthedRequest).appUser?.name || 'System',
        action: 'REVERTED_CSV_IMPORT',
        entity_type: 'import',
        entity_id: job.id,
        details: `Reverted "${job.file_name}": removed ${result.metrics_removed} daily metrics and ${result.unmapped_rows_removed} unmapped rows.`
      });
      res.json({ success: true, file_name: job.file_name, ...result });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to revert import' });
    }
  });

  app.post('/api/imports/execute', (req, res) => {
    const agencyId = getAgencyId(req);
    const {
      client_id,
      brand_id,
      campaign_id,
      platform,
      file_name,
      csv_content,
      column_mapping,
      campaign_matches,
      currency,
      direct_to_unmapped
    } = req.body;

    if (!client_id || !brand_id || !platform || !csv_content) {
      return res.status(400).json({ error: 'client_id, brand_id, platform, and csv_content are required' });
    }

    const job = CsvEngine.processImportAsync({
      agency_id: agencyId,
      client_id,
      brand_id,
      campaign_id,
      platform,
      file_name: file_name || `${platform}_import_${Date.now()}.csv`,
      csv_content,
      column_mapping: column_mapping || {},
      campaign_matches: campaign_matches || {},
      currency: currency || 'LKR',
      direct_to_unmapped: direct_to_unmapped !== false
    });

    res.status(202).json(job);
  });

  app.get('/api/imports/sample/:platform', (req, res) => {
    const platform = req.params.platform;
    if (platform === 'meta') {
      res.json({ csv: CsvEngine.getSampleMetaCsv() });
    } else if (platform === 'tiktok') {
      res.json({ csv: CsvEngine.getSampleTikTokCsv() });
    } else {
      res.status(400).json({ error: 'Unsupported platform sample' });
    }
  });

  // ==================== COLUMN MAPPINGS ====================
  app.get('/api/column-mappings', (req, res) => {
    const agencyId = getAgencyId(req);
    const platform = req.query.platform as string;
    res.json(db.getColumnMappings(agencyId, platform));
  });

  app.post('/api/column-mappings', (req, res) => {
    const agencyId = getAgencyId(req);
    const { platform, mapping_name, mappings } = req.body;
    const saved = db.saveColumnMapping({
      agency_id: agencyId,
      platform,
      mapping_name,
      mappings
    });
    res.json(saved);
  });

  // ==================== SHARES & CLIENT VIEWER PORTAL ====================
  app.get('/api/shares', (req, res) => {
    const agencyId = getAgencyId(req);
    res.json(db.getDashboardShares(agencyId));
  });

  app.post('/api/shares', (req, res) => {
    const agencyId = getAgencyId(req);
    const { client_id, brand_id, campaign_id, title, recipient_email, expires_at } = req.body;
    if (!client_id || !title) {
      return res.status(400).json({ error: 'client_id and title are required' });
    }
    const share = db.createDashboardShare({
      agency_id: agencyId,
      client_id,
      brand_id,
      campaign_id,
      title,
      recipient_email,
      expires_at
    });
    res.status(201).json(share);
  });

  app.get('/api/shares/verify/:token', (req, res) => {
    const token = req.params.token;
    const share = db.getShareByToken(token);
    if (!share) return res.status(404).json({ error: 'Invalid or expired share link' });

    // Retrieve shared data
    const client = db.getClientById(share.agency_id, share.client_id);
    let campaigns = db.getCampaigns(share.agency_id, share.client_id, share.brand_id);
    if (share.campaign_id) {
      campaigns = campaigns.filter(c => c.id === share.campaign_id);
    }
    const calculatedCampaigns = campaigns.map(c => HealthEngine.calculateCampaignMetrics(share.agency_id, c));

    res.json({
      share,
      client,
      campaigns: calculatedCampaigns
    });
  });

  // ==================== AUDIT LOGS ====================
  app.get('/api/audit-logs', (req, res) => {
    res.json(db.getAuditLogs(getAgencyId(req)));
  });

  // ==================== SUPER USER STATS ====================
  app.get('/api/superuser/stats', (req, res) => {
    const agencies = db.getAgencies();
    const users = db.getUsers();
    const clients = db.clients;
    const campaigns = db.campaigns;
    const lineItems = db.lineItems;
    const dailyMetrics = db.dailyMetrics;
    const alerts = db.alerts;

    res.json({
      total_agencies: agencies.length,
      active_agencies: agencies.filter(a => a.status === 'active').length,
      total_users: users.length,
      total_clients: clients.length,
      total_campaigns: campaigns.length,
      total_line_items: lineItems.length,
      total_daily_metrics_rows: dailyMetrics.length,
      active_alerts: alerts.filter(a => a.status === 'active').length
    });
  });

  // ==================== SYSTEM ADMIN / DATA RESET ====================
  app.post('/api/system/clear-platform-data', async (req, res) => {
    try {
      const result = await db.clearPlatformData(getAgencyId(req));
      res.json({
        success: true,
        message: 'All platform data (unmapped campaigns, daily metrics, and platform data source mappings) cleared successfully.',
        details: result
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to clear platform data' });
    }
  });

  app.post('/api/unmapped-campaigns/clear', async (req, res) => {
    try {
      const agencyId = getAgencyId(req);
      const result = await db.clearPlatformData(agencyId);
      res.json({
        success: true,
        message: 'Platform campaigns and metrics cleared for current agency.',
        details: result
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to clear platform data' });
    }
  });

  // Wipes data for EVERY agency, not just the caller's. Off unless the
  // deployment opts in, and then still restricted to the platform owner.
  app.post('/api/system/clear-all-data', requireRole('super_user'), async (req, res) => {
    try {
      const result = await db.clearAllData();
      res.json({ success: true, message: 'All database data cleared. Dashboard is ready for testing from scratch.', details: result });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to clear database data' });
    }
  });

  // Kept for the existing Settings button. It used to run a second, older
  // seeder that wrote only to memory with dates hardcoded to last August, so
  // whatever it produced was already stale and gone by the next restart. It now
  // builds the same dataset as /api/system/demo-dataset.
  app.post('/api/system/seed-demo-data', requireRole('super_user', 'agency_admin'), async (req, res) => {
    try {
      const seeded = await db.seedDemoDataset(getAgencyId(req));
      HealthEngine.syncAlertsForAgency(getAgencyId(req));
      res.json({ success: true, message: 'Demo clients, brands, campaigns and delivery re-seeded.', seeded });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to seed demo data' });
    }
  });

  /**
   * Fills the signed-in agency with a demo dataset for showing the platform to
   * someone: three clients, four campaigns across Meta, TikTok and Google, in
   * two currencies, with thirty days of delivery ending yesterday.
   *
   * Every record is prefixed `demo_`, so DELETE takes exactly this data back
   * out and leaves real records alone. Re-running overwrites in place rather
   * than adding a second copy, and re-dates the set to the day it is run.
   */
  app.post('/api/system/demo-dataset', requireRole('super_user', 'agency_admin'), async (req, res) => {
    try {
      const counts = await db.seedDemoDataset(getAgencyId(req));
      HealthEngine.syncAlertsForAgency(getAgencyId(req));
      res.json({ success: true, seeded: counts });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to seed the demo dataset' });
    }
  });

  app.delete('/api/system/demo-dataset', requireRole('super_user', 'agency_admin'), async (req, res) => {
    try {
      const counts = await db.removeDemoDataset(getAgencyId(req));
      res.json({ success: true, removed: counts });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to remove the demo dataset' });
    }
  });

  /**
   * Moves every record from one agency to another. A repair tool, not part of
   * normal operation: data created under one tenant is fetched but filtered out
   * of every response for an account belonging to another, which looks exactly
   * like the data having been deleted.
   */
  app.post('/api/system/reassign-agency', requireRole('super_user'), async (req, res) => {
    const from = String(req.body?.from || '').trim();
    const to = String(req.body?.to || '').trim();

    if (!from || !to) {
      return res.status(400).json({ error: 'Provide both "from" and "to" agency ids.' });
    }
    if (from === to) {
      return res.status(400).json({ error: 'Source and target agency are the same.' });
    }

    const known = db.getAgencies().map(a => a.id);
    const unknown = [from, to].filter(id => !known.includes(id));
    if (unknown.length > 0) {
      return res.status(404).json({ error: `Unknown agency id(s): ${unknown.join(', ')}. Known: ${known.join(', ')}` });
    }

    try {
      const moved = await db.reassignAgency(from, to);
      res.json({ success: true, from, to, moved });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to reassign agency' });
    }
  });

  // ==================== FIRESTORE STATUS / MANUAL SYNC ====================
  app.get('/api/system/firestore-status', (req, res) => {
    res.json(db.getFirestoreStatus(getAgencyId(req)));
  });

  app.post('/api/system/firestore-sync', async (req, res) => {
    try {
      const counts = await db.resyncToFirestore(getAgencyId(req));
      res.json({ success: true, counts });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to sync to Firestore' });
    }
  });

  // ==================== VITE MIDDLEWARE / SPA SERVING ====================
  if (process.env.NODE_ENV !== 'production') {
    // Imported lazily so production builds don't need vite (a devDependency) installed.
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`OmniTrack server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
