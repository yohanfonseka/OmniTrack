import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { db } from './server/db.js';
import { HealthEngine } from './server/healthEngine.js';
import { CsvEngine } from './server/csvEngine.js';

async function startServer() {
  // Hydrate all database state from Cloud Firestore before serving requests
  try {
    await db.initFirestore();
  } catch (err) {
    console.error('[Server] Failed to initialize Firestore hydration:', err);
  }

  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '15mb' }));
  app.use(express.urlencoded({ extended: true, limit: '15mb' }));

  // Helper middleware to extract agency_id header or query param
  const getAgencyId = (req: express.Request): string => {
    return (req.headers['x-agency-id'] as string) || (req.query.agency_id as string) || 'agency_omni';
  };

  // ==================== HEALTH & METADATA ====================
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', server_time: new Date().toISOString() });
  });

  // ==================== AGENCIES (Super User Portal) ====================
  app.get('/api/agencies', (req, res) => {
    res.json(db.getAgencies());
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
    const agencyId = req.query.agency_id as string;
    res.json(db.getUsers(agencyId));
  });

  app.post('/api/users', (req, res) => {
    const user = db.createUser(req.body);
    res.status(201).json(user);
  });

  // ==================== CLIENTS ====================
  app.get('/api/clients', (req, res) => {
    const agencyId = getAgencyId(req);
    res.json(db.getClients(agencyId));
  });

  app.post('/api/clients', (req, res) => {
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

  app.patch('/api/clients/:id', (req, res) => {
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

  app.delete('/api/clients/:id', (req, res) => {
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
    const clientId = req.query.client_id as string;
    res.json(db.getBrands(agencyId, clientId));
  });

  app.post('/api/brands', (req, res) => {
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

  app.patch('/api/brands/:id', (req, res) => {
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

  app.delete('/api/brands/:id', (req, res) => {
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
    res.json(updated);
  });

  app.delete('/api/campaigns/:id', (req, res) => {
    const agencyId = getAgencyId(req);
    const success = db.deleteCampaign(agencyId, req.params.id);
    if (!success) return res.status(404).json({ error: 'Campaign not found' });
    res.json({ message: 'Campaign and associated line items deleted successfully' });
  });

  // ==================== CAMPAIGN LINE ITEMS ====================
  app.get('/api/line-items', (req, res) => {
    const agencyId = getAgencyId(req);
    const campaignId = req.query.campaign_id as string;
    const items = db.getLineItems(agencyId, campaignId);
    const calculated = items.map(l => HealthEngine.calculateLineItemMetrics(agencyId, l));
    res.json(calculated);
  });

  app.get('/api/line-items/:id', (req, res) => {
    const agencyId = getAgencyId(req);
    const item = db.getLineItemById(agencyId, req.params.id);
    if (!item) return res.status(404).json({ error: 'Line item not found' });
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
    HealthEngine.syncAlertsForAgency(agencyId);
    res.json(updated);
  });

  app.delete('/api/line-items/:id', (req, res) => {
    const agencyId = getAgencyId(req);
    const success = db.deleteLineItem(agencyId, req.params.id);
    if (!success) return res.status(404).json({ error: 'Line item not found' });
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
      const disconnected = db.disconnectLineItemDataSource(
        agencyId,
        req.params.id,
        req.params.sourceId,
        req.body?.user_id,
        req.body?.user_name
      );
      HealthEngine.syncAlertsForAgency(agencyId);
      res.json(disconnected);
    } catch (err: any) {
      res.status(400).json({ error: err.message || 'Failed to disconnect data source' });
    }
  });

  app.delete('/api/line-items/:id/data-sources/:sourceId', (req, res) => {
    const agencyId = getAgencyId(req);
    try {
      const success = db.deleteLineItemDataSource(
        agencyId,
        req.params.id,
        req.params.sourceId,
        req.body?.user_id,
        req.body?.user_name
      );
      if (!success) return res.status(404).json({ error: 'Data source mapping not found' });
      HealthEngine.syncAlertsForAgency(agencyId);
      res.json({ message: 'Data source mapping removed successfully' });
    } catch (err: any) {
      res.status(400).json({ error: err.message || 'Failed to delete data source mapping' });
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

  app.post('/api/imports/execute', (req, res) => {
    const agencyId = getAgencyId(req);
    const {
      client_id,
      brand_id,
      platform,
      file_name,
      csv_content,
      column_mapping,
      campaign_matches,
      currency
    } = req.body;

    if (!client_id || !brand_id || !platform || !csv_content) {
      return res.status(400).json({ error: 'client_id, brand_id, platform, and csv_content are required' });
    }

    const job = CsvEngine.processImportAsync({
      agency_id: agencyId,
      client_id,
      brand_id,
      platform,
      file_name: file_name || `${platform}_import_${Date.now()}.csv`,
      csv_content,
      column_mapping: column_mapping || {},
      campaign_matches: campaign_matches || {},
      currency: currency || 'LKR'
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
    const agencyId = req.query.agency_id as string;
    res.json(db.getAuditLogs(agencyId));
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
  app.post('/api/system/clear-all-data', async (req, res) => {
    try {
      const result = await db.clearAllData();
      res.json({ success: true, message: 'All database data cleared. Dashboard is ready for testing from scratch.', details: result });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to clear database data' });
    }
  });

  app.post('/api/system/seed-demo-data', async (req, res) => {
    try {
      db.seedDemoClientsAndCampaigns();
      res.json({ success: true, message: 'Demo clients, brands, campaigns and line items re-seeded.' });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to seed demo data' });
    }
  });

  // ==================== VITE MIDDLEWARE / SPA SERVING ====================
  if (process.env.NODE_ENV !== 'production') {
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
