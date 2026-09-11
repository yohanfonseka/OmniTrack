import {
  Agency,
  User,
  Client,
  Brand,
  Campaign,
  CampaignLineItem,
  PlatformAccount,
  LineItemDailyMetric,
  Alert,
  ImportJob,
  ColumnMapping,
  DashboardShare,
  AuditLog,
  UnmappedCampaign,
  PlatformType,
  LineItemDataSource
} from './types.js';
import {
  fetchCollection,
  saveDoc,
  deleteDocById,
  batchSaveDocs,
  clearCollection
} from './firestore.js';

// Relational Store In-Memory with Scoped Query APIs & Real-time Firestore Persistence
class RelationalDatabase {
  agencies: Agency[] = [];
  users: User[] = [];
  clients: Client[] = [];
  brands: Brand[] = [];
  campaigns: Campaign[] = [];
  lineItems: CampaignLineItem[] = [];
  platformAccounts: PlatformAccount[] = [];
  dailyMetrics: LineItemDailyMetric[] = [];
  alerts: Alert[] = [];
  imports: ImportJob[] = [];
  columnMappings: ColumnMapping[] = [];
  dashboardShares: DashboardShare[] = [];
  auditLogs: AuditLog[] = [];
  unmappedCampaigns: UnmappedCampaign[] = [];
  lineItemDataSources: LineItemDataSource[] = [];
  private firestoreInitialized = false;
  private isClearedState = false;

  constructor() {
    this.seedCoreTenants();
  }

  /**
   * Hydrate all database state from Firebase Firestore
   * Ensures that all saved clients, brands, campaigns and line items persist across restarts!
   */
  async initFirestore(): Promise<void> {
    if (this.firestoreInitialized) return;
    try {
      console.log('[Firestore Database] Hydrating application data from Cloud Firestore...');
      const [
        fsMeta,
        fsAgencies,
        fsClients,
        fsBrands,
        fsCampaigns,
        fsLineItems,
        fsMetrics,
        fsAlerts,
        fsUnmapped,
        fsDataSources
      ] = await Promise.all([
        fetchCollection<{ id: string; is_cleared?: boolean }>('system_metadata'),
        fetchCollection<Agency>('agencies'),
        fetchCollection<Client>('clients'),
        fetchCollection<Brand>('brands'),
        fetchCollection<Campaign>('campaigns'),
        fetchCollection<CampaignLineItem>('line_items'),
        fetchCollection<LineItemDailyMetric>('daily_metrics'),
        fetchCollection<Alert>('alerts'),
        fetchCollection<UnmappedCampaign>('unmapped_campaigns'),
        fetchCollection<LineItemDataSource>('line_item_data_sources')
      ]);

      const appState = fsMeta.find(m => m.id === 'app_state');
      if (appState?.is_cleared) {
        this.isClearedState = true;
        console.log('[Firestore Database] Database has been marked as cleared by user. Starting with clean slate.');
      }

      console.log(`[Firestore Hydration] Fetched: ${fsAgencies.length} agencies, ${fsClients.length} clients, ${fsBrands.length} brands, ${fsCampaigns.length} campaigns, ${fsLineItems.length} line items, ${fsDataSources.length} data sources, ${fsUnmapped.length} unmapped`);

      // 1. Merge Agencies
      if (fsAgencies.length > 0) {
        fsAgencies.forEach(fa => {
          const idx = this.agencies.findIndex(a => a.id === fa.id);
          if (idx !== -1) this.agencies[idx] = fa;
          else this.agencies.push(fa);
        });
      }

      if (this.isClearedState) {
        // When cleared by user, keep datasets strictly empty
        this.clients = [];
        this.brands = [];
        this.campaigns = [];
        this.lineItems = [];
        this.dailyMetrics = [];
        this.alerts = [];
        this.unmappedCampaigns = [];
        this.lineItemDataSources = [];
      } else {
        // Reflect Firestore documents directly
        this.clients = [...fsClients];
        this.brands = [...fsBrands];
        this.campaigns = [...fsCampaigns];
        this.lineItems = [...fsLineItems];
        this.dailyMetrics = [...fsMetrics];
        this.alerts = [...fsAlerts];
        this.unmappedCampaigns = [...fsUnmapped];
        this.lineItemDataSources = [...fsDataSources];

        // Run legacy line item migration if any legacy fields exist without line_item_data_sources
        this.migrateLegacyLineItemDataSources();
      }

      this.firestoreInitialized = true;
      console.log('[Firestore Database] Hydration complete! Active clients:', this.clients.map(c => c.name));
    } catch (err) {
      console.error('[Firestore Database] Failed to hydrate from Firestore:', err);
    }
  }

  /**
   * Delete ALL user-generated data across the system to test the dashboard from scratch
   */
  async clearAllData(): Promise<{ success: boolean; clearedCollections: Record<string, number> }> {
    this.clients = [];
    this.brands = [];
    this.campaigns = [];
    this.lineItems = [];
    this.lineItemDataSources = [];
    this.dailyMetrics = [];
    this.alerts = [];
    this.unmappedCampaigns = [];
    this.imports = [];
    this.columnMappings = [];
    this.dashboardShares = [];
    this.auditLogs = [];
    this.isClearedState = true;

    // Persist clear state flag to Firestore
    await saveDoc('system_metadata', 'app_state', {
      is_cleared: true,
      cleared_at: new Date().toISOString()
    });

    const collectionsToClear = [
      'clients',
      'brands',
      'campaigns',
      'line_items',
      'line_item_data_sources',
      'daily_metrics',
      'alerts',
      'unmapped_campaigns',
      'imports',
      'column_mappings',
      'dashboard_shares',
      'audit_logs'
    ];

    const clearedCollections: Record<string, number> = {};
    for (const col of collectionsToClear) {
      try {
        const count = await clearCollection(col);
        clearedCollections[col] = count;
      } catch (err) {
        console.error(`[Clear Data] Error clearing collection "${col}":`, err);
        clearedCollections[col] = 0;
      }
    }

    console.log('[Firestore Database] All application data cleared successfully.', clearedCollections);
    return { success: true, clearedCollections };
  }

  private ensureBaselineSyncedToFirestore(): void {
    // Write in background so Firestore has complete dataset
    for (const c of this.clients) {
      saveDoc('clients', c.id, c).catch(() => {});
    }
    for (const b of this.brands) {
      saveDoc('brands', b.id, b).catch(() => {});
    }
    for (const cmp of this.campaigns) {
      saveDoc('campaigns', cmp.id, cmp).catch(() => {});
    }
    for (const l of this.lineItems) {
      saveDoc('line_items', l.id, l).catch(() => {});
    }
    for (const ds of this.lineItemDataSources) {
      saveDoc('line_item_data_sources', ds.id, ds).catch(() => {});
    }
    for (const a of this.agencies) {
      saveDoc('agencies', a.id, a).catch(() => {});
    }
  }

  // ==================== AGENCIES ====================
  getAgencies(): Agency[] {
    return [...this.agencies];
  }

  getAgencyById(id: string): Agency | undefined {
    return this.agencies.find(a => a.id === id);
  }

  createAgency(agency: Omit<Agency, 'id' | 'created_at' | 'updated_at'>): Agency {
    const newAgency: Agency = {
      ...agency,
      id: `agency_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    this.agencies.push(newAgency);
    saveDoc('agencies', newAgency.id, newAgency).catch(err => console.error('[Firestore] createAgency error:', err));
    return newAgency;
  }

  updateAgency(id: string, updates: Partial<Agency>): Agency | undefined {
    const idx = this.agencies.findIndex(a => a.id === id);
    if (idx === -1) return undefined;
    this.agencies[idx] = {
      ...this.agencies[idx],
      ...updates,
      updated_at: new Date().toISOString()
    };
    saveDoc('agencies', id, this.agencies[idx]).catch(err => console.error('[Firestore] updateAgency error:', err));
    return this.agencies[idx];
  }

  // ==================== USERS ====================
  getUsers(agencyId?: string): User[] {
    if (!agencyId) return [...this.users];
    return this.users.filter(u => u.agency_id === agencyId || u.role === 'super_user');
  }

  getUserById(id: string): User | undefined {
    return this.users.find(u => u.id === id);
  }

  createUser(user: Omit<User, 'id' | 'created_at'>): User {
    const newUser: User = {
      ...user,
      id: `user_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      created_at: new Date().toISOString()
    };
    this.users.push(newUser);
    return newUser;
  }

  // ==================== CLIENTS ====================
  getClients(agencyId: string): Client[] {
    return this.clients.filter(c => c.agency_id === agencyId);
  }

  getClientById(agencyId: string, id: string): Client | undefined {
    return this.clients.find(c => c.agency_id === agencyId && c.id === id);
  }

  createClient(client: Omit<Client, 'id' | 'created_at' | 'updated_at'>): Client {
    const newClient: Client = {
      ...client,
      id: `client_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    this.clients.push(newClient);
    saveDoc('clients', newClient.id, newClient).catch(err => console.error('[Firestore] createClient error:', err));
    return newClient;
  }

  updateClient(agencyId: string, id: string, updates: Partial<Client>): Client | undefined {
    const idx = this.clients.findIndex(c => c.agency_id === agencyId && c.id === id);
    if (idx === -1) return undefined;
    this.clients[idx] = {
      ...this.clients[idx],
      ...updates,
      updated_at: new Date().toISOString()
    };
    saveDoc('clients', id, this.clients[idx]).catch(err => console.error('[Firestore] updateClient error:', err));
    return this.clients[idx];
  }

  deleteClient(agencyId: string, id: string): boolean {
    const idx = this.clients.findIndex(c => c.agency_id === agencyId && c.id === id);
    if (idx === -1) return false;
    this.clients.splice(idx, 1);
    // Cascade delete brands, campaigns, line items
    const brandIds = this.brands.filter(b => b.client_id === id).map(b => b.id);
    const campIds = this.campaigns.filter(c => c.client_id === id).map(c => c.id);
    const lineIds = this.lineItems.filter(l => l.client_id === id).map(l => l.id);
    this.brands = this.brands.filter(b => b.client_id !== id);
    this.campaigns = this.campaigns.filter(c => !brandIds.includes(c.brand_id) && c.client_id !== id);
    this.lineItems = this.lineItems.filter(l => l.client_id !== id);
    this.dailyMetrics = this.dailyMetrics.filter(m => m.client_id !== id);

    deleteDocById('clients', id).catch(err => console.error('[Firestore] deleteClient error:', err));
    brandIds.forEach(bid => deleteDocById('brands', bid).catch(err => console.error('[Firestore] deleteBrand error:', err)));
    campIds.forEach(cid => deleteDocById('campaigns', cid).catch(err => console.error('[Firestore] deleteCampaign error:', err)));
    lineIds.forEach(lid => deleteDocById('line_items', lid).catch(err => console.error('[Firestore] deleteLineItem error:', err)));

    return true;
  }

  // ==================== BRANDS ====================
  getBrands(agencyId: string, clientId?: string): Brand[] {
    return this.brands.filter(b => {
      const matchAgency = b.agency_id === agencyId;
      if (clientId) return matchAgency && b.client_id === clientId;
      return matchAgency;
    });
  }

  getBrandById(agencyId: string, id: string): Brand | undefined {
    return this.brands.find(b => b.agency_id === agencyId && b.id === id);
  }

  createBrand(brand: Omit<Brand, 'id' | 'created_at' | 'updated_at'>): Brand {
    const newBrand: Brand = {
      ...brand,
      id: `brand_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    this.brands.push(newBrand);
    saveDoc('brands', newBrand.id, newBrand).catch(err => console.error('[Firestore] createBrand error:', err));
    return newBrand;
  }

  updateBrand(agencyId: string, id: string, updates: Partial<Brand>): Brand | undefined {
    const idx = this.brands.findIndex(b => b.agency_id === agencyId && b.id === id);
    if (idx === -1) return undefined;
    this.brands[idx] = {
      ...this.brands[idx],
      ...updates,
      updated_at: new Date().toISOString()
    };
    saveDoc('brands', id, this.brands[idx]).catch(err => console.error('[Firestore] updateBrand error:', err));
    return this.brands[idx];
  }

  deleteBrand(agencyId: string, id: string): boolean {
    const idx = this.brands.findIndex(b => b.agency_id === agencyId && b.id === id);
    if (idx === -1) return false;
    this.brands.splice(idx, 1);
    const campIds = this.campaigns.filter(c => c.brand_id === id).map(c => c.id);
    const lineIds = this.lineItems.filter(l => l.brand_id === id).map(l => l.id);
    this.campaigns = this.campaigns.filter(c => c.brand_id !== id);
    this.lineItems = this.lineItems.filter(l => l.brand_id !== id);
    this.dailyMetrics = this.dailyMetrics.filter(m => m.brand_id !== id);

    deleteDocById('brands', id).catch(err => console.error('[Firestore] deleteBrand error:', err));
    campIds.forEach(cid => deleteDocById('campaigns', cid).catch(err => console.error('[Firestore] deleteCampaign error:', err)));
    lineIds.forEach(lid => deleteDocById('line_items', lid).catch(err => console.error('[Firestore] deleteLineItem error:', err)));

    return true;
  }

  // ==================== CAMPAIGNS ====================
  getCampaigns(agencyId: string, clientId?: string, brandId?: string): Campaign[] {
    return this.campaigns.filter(c => {
      if (c.agency_id !== agencyId) return false;
      if (clientId && c.client_id !== clientId) return false;
      if (brandId && c.brand_id !== brandId) return false;
      return true;
    });
  }

  getCampaignById(agencyId: string, id: string): Campaign | undefined {
    return this.campaigns.find(c => c.agency_id === agencyId && c.id === id);
  }

  createCampaign(campaign: Omit<Campaign, 'id' | 'created_at' | 'updated_at'>): Campaign {
    const newCampaign: Campaign = {
      ...campaign,
      id: `camp_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    this.campaigns.push(newCampaign);
    saveDoc('campaigns', newCampaign.id, newCampaign).catch(err => console.error('[Firestore] createCampaign error:', err));
    return newCampaign;
  }

  updateCampaign(agencyId: string, id: string, updates: Partial<Campaign>): Campaign | undefined {
    const idx = this.campaigns.findIndex(c => c.agency_id === agencyId && c.id === id);
    if (idx === -1) return undefined;
    this.campaigns[idx] = {
      ...this.campaigns[idx],
      ...updates,
      updated_at: new Date().toISOString()
    };
    saveDoc('campaigns', id, this.campaigns[idx]).catch(err => console.error('[Firestore] updateCampaign error:', err));
    return this.campaigns[idx];
  }

  deleteCampaign(agencyId: string, id: string): boolean {
    const idx = this.campaigns.findIndex(c => c.agency_id === agencyId && c.id === id);
    if (idx === -1) return false;
    this.campaigns.splice(idx, 1);
    const lineIds = this.lineItems.filter(l => l.campaign_id === id).map(l => l.id);
    this.lineItems = this.lineItems.filter(l => l.campaign_id !== id);
    this.dailyMetrics = this.dailyMetrics.filter(m => m.campaign_id !== id);

    deleteDocById('campaigns', id).catch(err => console.error('[Firestore] deleteCampaign error:', err));
    lineIds.forEach(lid => deleteDocById('line_items', lid).catch(err => console.error('[Firestore] deleteLineItem error:', err)));

    return true;
  }

  recalculateCampaignBudget(campaignId: string): void {
    const lines = this.lineItems.filter(l => l.campaign_id === campaignId);
    const sum = lines.reduce((acc, curr) => acc + (curr.budget || 0), 0);
    const camp = this.campaigns.find(c => c.id === campaignId);
    if (camp) {
      camp.total_budget = sum;
      camp.updated_at = new Date().toISOString();
      saveDoc('campaigns', camp.id, camp).catch(err => console.error('[Firestore] saveCampaign budget error:', err));
    }
  }

  // ==================== CAMPAIGN LINE ITEMS ====================
  getLineItems(agencyId: string, campaignId?: string): CampaignLineItem[] {
    return this.lineItems.filter(l => {
      if (l.agency_id !== agencyId) return false;
      if (campaignId && l.campaign_id !== campaignId) return false;
      return true;
    });
  }

  getLineItemById(agencyId: string, id: string): CampaignLineItem | undefined {
    return this.lineItems.find(l => l.agency_id === agencyId && l.id === id);
  }

  createLineItem(lineItem: Omit<CampaignLineItem, 'id' | 'created_at' | 'updated_at'>): CampaignLineItem {
    const newLine: CampaignLineItem = {
      ...lineItem,
      id: `line_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    this.lineItems.push(newLine);
    this.recalculateCampaignBudget(newLine.campaign_id);
    saveDoc('line_items', newLine.id, newLine).catch(err => console.error('[Firestore] createLineItem error:', err));
    return newLine;
  }

  updateLineItem(agencyId: string, id: string, updates: Partial<CampaignLineItem>): CampaignLineItem | undefined {
    const idx = this.lineItems.findIndex(l => l.agency_id === agencyId && l.id === id);
    if (idx === -1) return undefined;
    this.lineItems[idx] = {
      ...this.lineItems[idx],
      ...updates,
      updated_at: new Date().toISOString()
    };
    this.recalculateCampaignBudget(this.lineItems[idx].campaign_id);
    saveDoc('line_items', id, this.lineItems[idx]).catch(err => console.error('[Firestore] updateLineItem error:', err));
    return this.lineItems[idx];
  }

  deleteLineItem(agencyId: string, id: string): boolean {
    const idx = this.lineItems.findIndex(l => l.agency_id === agencyId && l.id === id);
    if (idx === -1) return false;
    const campaignId = this.lineItems[idx].campaign_id;
    this.lineItems.splice(idx, 1);
    this.dailyMetrics = this.dailyMetrics.filter(m => m.line_item_id !== id);
    this.recalculateCampaignBudget(campaignId);
    deleteDocById('line_items', id).catch(err => console.error('[Firestore] deleteLineItem error:', err));
    return true;
  }

  // ==================== PLATFORM ACCOUNTS ====================
  getPlatformAccounts(agencyId: string, platform?: PlatformType): PlatformAccount[] {
    return this.platformAccounts.filter(p => {
      if (p.agency_id !== agencyId) return false;
      if (platform && p.platform.toLowerCase() !== platform.toLowerCase()) return false;
      return true;
    });
  }

  // ==================== LINE ITEM DATA SOURCES ====================
  getLineItemDataSources(agencyId: string, lineItemId?: string): LineItemDataSource[] {
    return this.lineItemDataSources.filter(s => {
      if (lineItemId && s.line_item_id !== lineItemId) return false;
      // Ensure line item belongs to this agency
      const li = this.lineItems.find(l => l.id === s.line_item_id);
      return !li || li.agency_id === agencyId;
    });
  }

  getAvailablePlatformCampaigns(
    agencyId: string,
    lineItemId: string,
    accountId?: string
  ): {
    campaign_id: string;
    campaign_name: string;
    platform: PlatformType;
    platform_account_id: string;
    platform_account_name: string;
    status: string;
    start_date: string;
    end_date: string;
    objective: string;
    total_spend: number;
    currency: string;
    is_recommended: boolean;
    match_score: number;
    match_reasons: string[];
    stars: number;
  }[] {
    const lineItem = this.getLineItemById(agencyId, lineItemId);
    if (!lineItem) throw new Error('Line item not found');

    const businessCampaign = this.getCampaignById(agencyId, lineItem.campaign_id);
    const platform = lineItem.platform;

    // Set of platform campaign IDs already actively linked to ANY line item
    const activelyLinkedIds = new Set(
      this.lineItemDataSources
        .filter(s => s.status === 'active')
        .map(s => s.platform_campaign_id)
    );

    // Accounts for this platform
    const platformAccounts = this.getPlatformAccounts(agencyId, platform);

    // Gather candidate campaigns from unmapped campaigns table
    const candidates: {
      campaign_id: string;
      campaign_name: string;
      platform: PlatformType;
      platform_account_id: string;
      platform_account_name: string;
      status: string;
      start_date: string;
      end_date: string;
      objective: string;
      total_spend: number;
      currency: string;
    }[] = [];

    // 1. Unmapped campaigns
    for (const u of this.unmappedCampaigns) {
      if (u.agency_id === agencyId && u.platform === platform && u.status === 'unmapped') {
        if (!activelyLinkedIds.has(u.platform_campaign_id)) {
          if (!accountId || u.platform_account_id === accountId) {
            const acc = platformAccounts.find(a => a.account_id === u.platform_account_id);
            candidates.push({
              campaign_id: u.platform_campaign_id,
              campaign_name: u.platform_campaign_name,
              platform: u.platform,
              platform_account_id: u.platform_account_id,
              platform_account_name: acc?.account_name || u.platform_account_name || u.platform_account_id,
              status: 'active',
              start_date: u.first_report_date || lineItem.start_date,
              end_date: u.last_report_date || lineItem.end_date,
              objective: u.objective || 'General',
              total_spend: u.total_spend || 0,
              currency: u.currency || lineItem.currency
            });
          }
        }
      }
    }

    // 2. Default platform ad account catalog campaigns for seamless testing and demonstration
    const catalogByPlatform: Record<string, {
      account_id: string;
      campaigns: { id: string; name: string; objective: string; spend: number; start: string; end: string; currency: string }[];
    }[]> = {
      meta: [
        {
          account_id: 'act_491024810',
          campaigns: [
            { id: '23849102401', name: 'New Product Launch | Awareness & Reach', objective: 'Reach & Brand Awareness', spend: 312000, start: '2026-08-20', end: '2026-09-20', currency: 'LKR' },
            { id: '23849102402', name: 'New Product Launch | Engagement & Reels', objective: 'Post Engagement & Video Reels', spend: 185000, start: '2026-08-20', end: '2026-09-20', currency: 'LKR' },
            { id: '23849102403', name: 'Meta Flash Promo Conversions Q3', objective: 'Web Conversions', spend: 245000, start: '2026-09-01', end: '2026-09-15', currency: 'LKR' },
            { id: '23849102404', name: 'Brand A - Summer Refresh Advantage+ Reach', objective: 'Reach & Brand Awareness', spend: 280000, start: '2026-08-20', end: '2026-09-20', currency: 'LKR' },
            { id: '23849102405', name: 'Brand A - Retargeting Website Visitors Q3', objective: 'Conversions & Sales', spend: 195000, start: '2026-09-01', end: '2026-09-30', currency: 'LKR' }
          ]
        },
        {
          account_id: 'act_991827361',
          campaigns: [
            { id: '991827361001', name: 'Meta Catalog Sales - Activewear', objective: 'ROAS & Purchases', spend: 12500, start: '2026-09-01', end: '2026-09-30', currency: 'USD' },
            { id: '991827361002', name: 'Apex Active - Brand Story Carousel', objective: 'Brand Awareness', spend: 8500, start: '2026-09-05', end: '2026-09-25', currency: 'USD' }
          ]
        }
      ],
      tiktok: [
        {
          account_id: 'tt_7291840192',
          campaigns: [
            { id: '7291840192001', name: 'New Product Launch | TikTok In-Feed Video Reach', objective: 'In-Feed Video Reach', spend: 188000, start: '2026-08-20', end: '2026-09-20', currency: 'LKR' },
            { id: '7291840192002', name: 'Brand A - TikTok Spark Ads Viral Trend Wave', objective: 'In-Feed Video Reach', spend: 145000, start: '2026-08-25', end: '2026-09-20', currency: 'LKR' },
            { id: '7291840192003', name: 'Brand A - TikTok Creator Marketplace Influencer Challenge', objective: 'Post Engagement & Video Views', spend: 110000, start: '2026-09-01', end: '2026-09-25', currency: 'LKR' },
            { id: '7291840192004', name: 'Brand A - Gen Z Viral Sound Spark Promotion', objective: 'Video Views', spend: 95000, start: '2026-09-05', end: '2026-09-30', currency: 'LKR' }
          ]
        }
      ],
      google: [
        {
          account_id: 'act_goog_99412',
          campaigns: [
            { id: 'goog_pmax_brand_a', name: 'Brand A - Performance Max Q3 Scale', objective: 'Conversions & Sales', spend: 230000, start: '2026-08-20', end: '2026-09-20', currency: 'LKR' },
            { id: 'goog_search_brand_a', name: 'Brand A - Pure Brand Defense Keywords', objective: 'Search Traffic', spend: 85000, start: '2026-08-20', end: '2026-09-20', currency: 'LKR' },
            { id: 'goog_yt_reach_a', name: 'Brand A - YouTube 15s Non-Skippable Brand Reach', objective: 'Reach & Brand Awareness', spend: 175000, start: '2026-08-20', end: '2026-09-20', currency: 'LKR' }
          ]
        }
      ]
    };

    const platformCatalog = catalogByPlatform[platform.toLowerCase()] || [];
    for (const entry of platformCatalog) {
      if (!accountId || entry.account_id === accountId) {
        const acc = platformAccounts.find(a => a.account_id === entry.account_id);
        for (const camp of entry.campaigns) {
          if (!activelyLinkedIds.has(camp.id) && !candidates.some(c => c.campaign_id === camp.id)) {
            candidates.push({
              campaign_id: camp.id,
              campaign_name: camp.name,
              platform: platform,
              platform_account_id: entry.account_id,
              platform_account_name: acc?.account_name || entry.account_id,
              status: 'active',
              start_date: camp.start,
              end_date: camp.end,
              objective: camp.objective,
              total_spend: camp.spend,
              currency: camp.currency
            });
          }
        }
      }
    }

    // 3. Recommendation & Smart Match Calculation
    const scored = candidates.map(cand => {
      let score = 0;
      const reasons: string[] = [];

      const lineWords = lineItem.name.toLowerCase().split(/[\s\-_|/]+/).filter(w => w.length > 2);
      const campWords = cand.campaign_name.toLowerCase().split(/[\s\-_|/]+/).filter(w => w.length > 2);
      const parentWords = businessCampaign?.name.toLowerCase().split(/[\s\-_|/]+/).filter(w => w.length > 2) || [];

      // Check keyword overlap
      const matchingLineWords = lineWords.filter(w => campWords.includes(w));
      const matchingParentWords = parentWords.filter(w => campWords.includes(w));

      if (matchingLineWords.length > 0) {
        score += Math.min(45, matchingLineWords.length * 20);
        reasons.push(`High name similarity on "${matchingLineWords.join(', ')}"`);
      } else if (matchingParentWords.length > 0) {
        score += Math.min(35, matchingParentWords.length * 15);
        reasons.push(`Campaign name aligns with initiative "${matchingParentWords.join(', ')}"`);
      }

      // Objective comparison
      const normLineObj = (lineItem.objective || '').toLowerCase();
      const normCandObj = (cand.objective || '').toLowerCase();
      if (
        normLineObj &&
        normCandObj &&
        (normCandObj.includes(normLineObj) || normLineObj.includes(normCandObj) ||
         (normLineObj.includes('reach') && normCandObj.includes('reach')) ||
         (normLineObj.includes('aware') && normCandObj.includes('aware')) ||
         (normLineObj.includes('view') && normCandObj.includes('view')) ||
         (normLineObj.includes('conversion') && normCandObj.includes('conversion')))
      ) {
        score += 30;
        reasons.push(`Matching marketing objective: "${cand.objective}"`);
      }

      // Date alignment
      if (cand.start_date === lineItem.start_date && cand.end_date === lineItem.end_date) {
        score += 25;
        reasons.push('Identical flight dates (' + cand.start_date + ' to ' + cand.end_date + ')');
      } else if (Math.abs(new Date(cand.start_date).getTime() - new Date(lineItem.start_date).getTime()) <= 7 * 86400000) {
        score += 15;
        reasons.push('Flight schedule overlaps within 7 days');
      }

      // Currency match
      if (cand.currency.toUpperCase() === lineItem.currency.toUpperCase()) {
        score += 10;
      }

      const match_score = Math.min(99, Math.max(10, score));
      const is_recommended = match_score >= 60;
      const stars = is_recommended ? (match_score >= 85 ? 5 : 4) : (match_score >= 40 ? 3 : 2);

      return {
        ...cand,
        is_recommended,
        match_score,
        match_reasons: reasons.length > 0 ? reasons : ['Platform matches line item type'],
        stars
      };
    });

    // Sort: Recommended first (highest score descending), then by campaign name
    scored.sort((a, b) => {
      if (a.is_recommended && !b.is_recommended) return -1;
      if (!a.is_recommended && b.is_recommended) return 1;
      return b.match_score - a.match_score || a.campaign_name.localeCompare(b.campaign_name);
    });

    return scored;
  }

  createLineItemDataSource(
    agencyId: string,
    params: {
      line_item_id: string;
      platform: PlatformType;
      platform_account_id: string;
      platform_campaign_id: string;
      platform_campaign_name: string;
      connection_id?: string;
      user_id?: string;
      user_name?: string;
    }
  ): LineItemDataSource {
    // 1. Validate Line Item exists
    const lineItem = this.getLineItemById(agencyId, params.line_item_id);
    if (!lineItem) throw new Error('Line item not found');

    // 2. Validate Business Campaign exists
    const campaign = this.getCampaignById(agencyId, lineItem.campaign_id);
    if (!campaign) throw new Error('Business Campaign not found for this Line Item');

    // 3. Validate Platform match
    if (params.platform.toLowerCase() !== lineItem.platform.toLowerCase()) {
      throw new Error(`Platform mismatch: Line Item is for ${lineItem.platform.toUpperCase()}, cannot connect ${params.platform.toUpperCase()} campaign`);
    }

    // 4. Validate uniqueness: Platform Campaign must not already be linked to another Line Item
    const existing = this.lineItemDataSources.find(
      s => s.status === 'active' && s.platform_campaign_id === params.platform_campaign_id
    );
    if (existing && existing.line_item_id !== lineItem.id) {
      const otherLi = this.lineItems.find(l => l.id === existing.line_item_id);
      throw new Error(
        `Platform Campaign "${params.platform_campaign_name}" (${params.platform_campaign_id}) is already linked to Line Item "${otherLi?.name || existing.line_item_id}".`
      );
    }

    const acc = this.platformAccounts.find(a => a.agency_id === agencyId && a.account_id === params.platform_account_id);

    // If already linked to THIS line item, re-activate if disconnected
    if (existing && existing.line_item_id === lineItem.id) {
      existing.status = 'active';
      existing.platform_campaign_name = params.platform_campaign_name;
      existing.updated_at = new Date().toISOString();
      saveDoc('line_item_data_sources', existing.id, existing).catch(err => console.error('[Firestore] update DataSource error:', err));
      return existing;
    }

    // Create new LineItemDataSource
    const newSource: LineItemDataSource = {
      id: `ds_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      line_item_id: lineItem.id,
      platform: params.platform,
      platform_account_id: params.platform_account_id,
      platform_account_name: acc?.account_name || params.platform_account_id,
      platform_campaign_id: params.platform_campaign_id,
      platform_campaign_name: params.platform_campaign_name,
      connection_id: params.connection_id || `conn_${params.platform}_${params.platform_account_id}`,
      linked_at: new Date().toISOString(),
      linked_by: params.user_name || 'Media Planner',
      last_seen_at: new Date().toISOString(),
      status: 'active',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    this.lineItemDataSources.push(newSource);
    saveDoc('line_item_data_sources', newSource.id, newSource).catch(err => console.error('[Firestore] create LineItemDataSource error:', err));

    // Update LineItem with primary platform link for quick reference
    lineItem.platform_account_id = params.platform_account_id;
    lineItem.platform_campaign_id = params.platform_campaign_id;
    lineItem.updated_at = new Date().toISOString();
    saveDoc('line_items', lineItem.id, lineItem).catch(err => console.error('[Firestore] update LineItem error:', err));

    // If this campaign exists in unmapped campaigns, mark it as mapped
    const unmapped = this.unmappedCampaigns.find(u => u.platform_campaign_id === params.platform_campaign_id);
    if (unmapped) {
      unmapped.status = 'mapped';
      unmapped.mapped_campaign_id = campaign.id;
      unmapped.mapped_line_item_id = lineItem.id;
      unmapped.client_id = campaign.client_id;
      unmapped.brand_id = campaign.brand_id;
      unmapped.updated_at = new Date().toISOString();
      saveDoc('unmapped_campaigns', unmapped.id, unmapped).catch(err => console.error('[Firestore] update unmapped error:', err));
    }

    // Link any existing daily metrics matching this platform campaign to this line item
    this.dailyMetrics.forEach(m => {
      if (m.platform_campaign_id === params.platform_campaign_id) {
        m.line_item_id = lineItem.id;
        m.campaign_id = campaign.id;
        m.client_id = campaign.client_id;
        m.brand_id = campaign.brand_id;
      }
    });

    this.addAuditLog({
      agency_id: agencyId,
      user_id: params.user_id || 'user_active',
      user_name: params.user_name || 'Media Planner',
      action: 'LINKED_DATA_SOURCE',
      entity_type: 'line_item',
      entity_id: lineItem.id,
      details: `Connected ${params.platform.toUpperCase()} campaign "${params.platform_campaign_name}" (${params.platform_campaign_id}) to Line Item "${lineItem.name}"`
    });

    return newSource;
  }

  disconnectLineItemDataSource(
    agencyId: string,
    lineItemId: string,
    sourceId: string,
    userId?: string,
    userName?: string
  ): LineItemDataSource {
    const source = this.lineItemDataSources.find(s => s.id === sourceId && s.line_item_id === lineItemId);
    if (!source) throw new Error('Data source mapping not found');

    source.status = 'disconnected';
    source.updated_at = new Date().toISOString();
    saveDoc('line_item_data_sources', source.id, source).catch(err => console.error('[Firestore] disconnect DataSource error:', err));

    const lineItem = this.getLineItemById(agencyId, lineItemId);
    this.addAuditLog({
      agency_id: agencyId,
      user_id: userId || 'user_active',
      user_name: userName || 'Media Planner',
      action: 'DISCONNECTED_DATA_SOURCE',
      entity_type: 'line_item',
      entity_id: lineItemId,
      details: `Disconnected ${source.platform.toUpperCase()} campaign "${source.platform_campaign_name}" (${source.platform_campaign_id}) from Line Item "${lineItem?.name || lineItemId}". Historical metrics preserved.`
    });

    return source;
  }

  deleteLineItemDataSource(
    agencyId: string,
    lineItemId: string,
    sourceId: string,
    userId?: string,
    userName?: string
  ): boolean {
    const idx = this.lineItemDataSources.findIndex(s => s.id === sourceId && s.line_item_id === lineItemId);
    if (idx === -1) return false;

    const [removed] = this.lineItemDataSources.splice(idx, 1);
    deleteDocById('line_item_data_sources', sourceId).catch(err => console.error('[Firestore] delete DataSource error:', err));

    // If it was in unmapped campaigns, restore unmapped status
    const unmapped = this.unmappedCampaigns.find(u => u.platform_campaign_id === removed.platform_campaign_id);
    if (unmapped) {
      unmapped.status = 'unmapped';
      unmapped.mapped_campaign_id = undefined;
      unmapped.mapped_line_item_id = undefined;
      saveDoc('unmapped_campaigns', unmapped.id, unmapped).catch(err => console.error('[Firestore] revert unmapped error:', err));
    }

    const lineItem = this.getLineItemById(agencyId, lineItemId);
    this.addAuditLog({
      agency_id: agencyId,
      user_id: userId || 'user_active',
      user_name: userName || 'Media Planner',
      action: 'UNLINKED_DATA_SOURCE',
      entity_type: 'line_item',
      entity_id: lineItemId,
      details: `Removed data source mapping for ${removed.platform.toUpperCase()} campaign "${removed.platform_campaign_name}" (${removed.platform_campaign_id}) from Line Item "${lineItem?.name || lineItemId}"`
    });

    return true;
  }

  migrateLegacyLineItemDataSources(agencyId?: string): { migratedCount: number; details: string[] } {
    let count = 0;
    const details: string[] = [];
    const itemsToProcess = agencyId ? this.lineItems.filter(l => l.agency_id === agencyId) : this.lineItems;

    for (const li of itemsToProcess) {
      if (li.platform_campaign_id && li.platform_campaign_id.trim() !== '') {
        const legacyDsId = `ds_migrated_${li.id}`;
        const hasExisting = this.lineItemDataSources.some(
          s => s.id === legacyDsId || (s.line_item_id === li.id && s.platform_campaign_id === li.platform_campaign_id && s.status === 'active')
        );
        if (!hasExisting) {
          const acc = this.platformAccounts.find(a => a.account_id === li.platform_account_id);
          const newDs: LineItemDataSource = {
            id: legacyDsId,
            line_item_id: li.id,
            platform: li.platform,
            platform_account_id: li.platform_account_id || 'act_legacy',
            platform_account_name: acc?.account_name || li.platform_account_id,
            platform_campaign_id: li.platform_campaign_id,
            platform_campaign_name: li.name || 'Migrated Campaign',
            connection_id: `conn_legacy_${li.id}`,
            linked_at: li.created_at || new Date().toISOString(),
            linked_by: 'System Legacy Data Migration',
            last_seen_at: new Date().toISOString(),
            status: 'active',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          };
          this.lineItemDataSources.push(newDs);
          saveDoc('line_item_data_sources', newDs.id, newDs).catch(() => {});
          count++;
          details.push(`Migrated line item ${li.name} (${li.id}) -> platform campaign ${li.platform_campaign_id}`);
        }
      }
    }
    console.log(`[Data Migration] Checked legacy line items; migrated ${count} mappings to line_item_data_sources`);
    return { migratedCount: count, details };
  }

  findDataSourceByPlatformCampaign(
    agencyId: string,
    platform: PlatformType,
    platformCampaignId: string
  ): LineItemDataSource | undefined {
    return this.lineItemDataSources.find(
      s => s.platform.toLowerCase() === platform.toLowerCase() &&
           s.platform_campaign_id === platformCampaignId &&
           s.status === 'active'
    );
  }

  ensureLineItemDataSource(
    agencyId: string,
    params: {
      line_item_id: string;
      platform: PlatformType;
      platform_account_id?: string;
      platform_account_name?: string;
      platform_campaign_id: string;
      platform_campaign_name: string;
      linked_by?: string;
    }
  ): LineItemDataSource {
    const existing = this.lineItemDataSources.find(
      s => s.line_item_id === params.line_item_id &&
           s.platform.toLowerCase() === params.platform.toLowerCase() &&
           s.platform_campaign_id === params.platform_campaign_id
    );
    if (existing) {
      existing.status = 'active';
      existing.last_seen_at = new Date().toISOString();
      if (params.platform_account_id && (!existing.platform_account_id || existing.platform_account_id === 'act_auto')) {
        existing.platform_account_id = params.platform_account_id;
      }
      saveDoc('line_item_data_sources', existing.id, existing).catch(() => {});
      return existing;
    }
    const newDs: LineItemDataSource = {
      id: `ds_${params.line_item_id}_${params.platform_campaign_id}_${Date.now()}`,
      line_item_id: params.line_item_id,
      platform: params.platform,
      platform_account_id: params.platform_account_id || 'act_auto',
      platform_account_name: params.platform_account_name || `${params.platform.toUpperCase()} Account`,
      platform_campaign_id: params.platform_campaign_id,
      platform_campaign_name: params.platform_campaign_name,
      connection_id: `conn_${params.line_item_id}`,
      linked_at: new Date().toISOString(),
      linked_by: params.linked_by || 'CSV Ingestion Auto-Link',
      last_seen_at: new Date().toISOString(),
      status: 'active',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    this.lineItemDataSources.push(newDs);
    saveDoc('line_item_data_sources', newDs.id, newDs).catch(() => {});
    return newDs;
  }

  // ==================== DAILY METRICS (Normalized & Deduplicated) ====================
  getDailyMetrics(agencyId: string, lineItemId?: string, campaignId?: string): LineItemDailyMetric[] {
    return this.dailyMetrics.filter(m => {
      if (m.agency_id !== agencyId) return false;
      if (lineItemId && m.line_item_id !== lineItemId) return false;
      if (campaignId && m.campaign_id !== campaignId) return false;
      return true;
    });
  }

  /**
   * Deduplicated upsert of daily metrics:
   * Composite Key: (agency_id, line_item_id, platform_campaign_id, report_date)
   * Prevents duplicate imports from double-counting metrics!
   */
  upsertDailyMetric(metric: Omit<LineItemDailyMetric, 'id' | 'created_at'>): { inserted: boolean; metric: LineItemDailyMetric } {
    const existingIdx = this.dailyMetrics.findIndex(
      m =>
        m.agency_id === metric.agency_id &&
        m.line_item_id === metric.line_item_id &&
        m.platform_campaign_id === metric.platform_campaign_id &&
        m.report_date === metric.report_date
    );

    if (existingIdx >= 0) {
      // Update existing record (overwrite with latest normalized data)
      this.dailyMetrics[existingIdx] = {
        ...this.dailyMetrics[existingIdx],
        ...metric
      };
      saveDoc('daily_metrics', this.dailyMetrics[existingIdx].id, this.dailyMetrics[existingIdx]).catch(err => console.error('[Firestore] upsertDailyMetric update error:', err));
      return { inserted: false, metric: this.dailyMetrics[existingIdx] };
    } else {
      // Insert new metric row
      const newRow: LineItemDailyMetric = {
        ...metric,
        id: `metric_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        created_at: new Date().toISOString()
      };
      this.dailyMetrics.push(newRow);
      saveDoc('daily_metrics', newRow.id, newRow).catch(err => console.error('[Firestore] upsertDailyMetric insert error:', err));
      return { inserted: true, metric: newRow };
    }
  }

  // ==================== ALERTS ====================
  getAlerts(agencyId: string, status?: string): Alert[] {
    return this.alerts.filter(a => {
      if (a.agency_id !== agencyId) return false;
      if (status && a.status !== status) return false;
      return true;
    });
  }

  createAlert(alert: Omit<Alert, 'id' | 'created_at'>): Alert {
    // Avoid duplicate active alert for same line item and alert_type
    if (alert.line_item_id) {
      const existing = this.alerts.find(
        a => a.line_item_id === alert.line_item_id && a.alert_type === alert.alert_type && a.status === 'active'
      );
      if (existing) {
        existing.message = alert.message;
        existing.severity = alert.severity;
        saveDoc('alerts', existing.id, existing).catch(err => console.error('[Firestore] update existing alert error:', err));
        return existing;
      }
    }
    const newAlert: Alert = {
      ...alert,
      id: `alt_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      created_at: new Date().toISOString()
    };
    this.alerts.unshift(newAlert);
    saveDoc('alerts', newAlert.id, newAlert).catch(err => console.error('[Firestore] createAlert error:', err));
    return newAlert;
  }

  updateAlertStatus(agencyId: string, alertId: string, status: 'active' | 'acknowledged' | 'resolved'): Alert | undefined {
    const alert = this.alerts.find(a => a.agency_id === agencyId && a.id === alertId);
    if (!alert) return undefined;
    alert.status = status;
    if (status === 'resolved') {
      alert.resolved_at = new Date().toISOString();
    }
    saveDoc('alerts', alert.id, alert).catch(err => console.error('[Firestore] updateAlertStatus error:', err));
    return alert;
  }

  // ==================== IMPORTS ====================
  getImports(agencyId: string): ImportJob[] {
    return this.imports.filter(i => i.agency_id === agencyId).sort((a, b) => b.started_at.localeCompare(a.started_at));
  }

  createImportJob(job: Omit<ImportJob, 'id' | 'started_at'>): ImportJob {
    const newJob: ImportJob = {
      ...job,
      id: `imp_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      started_at: new Date().toISOString()
    };
    this.imports.unshift(newJob);
    return newJob;
  }

  updateImportJob(id: string, updates: Partial<ImportJob>): ImportJob | undefined {
    const job = this.imports.find(i => i.id === id);
    if (!job) return undefined;
    Object.assign(job, updates);
    return job;
  }

  // ==================== COLUMN MAPPINGS ====================
  getColumnMappings(agencyId: string, platform?: string): ColumnMapping[] {
    return this.columnMappings.filter(m => {
      if (m.agency_id !== agencyId) return false;
      if (platform && m.platform !== platform) return false;
      return true;
    });
  }

  saveColumnMapping(mapping: Omit<ColumnMapping, 'id' | 'created_at'>): ColumnMapping {
    const existing = this.columnMappings.find(
      m => m.agency_id === mapping.agency_id && m.platform === mapping.platform && m.mapping_name === mapping.mapping_name
    );
    if (existing) {
      existing.mappings = mapping.mappings;
      return existing;
    }
    const newMapping: ColumnMapping = {
      ...mapping,
      id: `map_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      created_at: new Date().toISOString()
    };
    this.columnMappings.push(newMapping);
    return newMapping;
  }

  // ==================== DASHBOARD SHARES ====================
  getDashboardShares(agencyId: string): DashboardShare[] {
    return this.dashboardShares.filter(s => s.agency_id === agencyId);
  }

  createDashboardShare(share: Omit<DashboardShare, 'id' | 'share_token' | 'created_at' | 'access_count'>): DashboardShare {
    const token = `sh_${Math.random().toString(36).substring(2, 10)}_${Date.now().toString(36)}`;
    const newShare: DashboardShare = {
      ...share,
      id: `share_${Date.now()}`,
      share_token: token,
      created_at: new Date().toISOString(),
      access_count: 0
    };
    this.dashboardShares.push(newShare);
    return newShare;
  }

  getShareByToken(token: string): DashboardShare | undefined {
    const share = this.dashboardShares.find(s => s.share_token === token);
    if (share) {
      share.access_count += 1;
    }
    return share;
  }

  // ==================== AUDIT LOGS ====================
  addAuditLog(log: Omit<AuditLog, 'id' | 'created_at'>): AuditLog {
    const entry: AuditLog = {
      ...log,
      id: `audit_${Date.now()}`,
      created_at: new Date().toISOString()
    };
    this.auditLogs.unshift(entry);
    return entry;
  }

  getAuditLogs(agencyId?: string): AuditLog[] {
    if (!agencyId) return [...this.auditLogs];
    return this.auditLogs.filter(l => l.agency_id === agencyId);
  }

  // ==================== UNMAPPED CAMPAIGNS ====================
  getUnmappedCampaigns(agencyId: string, status?: string): UnmappedCampaign[] {
    return this.unmappedCampaigns.filter(u => {
      if (u.agency_id !== agencyId) return false;
      if (status && status !== 'all') return u.status === status;
      return true;
    });
  }

  getUnmappedCampaignById(agencyId: string, id: string): UnmappedCampaign | undefined {
    return this.unmappedCampaigns.find(u => u.agency_id === agencyId && u.id === id);
  }

  createUnmappedCampaign(data: Omit<UnmappedCampaign, 'id' | 'created_at' | 'updated_at'>): UnmappedCampaign {
    const newUnmapped: UnmappedCampaign = {
      ...data,
      id: `unmapped_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      status: data.status || 'unmapped',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    this.unmappedCampaigns.unshift(newUnmapped);
    saveDoc('unmapped_campaigns', newUnmapped.id, newUnmapped).catch(err => console.error('[Firestore] createUnmappedCampaign error:', err));
    return newUnmapped;
  }

  updateUnmappedCampaign(agencyId: string, id: string, updates: Partial<UnmappedCampaign>): UnmappedCampaign | undefined {
    const idx = this.unmappedCampaigns.findIndex(u => u.agency_id === agencyId && u.id === id);
    if (idx === -1) return undefined;
    this.unmappedCampaigns[idx] = {
      ...this.unmappedCampaigns[idx],
      ...updates,
      updated_at: new Date().toISOString()
    };
    saveDoc('unmapped_campaigns', id, this.unmappedCampaigns[idx]).catch(err => console.error('[Firestore] updateUnmappedCampaign error:', err));
    return this.unmappedCampaigns[idx];
  }

  deleteUnmappedCampaign(agencyId: string, id: string): boolean {
    const idx = this.unmappedCampaigns.findIndex(u => u.agency_id === agencyId && u.id === id);
    if (idx === -1) return false;
    this.unmappedCampaigns.splice(idx, 1);
    deleteDocById('unmapped_campaigns', id).catch(err => console.error('[Firestore] deleteUnmappedCampaign error:', err));
    return true;
  }

  mapUnmappedCampaign(
    agencyId: string,
    unmappedId: string,
    params: {
      targetCampaignId?: string;
      targetLineItemId?: string;
      newLineItem?: {
        name?: string;
        budget?: number;
        primary_kpi?: any;
        primary_kpi_target?: number;
      };
      newCampaign?: {
        client_id: string;
        brand_id: string;
        name: string;
        objective?: string;
        total_budget?: number;
        start_date?: string;
        end_date?: string;
        currency?: string;
      };
    }
  ): { success: boolean; lineItem: CampaignLineItem; campaign: Campaign; metricsTransferred: number } {
    const unmapped = this.getUnmappedCampaignById(agencyId, unmappedId);
    if (!unmapped) {
      throw new Error(`Unmapped campaign ${unmappedId} not found`);
    }

    let targetCampaign: Campaign | undefined;

    // 1. If user requested creating a brand new campaign
    if (params.newCampaign && params.newCampaign.name) {
      targetCampaign = this.createCampaign({
        agency_id: agencyId,
        client_id: params.newCampaign.client_id,
        brand_id: params.newCampaign.brand_id,
        name: params.newCampaign.name,
        description: `Created from unmapped platform campaign: ${unmapped.platform_campaign_name}`,
        objective: params.newCampaign.objective || unmapped.objective || 'Conversions',
        start_date: params.newCampaign.start_date || unmapped.first_report_date || '2026-09-01',
        end_date: params.newCampaign.end_date || unmapped.last_report_date || '2026-09-30',
        total_budget: Number(params.newCampaign.total_budget) || Math.round(unmapped.total_spend * 1.3),
        currency: params.newCampaign.currency || unmapped.currency || 'LKR',
        status: 'active'
      });
    } else if (params.targetCampaignId) {
      targetCampaign = this.getCampaignById(agencyId, params.targetCampaignId);
    }

    if (!targetCampaign) {
      throw new Error('Target campaign could not be found or created');
    }

    // 2. Identify or create the line item
    let targetLine: CampaignLineItem | undefined;

    if (params.targetLineItemId) {
      targetLine = this.getLineItemById(agencyId, params.targetLineItemId);
      if (targetLine) {
        let changed = false;
        if (unmapped.platform_account_id && (!targetLine.platform_account_id || targetLine.platform_account_id === 'act_default' || targetLine.platform_account_id !== unmapped.platform_account_id)) {
          targetLine.platform_account_id = unmapped.platform_account_id;
          changed = true;
        }
        if (unmapped.platform_campaign_id && (!targetLine.platform_campaign_id || targetLine.platform_campaign_id.startsWith('cid_') || targetLine.platform_campaign_id !== unmapped.platform_campaign_id)) {
          targetLine.platform_campaign_id = unmapped.platform_campaign_id;
          changed = true;
        }
        if (changed) {
          targetLine.updated_at = new Date().toISOString();
          saveDoc('line_items', targetLine.id, targetLine).catch(err => console.error('[Firestore] update line_item platform IDs error:', err));
        }
      }
    }

    if (!targetLine) {
      const lineBudget = params.newLineItem?.budget
        ? Number(params.newLineItem.budget)
        : Math.max(Math.round(unmapped.total_spend * 1.2), targetCampaign.total_budget || 250000);

      targetLine = this.createLineItem({
        agency_id: agencyId,
        campaign_id: targetCampaign.id,
        client_id: targetCampaign.client_id,
        brand_id: targetCampaign.brand_id,
        platform: unmapped.platform,
        platform_account_id: unmapped.platform_account_id || 'act_auto',
        platform_campaign_id: unmapped.platform_campaign_id,
        name: params.newLineItem?.name || `${unmapped.platform.toUpperCase()} - ${unmapped.platform_campaign_name}`,
        objective: unmapped.objective || targetCampaign.objective || 'Conversions',
        start_date: targetCampaign.start_date,
        end_date: targetCampaign.end_date,
        budget: lineBudget,
        currency: targetCampaign.currency || unmapped.currency || 'LKR',
        primary_kpi: params.newLineItem?.primary_kpi || 'cpa',
        primary_kpi_target: Number(params.newLineItem?.primary_kpi_target) || 2500,
        secondary_kpi_targets: {},
        status: 'active',
        pacing_tolerance: 10
      });
    }

    // 3. Transfer daily metrics
    let metricsTransferred = 0;
    if (unmapped.metrics && unmapped.metrics.length > 0) {
      unmapped.metrics.forEach(m => {
        this.upsertDailyMetric({
          agency_id: agencyId,
          client_id: targetCampaign!.client_id,
          brand_id: targetCampaign!.brand_id,
          campaign_id: targetCampaign!.id,
          line_item_id: targetLine!.id,
          platform: unmapped.platform,
          ad_account_id: unmapped.platform_account_id,
          platform_campaign_id: unmapped.platform_campaign_id,
          campaign_name: unmapped.platform_campaign_name,
          report_date: m.report_date,
          currency: unmapped.currency,
          spend: m.spend,
          impressions: m.impressions,
          reach: m.reach,
          clicks: m.clicks,
          conversions: m.conversions,
          conversion_value: m.conversion_value,
          video_views: m.video_views,
          engagements: m.engagements,
          campaign_status: 'active',
          objective: unmapped.objective || targetCampaign!.objective
        });
        metricsTransferred++;
      });
    }

    // 4. Update unmapped campaign status
    unmapped.status = 'mapped';
    unmapped.mapped_campaign_id = targetCampaign.id;
    unmapped.mapped_line_item_id = targetLine.id;
    unmapped.client_id = targetCampaign.client_id;
    unmapped.brand_id = targetCampaign.brand_id;
    unmapped.updated_at = new Date().toISOString();
    saveDoc('unmapped_campaigns', unmapped.id, unmapped).catch(err => console.error('[Firestore] mapUnmappedCampaign error:', err));

    // 5. Recalculate campaign budget
    this.recalculateCampaignBudget(targetCampaign.id);

    // 6. Log audit entry
    this.addAuditLog({
      agency_id: agencyId,
      user_id: 'user_active',
      user_name: 'Agency Media Planner',
      action: 'MAPPED_UNMAPPED_CAMPAIGN',
      entity_type: 'campaign',
      entity_id: targetCampaign.id,
      details: `Mapped unmapped ${unmapped.platform.toUpperCase()} campaign "${unmapped.platform_campaign_name}" (${unmapped.currency} ${unmapped.total_spend.toLocaleString()}) to Campaign "${targetCampaign.name}"`
    });

    return {
      success: true,
      lineItem: targetLine,
      campaign: targetCampaign,
      metricsTransferred
    };
  }

  pullPlatformData(agencyId: string, targetPlatform?: PlatformType): { pulled_count: number; unmapped_count: number; new_unmapped: UnmappedCampaign[] } {
    const platforms: PlatformType[] = targetPlatform ? [targetPlatform] : ['meta', 'tiktok', 'google'];
    const newItems: UnmappedCampaign[] = [];

    const now = new Date();
    const pullDateStr = now.toISOString().split('T')[0];

    const pool = [
      {
        platform: 'meta' as PlatformType,
        account_id: 'act_meta_88219',
        account_name: 'Omni Media Meta Account (ABC)',
        camp_id: `meta_pull_${Date.now().toString().slice(-4)}`,
        name: 'Meta Advantage+ Catalog Sales - Flash Discount',
        spend: 135000,
        impressions: 310000,
        clicks: 6800,
        conversions: 142,
        currency: 'LKR',
        objective: 'Conversions'
      },
      {
        platform: 'tiktok' as PlatformType,
        account_id: 'act_tt_55102',
        account_name: 'TikTok Spark Ads Central',
        camp_id: `tt_pull_${Date.now().toString().slice(-4)}`,
        name: 'TikTok Spark Ads - Influencer Testimonials Batch 2',
        spend: 88500,
        impressions: 540000,
        clicks: 9800,
        conversions: 195,
        currency: 'LKR',
        objective: 'Traffic & Engagement'
      },
      {
        platform: 'google' as PlatformType,
        account_id: 'act_goog_99412',
        account_name: 'Google Ads Search & PMax',
        camp_id: `goog_pull_${Date.now().toString().slice(-4)}`,
        name: 'Google Performance Max - High Intent Audiences',
        spend: 162000,
        impressions: 220000,
        clicks: 5200,
        conversions: 94,
        currency: 'LKR',
        objective: 'Conversions'
      }
    ];

    pool.forEach(item => {
      if (platforms.includes(item.platform)) {
        const metrics = [];
        const days = 7;
        const dailySpend = Math.round(item.spend / days);
        const dailyImpr = Math.round(item.impressions / days);
        const dailyClicks = Math.round(item.clicks / days);
        const dailyConv = Math.round(item.conversions / days);

        for (let d = days; d >= 1; d--) {
          const date = new Date(now);
          date.setDate(date.getDate() - d);
          const dStr = date.toISOString().split('T')[0];
          metrics.push({
            report_date: dStr,
            spend: dailySpend,
            impressions: dailyImpr,
            reach: Math.round(dailyImpr * 0.85),
            clicks: dailyClicks,
            conversions: dailyConv,
            conversion_value: dailyConv * 3200,
            video_views: Math.round(dailyImpr * 0.4),
            engagements: dailyClicks + 120
          });
        }

        const unmapped = this.createUnmappedCampaign({
          agency_id: agencyId,
          platform: item.platform,
          platform_account_id: item.account_id,
          platform_account_name: item.account_name,
          platform_campaign_id: item.camp_id,
          platform_campaign_name: item.name,
          objective: item.objective,
          currency: item.currency,
          total_spend: item.spend,
          total_impressions: item.impressions,
          total_clicks: item.clicks,
          total_conversions: item.conversions,
          total_conversion_value: item.conversions * 3200,
          total_video_views: Math.round(item.impressions * 0.4),
          first_report_date: metrics[0]?.report_date || pullDateStr,
          last_report_date: metrics[metrics.length - 1]?.report_date || pullDateStr,
          row_count: metrics.length,
          status: 'unmapped',
          pulled_at: new Date().toISOString(),
          metrics
        });
        newItems.push(unmapped);
      }
    });

    return {
      pulled_count: newItems.length,
      unmapped_count: this.getUnmappedCampaigns(agencyId, 'unmapped').length,
      new_unmapped: newItems
    };
  }

  // ==================== SEED INITIAL DATA ====================
  private seedCoreTenants() {
    // 1. Agencies
    const agency1: Agency = {
      id: 'agency_omni',
      name: 'OmniDigital Marketing',
      slug: 'omnidigital',
      plan: 'growth',
      status: 'active',
      max_clients: 25,
      max_campaigns: 100,
      contact_email: 'ops@omnidigital.com',
      created_at: '2026-01-10T08:00:00.000Z',
      updated_at: '2026-03-01T08:00:00.000Z'
    };
    const agency2: Agency = {
      id: 'agency_acuity',
      name: 'Acuity Media Labs',
      slug: 'acuity',
      plan: 'boutique',
      status: 'active',
      max_clients: 10,
      max_campaigns: 40,
      contact_email: 'hello@acuitymedia.io',
      created_at: '2026-02-15T09:00:00.000Z',
      updated_at: '2026-02-15T09:00:00.000Z'
    };
    this.agencies.push(agency1, agency2);

    // 2. Users
    this.users.push(
      {
        id: 'user_super',
        email: 'admin@omnitrack.io',
        name: 'Alex Vance (Super Admin)',
        role: 'super_user',
        created_at: '2026-01-01T00:00:00.000Z'
      },
      {
        id: 'user_sarah',
        email: 'sarah@omnidigital.com',
        name: 'Sarah Jenkins (Agency Admin)',
        role: 'agency_admin',
        agency_id: 'agency_omni',
        created_at: '2026-01-10T08:30:00.000Z'
      },
      {
        id: 'user_david',
        email: 'david@omnidigital.com',
        name: 'David Chen (Media Buyer)',
        role: 'agency_member',
        agency_id: 'agency_omni',
        created_at: '2026-01-15T10:00:00.000Z'
      },
      {
        id: 'user_client_abc',
        email: 'nimal@abcholdings.lk',
        name: 'Nimal Perera (ABC Stakeholder)',
        role: 'client_viewer',
        agency_id: 'agency_omni',
        client_id: 'client_abc',
        created_at: '2026-02-01T11:00:00.000Z'
      }
    );

    // 3. Platform Accounts
    this.platformAccounts.push(
      {
        id: 'pa_meta_1',
        agency_id: 'agency_omni',
        platform: 'meta',
        account_name: 'ABC Holdings - Meta Ad Account',
        account_id: 'act_491024810',
        status: 'connected',
        last_synced_at: new Date(Date.now() - 3600000 * 2).toISOString()
      },
      {
        id: 'pa_tiktok_1',
        agency_id: 'agency_omni',
        platform: 'tiktok',
        account_name: 'ABC Holdings - TikTok Ads Business',
        account_id: 'tt_7291840192',
        status: 'connected',
        last_synced_at: new Date(Date.now() - 3600000 * 4).toISOString()
      },
      {
        id: 'pa_meta_apex',
        agency_id: 'agency_omni',
        platform: 'meta',
        account_name: 'Apex Global Ad Account',
        account_id: 'act_991827361',
        status: 'connected',
        last_synced_at: new Date(Date.now() - 3600000 * 12).toISOString()
      }
    );
  }

  seedDemoClientsAndCampaigns() {
    this.isClearedState = false;
    saveDoc('system_metadata', 'app_state', { is_cleared: false, updated_at: new Date().toISOString() }).catch(() => {});

    // 4. Clients
    const clientAbc: Client = {
      id: 'client_abc',
      agency_id: 'agency_omni',
      name: 'ABC Holdings',
      industry: 'Consumer Goods & Retail',
      currency: 'LKR',
      contact_person: 'Nimal Perera',
      contact_email: 'nimal@abcholdings.lk',
      created_at: '2026-01-15T10:00:00.000Z',
      updated_at: '2026-01-15T10:00:00.000Z'
    };
    const clientApex: Client = {
      id: 'client_apex',
      agency_id: 'agency_omni',
      name: 'Apex Retail International',
      industry: 'Apparel & E-commerce',
      currency: 'USD',
      contact_person: 'Elena Rostova',
      contact_email: 'elena@apexretail.com',
      created_at: '2026-02-01T12:00:00.000Z',
      updated_at: '2026-02-01T12:00:00.000Z'
    };
    this.clients.push(clientAbc, clientApex);

    // 5. Brands
    const brandA: Brand = {
      id: 'brand_a',
      agency_id: 'agency_omni',
      client_id: 'client_abc',
      name: 'Brand A',
      description: 'Flagship mainstream beverage & wellness line',
      default_currency: 'LKR',
      default_kpi_targets: {
        cpm: 250,
        ctr: 1.5,
        cpc: 20
      },
      created_at: '2026-01-16T10:00:00.000Z',
      updated_at: '2026-01-16T10:00:00.000Z'
    };
    const brandB: Brand = {
      id: 'brand_b',
      agency_id: 'agency_omni',
      client_id: 'client_abc',
      name: 'Brand B (Luxury Organic)',
      description: 'Artisanal organic skincare and premium boutique line',
      default_currency: 'LKR',
      default_kpi_targets: {
        cpm: 320,
        cpa: 1500
      },
      created_at: '2026-01-18T10:00:00.000Z',
      updated_at: '2026-01-18T10:00:00.000Z'
    };
    const brandApexActive: Brand = {
      id: 'brand_apex_active',
      agency_id: 'agency_omni',
      client_id: 'client_apex',
      name: 'Apex Active Performance',
      description: 'High-performance sportswear for athletes',
      default_currency: 'USD',
      created_at: '2026-02-05T10:00:00.000Z',
      updated_at: '2026-02-05T10:00:00.000Z'
    };
    this.brands.push(brandA, brandB, brandApexActive);

    // 6. Business Campaigns
    // Example from PRD:
    // Business Campaign: New Product Launch (Total Budget LKR 1,050,000)
    const campProductLaunch: Campaign = {
      id: 'camp_product_launch',
      agency_id: 'agency_omni',
      client_id: 'client_abc',
      brand_id: 'brand_a',
      name: 'New Product Launch Q1',
      description: 'Multi-platform launch of Brand A summer line across Meta and TikTok',
      objective: 'Awareness & Consideration',
      start_date: '2026-08-20',
      end_date: '2026-09-20', // 31 days total
      total_budget: 1050000,
      currency: 'LKR',
      status: 'active',
      created_at: '2026-08-18T10:00:00.000Z',
      updated_at: '2026-09-08T10:00:00.000Z'
    };

    const campPromo: Campaign = {
      id: 'camp_promo_midyear',
      agency_id: 'agency_omni',
      client_id: 'client_abc',
      brand_id: 'brand_a',
      name: 'Brand A Mid-Year Flash Promo',
      description: 'Direct response flash sale discount voucher campaign',
      objective: 'Conversions',
      start_date: '2026-09-01',
      end_date: '2026-09-15',
      total_budget: 450000,
      currency: 'LKR',
      status: 'active',
      created_at: '2026-08-28T10:00:00.000Z',
      updated_at: '2026-09-08T10:00:00.000Z'
    };

    const campApexFall: Campaign = {
      id: 'camp_apex_fall',
      agency_id: 'agency_omni',
      client_id: 'client_apex',
      brand_id: 'brand_apex_active',
      name: 'Fall Activewear Campaign',
      description: 'North American e-commerce acquisition push',
      objective: 'Conversions & Sales',
      start_date: '2026-09-01',
      end_date: '2026-09-30',
      total_budget: 25000,
      currency: 'USD',
      status: 'active',
      created_at: '2026-08-30T10:00:00.000Z',
      updated_at: '2026-09-08T10:00:00.000Z'
    };
    this.campaigns.push(campProductLaunch, campPromo, campApexFall);

    // 7. Campaign Line Items
    // Exact line items from PRD Section 3 & 8.3:
    // 1. Meta Awareness: Budget LKR 500,000, CPM target LKR 250, Actual CPM ~245 (-2% variance, Green)
    // 2. Meta Engagement: Budget LKR 250,000, CPE target LKR 5, Actual CPE ~7.20 (+44% variance, Amber)
    // 3. TikTok Awareness: Budget LKR 300,000, CPM target LKR 200, Under-delivering / severe pacing variance, Red
    const lineMetaAwareness: CampaignLineItem = {
      id: 'line_meta_awareness',
      campaign_id: 'camp_product_launch',
      agency_id: 'agency_omni',
      client_id: 'client_abc',
      brand_id: 'brand_a',
      platform: 'meta',
      platform_account_id: 'act_491024810',
      platform_campaign_id: '23849102401',
      name: 'Meta Awareness',
      objective: 'Reach & Brand Awareness',
      start_date: '2026-08-20',
      end_date: '2026-09-20',
      budget: 500000,
      currency: 'LKR',
      primary_kpi: 'cpm',
      primary_kpi_target: 250,
      secondary_kpi_targets: {
        ctr: 1.2
      },
      status: 'active',
      pacing_tolerance: 15,
      created_at: '2026-08-18T10:00:00.000Z',
      updated_at: '2026-09-08T12:00:00.000Z'
    };

    const lineMetaEngagement: CampaignLineItem = {
      id: 'line_meta_engagement',
      campaign_id: 'camp_product_launch',
      agency_id: 'agency_omni',
      client_id: 'client_abc',
      brand_id: 'brand_a',
      platform: 'meta',
      platform_account_id: 'act_491024810',
      platform_campaign_id: '23849102402',
      name: 'Meta Engagement',
      objective: 'Post Engagement & Video Reels',
      start_date: '2026-08-20',
      end_date: '2026-09-20',
      budget: 250000,
      currency: 'LKR',
      primary_kpi: 'cpe',
      primary_kpi_target: 5.0,
      secondary_kpi_targets: {
        cpc: 25
      },
      status: 'active',
      pacing_tolerance: 15,
      created_at: '2026-08-18T10:00:00.000Z',
      updated_at: '2026-09-08T12:00:00.000Z'
    };

    const lineTikTokAwareness: CampaignLineItem = {
      id: 'line_tiktok_awareness',
      campaign_id: 'camp_product_launch',
      agency_id: 'agency_omni',
      client_id: 'client_abc',
      brand_id: 'brand_a',
      platform: 'tiktok',
      platform_account_id: 'tt_7291840192',
      platform_campaign_id: '7291840192001',
      name: 'TikTok Awareness',
      objective: 'In-Feed Video Reach',
      start_date: '2026-08-20',
      end_date: '2026-09-20',
      budget: 300000,
      currency: 'LKR',
      primary_kpi: 'cpm',
      primary_kpi_target: 200,
      secondary_kpi_targets: {
        video_views: 1200000
      },
      status: 'active',
      pacing_tolerance: 15,
      created_at: '2026-08-18T10:00:00.000Z',
      updated_at: '2026-09-08T12:00:00.000Z'
    };

    const linePromoTraffic: CampaignLineItem = {
      id: 'line_promo_traffic',
      campaign_id: 'camp_promo_midyear',
      agency_id: 'agency_omni',
      client_id: 'client_abc',
      brand_id: 'brand_a',
      platform: 'meta',
      platform_account_id: 'act_491024810',
      platform_campaign_id: '23849102403',
      name: 'Meta Flash Promo Conversions',
      objective: 'Web Conversions',
      start_date: '2026-09-01',
      end_date: '2026-09-15',
      budget: 450000,
      currency: 'LKR',
      primary_kpi: 'cpa',
      primary_kpi_target: 450,
      status: 'active',
      pacing_tolerance: 15,
      created_at: '2026-08-28T10:00:00.000Z',
      updated_at: '2026-09-08T12:00:00.000Z'
    };

    const lineApexMeta: CampaignLineItem = {
      id: 'line_apex_meta',
      campaign_id: 'camp_apex_fall',
      agency_id: 'agency_omni',
      client_id: 'client_apex',
      brand_id: 'brand_apex_active',
      platform: 'meta',
      platform_account_id: 'act_991827361',
      platform_campaign_id: '991827361001',
      name: 'Meta Catalog Sales',
      objective: 'ROAS & Purchases',
      start_date: '2026-09-01',
      end_date: '2026-09-30',
      budget: 25000,
      currency: 'USD',
      primary_kpi: 'roas',
      primary_kpi_target: 3.5,
      status: 'active',
      pacing_tolerance: 15,
      created_at: '2026-08-30T10:00:00.000Z',
      updated_at: '2026-09-08T12:00:00.000Z'
    };

    this.lineItems.push(lineMetaAwareness, lineMetaEngagement, lineTikTokAwareness, linePromoTraffic, lineApexMeta);

    // Seed initial Line Item Data Sources:
    // Meta Awareness and Meta Engagement are Connected.
    // TikTok Awareness is intentionally Not Connected to demonstrate the [ Connect Data Source ] workflow!
    this.lineItemDataSources.push(
      {
        id: 'ds_meta_aw_1',
        line_item_id: 'line_meta_awareness',
        platform: 'meta',
        platform_account_id: 'act_491024810',
        platform_account_name: 'ABC Holdings - Meta Ad Account',
        platform_campaign_id: '23849102401',
        platform_campaign_name: 'New Product Launch | Awareness & Reach',
        connection_id: 'conn_meta_act_491024810',
        linked_at: '2026-08-18T10:00:00.000Z',
        linked_by: 'Sarah Jenkins (Media Planner)',
        last_seen_at: '2026-09-08T12:00:00.000Z',
        status: 'active',
        created_at: '2026-08-18T10:00:00.000Z',
        updated_at: '2026-09-08T12:00:00.000Z'
      },
      {
        id: 'ds_meta_eng_1',
        line_item_id: 'line_meta_engagement',
        platform: 'meta',
        platform_account_id: 'act_491024810',
        platform_account_name: 'ABC Holdings - Meta Ad Account',
        platform_campaign_id: '23849102402',
        platform_campaign_name: 'New Product Launch | Engagement & Reels',
        connection_id: 'conn_meta_act_491024810',
        linked_at: '2026-08-18T10:00:00.000Z',
        linked_by: 'Sarah Jenkins (Media Planner)',
        last_seen_at: '2026-09-08T12:00:00.000Z',
        status: 'active',
        created_at: '2026-08-18T10:00:00.000Z',
        updated_at: '2026-09-08T12:00:00.000Z'
      }
    );

    // 8. Daily Metrics Seed for the 20 days (from 2026-08-20 to 2026-09-08)
    // Date loop for 20 days
    const dates: string[] = [];
    for (let d = 20; d <= 31; d++) {
      dates.push(`2026-08-${d.toString().padStart(2, '0')}`);
    }
    for (let d = 1; d <= 8; d++) {
      dates.push(`2026-09-${d.toString().padStart(2, '0')}`);
    }

    // Line 1: Meta Awareness
    // Target: Total spend ~320,000 across 20 days (avg 16,000/day)
    // Total impressions ~ 1,306,122 => CPM = 320,000 / 1,306,122 * 1000 = 245 LKR (Target: 250 -> -2% variance, Green!)
    dates.forEach((date, i) => {
      const dailySpend = 15500 + (i % 4) * 350;
      const cpm = 243 + (i % 5);
      const impressions = Math.round((dailySpend / cpm) * 1000);
      const clicks = Math.round(impressions * 0.014); // CTR ~1.4%
      this.dailyMetrics.push({
        id: `metric_m_aw_${i}`,
        agency_id: 'agency_omni',
        client_id: 'client_abc',
        brand_id: 'brand_a',
        campaign_id: 'camp_product_launch',
        line_item_id: 'line_meta_awareness',
        platform: 'meta',
        ad_account_id: 'act_491024810',
        platform_campaign_id: '23849102401',
        campaign_name: 'BrandA_Launch_Meta_Awareness',
        report_date: date,
        currency: 'LKR',
        spend: dailySpend,
        impressions,
        reach: Math.round(impressions * 0.82),
        clicks,
        conversions: Math.round(clicks * 0.03),
        conversion_value: 0,
        video_views: Math.round(impressions * 0.45),
        engagements: Math.round(clicks * 2.2),
        campaign_status: 'ACTIVE',
        objective: 'BRAND_AWARENESS',
        created_at: '2026-09-08T12:00:00.000Z'
      });
    });

    // Line 2: Meta Engagement
    // Target: Total spend ~180,000 across 20 days (avg 9,000/day)
    // Engagements ~ 25,000 => CPE = 180,000 / 25,000 = 7.20 LKR (Target: 5.0 -> +44% variance, Amber!)
    dates.forEach((date, i) => {
      const dailySpend = 8800 + (i % 3) * 300;
      const engagements = Math.round(dailySpend / 7.20);
      const impressions = engagements * 12;
      const clicks = Math.round(impressions * 0.021);
      this.dailyMetrics.push({
        id: `metric_m_eng_${i}`,
        agency_id: 'agency_omni',
        client_id: 'client_abc',
        brand_id: 'brand_a',
        campaign_id: 'camp_product_launch',
        line_item_id: 'line_meta_engagement',
        platform: 'meta',
        ad_account_id: 'act_491024810',
        platform_campaign_id: '23849102402',
        campaign_name: 'BrandA_Launch_Meta_Engagement',
        report_date: date,
        currency: 'LKR',
        spend: dailySpend,
        impressions,
        reach: Math.round(impressions * 0.85),
        clicks,
        conversions: 0,
        conversion_value: 0,
        video_views: Math.round(impressions * 0.65),
        engagements,
        campaign_status: 'ACTIVE',
        objective: 'POST_ENGAGEMENT',
        created_at: '2026-09-08T12:00:00.000Z'
      });
    });

    // Line 3: TikTok Awareness
    // Budget 300,000. Scheduled 20 of 31 days elapsed => Expected Spend = 300,000 * (20/31) = 193,548 LKR.
    // Actual spend = 120,000 LKR (avg 6,000/day) => Pacing = 120,000 / 193,548 = 62% (Severely underspending, Red!)
    dates.forEach((date, i) => {
      const dailySpend = 5800 + (i % 5) * 100;
      const cpm = 205;
      const impressions = Math.round((dailySpend / cpm) * 1000);
      const clicks = Math.round(impressions * 0.009);
      this.dailyMetrics.push({
        id: `metric_tt_aw_${i}`,
        agency_id: 'agency_omni',
        client_id: 'client_abc',
        brand_id: 'brand_a',
        campaign_id: 'camp_product_launch',
        line_item_id: 'line_tiktok_awareness',
        platform: 'tiktok',
        ad_account_id: 'tt_7291840192',
        platform_campaign_id: '7291840192001',
        campaign_name: 'BrandA_Launch_TikTok_Awareness',
        report_date: date,
        currency: 'LKR',
        spend: dailySpend,
        impressions,
        reach: Math.round(impressions * 0.9),
        clicks,
        conversions: 0,
        conversion_value: 0,
        video_views: Math.round(impressions * 0.75),
        engagements: Math.round(clicks * 1.8),
        campaign_status: 'ACTIVE',
        objective: 'REACH',
        created_at: '2026-09-08T12:00:00.000Z'
      });
    });

    // Recent 8 days for Line Promo Traffic (Sep 1 to Sep 8)
    const promoDates = dates.slice(12);
    promoDates.forEach((date, i) => {
      const dailySpend = 28000 + (i % 4) * 800;
      const impressions = Math.round(dailySpend / 0.38);
      const clicks = Math.round(impressions * 0.024);
      const conversions = Math.round(dailySpend / 430); // CPA ~430 LKR (Target: 450, on track)
      this.dailyMetrics.push({
        id: `metric_promo_${i}`,
        agency_id: 'agency_omni',
        client_id: 'client_abc',
        brand_id: 'brand_a',
        campaign_id: 'camp_promo_midyear',
        line_item_id: 'line_promo_traffic',
        platform: 'meta',
        ad_account_id: 'act_491024810',
        platform_campaign_id: '23849102403',
        campaign_name: 'BrandA_FlashPromo_Meta_Conv',
        report_date: date,
        currency: 'LKR',
        spend: dailySpend,
        impressions,
        reach: Math.round(impressions * 0.78),
        clicks,
        conversions,
        conversion_value: conversions * 1850,
        video_views: 0,
        engagements: clicks,
        campaign_status: 'ACTIVE',
        objective: 'CONVERSIONS',
        created_at: '2026-09-08T12:00:00.000Z'
      });
    });

    // Apex Fall metrics (USD)
    promoDates.forEach((date, i) => {
      const dailySpend = 750 + (i % 3) * 40;
      const impressions = Math.round(dailySpend / 0.012);
      const clicks = Math.round(impressions * 0.018);
      const conversions = Math.round(clicks * 0.042);
      const conversion_value = dailySpend * 3.8; // ROAS ~3.8
      this.dailyMetrics.push({
        id: `metric_apex_${i}`,
        agency_id: 'agency_omni',
        client_id: 'client_apex',
        brand_id: 'brand_apex_active',
        campaign_id: 'camp_apex_fall',
        line_item_id: 'line_apex_meta',
        platform: 'meta',
        ad_account_id: 'act_991827361',
        platform_campaign_id: '991827361001',
        campaign_name: 'Apex_Catalog_Sales_Meta',
        report_date: date,
        currency: 'USD',
        spend: dailySpend,
        impressions,
        reach: Math.round(impressions * 0.88),
        clicks,
        conversions,
        conversion_value,
        video_views: Math.round(impressions * 0.3),
        engagements: clicks * 2,
        campaign_status: 'ACTIVE',
        objective: 'PRODUCT_CATALOG_SALES',
        created_at: '2026-09-08T12:00:00.000Z'
      });
    });

    // 9. Initial Alerts
    this.alerts.push(
      {
        id: 'alt_tt_underspend',
        agency_id: 'agency_omni',
        client_id: 'client_abc',
        brand_id: 'brand_a',
        campaign_id: 'camp_product_launch',
        line_item_id: 'line_tiktok_awareness',
        platform: 'tiktok',
        alert_type: 'underspending',
        severity: 'red',
        title: 'Severe Under-Delivery (62% pacing)',
        message: 'TikTok Awareness has spent LKR 120,000 vs expected LKR 193,548 to date. Projected final budget utilization is only 62%.',
        status: 'active',
        created_at: '2026-09-08T06:00:00.000Z'
      },
      {
        id: 'alt_meta_cpe',
        agency_id: 'agency_omni',
        client_id: 'client_abc',
        brand_id: 'brand_a',
        campaign_id: 'camp_product_launch',
        line_item_id: 'line_meta_engagement',
        platform: 'meta',
        alert_type: 'cpm_above_target',
        severity: 'amber',
        title: 'CPE +44% Above Target',
        message: 'Meta Engagement actual CPE is LKR 7.20 against target LKR 5.00 (+44% variance deterioration).',
        status: 'active',
        created_at: '2026-09-07T14:30:00.000Z'
      }
    );

    // 10. Default Column Mappings for Meta and TikTok
    this.columnMappings.push(
      {
        id: 'map_meta_default',
        agency_id: 'agency_omni',
        platform: 'meta',
        mapping_name: 'Meta Ads Manager Standard Export',
        mappings: {
          report_date: 'Day',
          platform_campaign_id: 'Campaign ID',
          campaign_name: 'Campaign Name',
          ad_account_id: 'Account ID',
          spend: 'Amount Spent (LKR)',
          impressions: 'Impressions',
          reach: 'Reach',
          clicks: 'Link Clicks',
          conversions: 'Purchases',
          conversion_value: 'Purchases Conversion Value',
          video_views: '3-Second Video Plays',
          campaign_status: 'Campaign Delivery'
        },
        created_at: '2026-01-20T10:00:00.000Z'
      },
      {
        id: 'map_tiktok_default',
        agency_id: 'agency_omni',
        platform: 'tiktok',
        mapping_name: 'TikTok Ads Manager Export',
        mappings: {
          report_date: 'Date',
          platform_campaign_id: 'Campaign ID',
          campaign_name: 'Campaign name',
          ad_account_id: 'Ad account ID',
          spend: 'Cost',
          impressions: 'Impressions',
          reach: 'Reach',
          clicks: 'Clicks',
          conversions: 'Conversions',
          video_views: 'Video Views',
          campaign_status: 'Status'
        },
        created_at: '2026-01-20T10:00:00.000Z'
      }
    );

    // 11. Initial Share Token for ABC Holdings
    this.dashboardShares.push({
      id: 'share_abc_exec',
      agency_id: 'agency_omni',
      client_id: 'client_abc',
      brand_id: 'brand_a',
      campaign_id: 'camp_product_launch',
      title: 'ABC Holdings Brand A Summer Launch Client Portal',
      share_token: 'sh_abc_launch_2026',
      recipient_email: 'nimal@abcholdings.lk',
      created_at: '2026-08-25T10:00:00.000Z',
      access_count: 14
    });

    // 12. Audit Logs
    this.auditLogs.push(
      {
        id: 'log_1',
        agency_id: 'agency_omni',
        user_id: 'user_sarah',
        user_name: 'Sarah Jenkins',
        action: 'CREATED_CAMPAIGN',
        entity_type: 'campaign',
        entity_id: 'camp_product_launch',
        details: 'Created campaign New Product Launch Q1 with total budget LKR 1,050,000',
        created_at: '2026-08-18T10:00:00.000Z'
      },
      {
        id: 'log_2',
        agency_id: 'agency_omni',
        user_id: 'user_sarah',
        user_name: 'Sarah Jenkins',
        action: 'IMPORTED_METRICS',
        entity_type: 'import',
        entity_id: 'imp_initial',
        details: 'Imported 60 daily metrics rows across Meta and TikTok ad accounts',
        created_at: '2026-09-08T12:00:00.000Z'
      }
    );

    // 13. Seed Unmapped Campaigns (Pulled from Meta, TikTok & Google)
    this.unmappedCampaigns.push(
      {
        id: 'unmapped_meta_clearance',
        agency_id: 'agency_omni',
        client_id: 'client_abc',
        brand_id: 'brand_a',
        client_name: 'ABC Holdings',
        brand_name: 'Brand A Beverage',
        platform: 'meta',
        platform_account_id: 'act_meta_88219',
        platform_account_name: 'ABC Holdings Meta Ads Account',
        platform_campaign_id: 'meta_camp_8892147',
        platform_campaign_name: 'Summer Clearance - Retargeting Catalog',
        objective: 'Conversions',
        currency: 'LKR',
        total_spend: 184500,
        total_impressions: 420000,
        total_clicks: 8400,
        total_conversions: 168,
        total_conversion_value: 588000,
        total_video_views: 145000,
        first_report_date: '2026-09-01',
        last_report_date: '2026-09-08',
        row_count: 8,
        status: 'unmapped',
        pulled_at: '2026-09-09T05:30:00.000Z',
        created_at: '2026-09-09T05:30:00.000Z',
        updated_at: '2026-09-09T05:30:00.000Z',
        metrics: [
          { report_date: '2026-09-01', spend: 22000, impressions: 51000, reach: 43000, clicks: 1020, conversions: 21, conversion_value: 73500, video_views: 17500, engagements: 1140 },
          { report_date: '2026-09-02', spend: 23500, impressions: 54000, reach: 45000, clicks: 1080, conversions: 22, conversion_value: 77000, video_views: 18400, engagements: 1200 },
          { report_date: '2026-09-03', spend: 21000, impressions: 48000, reach: 41000, clicks: 960, conversions: 19, conversion_value: 66500, video_views: 16800, engagements: 1070 },
          { report_date: '2026-09-04', spend: 24000, impressions: 55000, reach: 46000, clicks: 1100, conversions: 23, conversion_value: 80500, video_views: 19200, engagements: 1230 },
          { report_date: '2026-09-05', spend: 25000, impressions: 57000, reach: 48000, clicks: 1150, conversions: 24, conversion_value: 84000, video_views: 20100, engagements: 1280 },
          { report_date: '2026-09-06', spend: 22500, impressions: 51000, reach: 43000, clicks: 1010, conversions: 20, conversion_value: 70000, video_views: 17600, engagements: 1130 },
          { report_date: '2026-09-07', spend: 23000, impressions: 52000, reach: 44000, clicks: 1040, conversions: 20, conversion_value: 70000, video_views: 18000, engagements: 1160 },
          { report_date: '2026-09-08', spend: 23500, impressions: 52000, reach: 44000, clicks: 1040, conversions: 19, conversion_value: 66500, video_views: 17400, engagements: 1150 }
        ]
      },
      {
        id: 'unmapped_tt_viral',
        agency_id: 'agency_omni',
        client_id: 'client_abc',
        brand_id: 'brand_a',
        client_name: 'ABC Holdings',
        brand_name: 'Brand A Beverage',
        platform: 'tiktok',
        platform_account_id: 'act_tt_55102',
        platform_account_name: 'TikTok Spark Ads Central',
        platform_campaign_id: 'tt_camp_viral_hooks_sep',
        platform_campaign_name: 'TT_Viral_Hook_Creators_Sep26',
        objective: 'Traffic & Consideration',
        currency: 'LKR',
        total_spend: 92000,
        total_impressions: 610000,
        total_clicks: 12300,
        total_conversions: 240,
        total_conversion_value: 480000,
        total_video_views: 380000,
        first_report_date: '2026-09-02',
        last_report_date: '2026-09-08',
        row_count: 7,
        status: 'unmapped',
        pulled_at: '2026-09-09T06:15:00.000Z',
        created_at: '2026-09-09T06:15:00.000Z',
        updated_at: '2026-09-09T06:15:00.000Z',
        metrics: [
          { report_date: '2026-09-02', spend: 12500, impressions: 82000, reach: 70000, clicks: 1650, conversions: 32, conversion_value: 64000, video_views: 52000, engagements: 1820 },
          { report_date: '2026-09-03', spend: 13000, impressions: 86000, reach: 73000, clicks: 1740, conversions: 35, conversion_value: 70000, video_views: 54000, engagements: 1910 },
          { report_date: '2026-09-04', spend: 13200, impressions: 88000, reach: 75000, clicks: 1780, conversions: 34, conversion_value: 68000, video_views: 55000, engagements: 1950 },
          { report_date: '2026-09-05', spend: 13500, impressions: 90000, reach: 77000, clicks: 1820, conversions: 36, conversion_value: 72000, video_views: 56000, engagements: 2010 },
          { report_date: '2026-09-06', spend: 13100, impressions: 87000, reach: 74000, clicks: 1760, conversions: 34, conversion_value: 68000, video_views: 54000, engagements: 1930 },
          { report_date: '2026-09-07', spend: 13300, impressions: 88000, reach: 75000, clicks: 1770, conversions: 34, conversion_value: 68000, video_views: 54000, engagements: 1950 },
          { report_date: '2026-09-08', spend: 13400, impressions: 89000, reach: 76000, clicks: 1780, conversions: 35, conversion_value: 70000, video_views: 55000, engagements: 1960 }
        ]
      },
      {
        id: 'unmapped_goog_festive',
        agency_id: 'agency_omni',
        client_id: 'client_apex',
        brand_id: 'brand_apex_active',
        client_name: 'Apex Global',
        brand_name: 'Apex Active Performance',
        platform: 'google',
        platform_account_id: 'act_goog_99412',
        platform_account_name: 'Google Ads Search & PMax',
        platform_campaign_id: 'goog_camp_festive_deal',
        platform_campaign_name: 'Search - Festive Deals & Brand Terms',
        objective: 'Conversions',
        currency: 'LKR',
        total_spend: 145000,
        total_impressions: 290000,
        total_clicks: 5100,
        total_conversions: 115,
        total_conversion_value: 460000,
        total_video_views: 22000,
        first_report_date: '2026-09-01',
        last_report_date: '2026-09-08',
        row_count: 8,
        status: 'unmapped',
        pulled_at: '2026-09-09T04:45:00.000Z',
        created_at: '2026-09-09T04:45:00.000Z',
        updated_at: '2026-09-09T04:45:00.000Z',
        metrics: [
          { report_date: '2026-09-01', spend: 17500, impressions: 35000, reach: 29000, clicks: 610, conversions: 14, conversion_value: 56000, video_views: 2600, engagements: 640 },
          { report_date: '2026-09-02', spend: 18000, impressions: 36000, reach: 30000, clicks: 630, conversions: 15, conversion_value: 60000, video_views: 2700, engagements: 660 },
          { report_date: '2026-09-03', spend: 17800, impressions: 35500, reach: 29500, clicks: 620, conversions: 14, conversion_value: 56000, video_views: 2650, engagements: 650 },
          { report_date: '2026-09-04', spend: 18500, impressions: 37000, reach: 31000, clicks: 650, conversions: 15, conversion_value: 60000, video_views: 2800, engagements: 680 },
          { report_date: '2026-09-05', spend: 19000, impressions: 38000, reach: 32000, clicks: 670, conversions: 16, conversion_value: 64000, video_views: 2900, engagements: 700 },
          { report_date: '2026-09-06', spend: 18000, impressions: 36000, reach: 30000, clicks: 640, conversions: 14, conversion_value: 56000, video_views: 2700, engagements: 670 },
          { report_date: '2026-09-07', spend: 18100, impressions: 36200, reach: 30200, clicks: 640, conversions: 13, conversion_value: 52000, video_views: 2800, engagements: 670 },
          { report_date: '2026-09-08', spend: 18100, impressions: 36300, reach: 30300, clicks: 640, conversions: 14, conversion_value: 56000, video_views: 2850, engagements: 670 }
        ]
      }
    );
  }
}

export const db = new RelationalDatabase();
