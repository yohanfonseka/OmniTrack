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
  KpiMetricType,
  LineItemDataSource
} from './types.js';
import {
  fetchCollection,
  saveDoc,
  deleteDocById,
  batchSaveDocs,
  clearCollection,
  getFirestoreConnectionInfo
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
        fsDataSources,
        fsUsers
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
        fetchCollection<LineItemDataSource>('line_item_data_sources'),
        fetchCollection<User>('users')
      ]);

      // `is_cleared` used to blank everything hydrated here. It could not tell
      // "cleared" from "cleared, then re-imported", so any data created after a
      // wipe was silently dropped on the next restart - and only the demo
      // re-seed ever reset it. A wipe already deletes the documents, so an empty
      // Firestore hydrates empty on its own and the flag bought nothing.
      const appState = fsMeta.find(m => m.id === 'app_state');
      if (appState?.is_cleared) {
        console.log('[Firestore Database] Ignoring stale is_cleared flag; hydrating whatever documents exist.');
      }

      console.log(`[Firestore Hydration] Fetched: ${fsAgencies.length} agencies, ${fsClients.length} clients, ${fsBrands.length} brands, ${fsCampaigns.length} campaigns, ${fsLineItems.length} line items, ${fsDataSources.length} data sources, ${fsUnmapped.length} unmapped`);

      // Accounts are merged regardless of the cleared-data flag: wiping campaign
      // data must never remove the users who can sign in.
      fsUsers.forEach(fu => {
        const idx = this.users.findIndex(u => u.id === fu.id);
        if (idx !== -1) this.users[idx] = fu;
        else this.users.push(fu);
      });

      // 1. Merge Agencies
      if (fsAgencies.length > 0) {
        fsAgencies.forEach(fa => {
          const idx = this.agencies.findIndex(a => a.id === fa.id);
          if (idx !== -1) this.agencies[idx] = fa;
          else this.agencies.push(fa);
        });
      }

      // Reflect Firestore documents directly - it is the record of what exists.
      this.clients = [...fsClients];
      this.brands = [...fsBrands];
      this.campaigns = [...fsCampaigns];
      this.lineItems = [...fsLineItems];
      this.dailyMetrics = [...fsMetrics];
      this.alerts = [...fsAlerts];
      // Retain all unmapped campaigns including mapped ones so they can be viewed and unlinked
      this.unmappedCampaigns = [...fsUnmapped];
      this.lineItemDataSources = [...fsDataSources];

      // Run legacy line item migration if any legacy fields exist without line_item_data_sources
      this.migrateLegacyLineItemDataSources();

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
    // Recorded for audit only; hydration no longer reads it.
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

  /**
   * Clear all ingested platform data:
   * - Unmapped campaigns
   * - Daily metrics
   * - Line item data sources (linked platform campaign mappings)
   * - Reset platform link attributes on line items (platform_campaign_id, platform_account_id, current_spend)
   * - Recalculate campaign budgets
   */
  async clearPlatformData(agencyId?: string): Promise<{
    success: boolean;
    unmappedCleared: number;
    metricsCleared: number;
    dataSourcesCleared: number;
  }> {
    const agencyLineItemIds = agencyId 
      ? new Set(this.lineItems.filter(l => l.agency_id === agencyId).map(l => l.id))
      : null;

    const unmappedCount = agencyId 
      ? this.unmappedCampaigns.filter(u => u.agency_id === agencyId).length 
      : this.unmappedCampaigns.length;
    const metricsCount = agencyId
      ? this.dailyMetrics.filter(m => m.agency_id === agencyId).length
      : this.dailyMetrics.length;
    const dataSourcesCount = agencyLineItemIds
      ? this.lineItemDataSources.filter(ds => agencyLineItemIds.has(ds.line_item_id)).length
      : this.lineItemDataSources.length;

    if (agencyId && agencyLineItemIds) {
      this.unmappedCampaigns = this.unmappedCampaigns.filter(u => u.agency_id !== agencyId);
      this.dailyMetrics = this.dailyMetrics.filter(m => m.agency_id !== agencyId);
      this.lineItemDataSources = this.lineItemDataSources.filter(ds => !agencyLineItemIds.has(ds.line_item_id));

      for (const li of this.lineItems) {
        if (li.agency_id === agencyId) {
          delete (li as any).platform_campaign_id;
          delete (li as any).platform_account_id;
          saveDoc('line_items', li.id, li).catch(() => {});
        }
      }
      for (const c of this.campaigns) {
        if (c.agency_id === agencyId) {
          this.recalculateCampaignBudget(c.id);
        }
      }
    } else {
      this.unmappedCampaigns = [];
      this.dailyMetrics = [];
      this.lineItemDataSources = [];
      for (const li of this.lineItems) {
        delete (li as any).platform_campaign_id;
        delete (li as any).platform_account_id;
        saveDoc('line_items', li.id, li).catch(() => {});
      }
      for (const c of this.campaigns) {
        this.recalculateCampaignBudget(c.id);
      }
    }

    // Clear platform data collections in Firestore
    try {
      await Promise.all([
        clearCollection('unmapped_campaigns'),
        clearCollection('daily_metrics'),
        clearCollection('line_item_data_sources')
      ]);
    } catch (err) {
      console.error('[Clear Platform Data] Firestore clear error:', err);
    }

    console.log(`[Firestore Database] Platform data cleared successfully: ${unmappedCount} unmapped, ${metricsCount} metrics, ${dataSourcesCount} data sources.`);
    return {
      success: true,
      unmappedCleared: unmappedCount,
      metricsCleared: metricsCount,
      dataSourcesCleared: dataSourcesCount
    };
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

  getUserByEmail(email: string): User | undefined {
    const normalized = (email || '').trim().toLowerCase();
    return this.users.find(u => (u.email || '').trim().toLowerCase() === normalized);
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

  /**
   * Accounts must outlive the process, or a restart locks everyone out, so
   * callers that create accounts await this and surface a failure rather than
   * reporting success for a user that only exists in memory.
   */
  persistUser(user: User): Promise<boolean> {
    return saveDoc('users', user.id, user).catch(err => {
      console.error('[Firestore] persistUser error:', err);
      return false;
    });
  }

  deleteUser(id: string): boolean {
    const idx = this.users.findIndex(u => u.id === id);
    if (idx === -1) return false;
    this.users.splice(idx, 1);
    deleteDocById('users', id).catch(err => console.error('[Firestore] deleteUser error:', err));
    return true;
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

    // If this campaign exists in unmapped campaigns, mark it as mapped and save linkage
    const unmapped = this.unmappedCampaigns.find(u => u.platform_campaign_id === params.platform_campaign_id);
    if (unmapped) {
      unmapped.status = 'mapped';
      unmapped.mapped_campaign_id = campaign.id;
      unmapped.mapped_line_item_id = lineItem.id;
      unmapped.updated_at = new Date().toISOString();
      saveDoc('unmapped_campaigns', unmapped.id, unmapped).catch(err => console.error('[Firestore] update unmapped status error:', err));
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

  /**
   * Core Unlink & Rollback Logic:
   * When a campaign/line item is unlinked from platform data, all associated daily metrics
   * (spend, impressions, clicks, conversions, etc.) are rolled back from line item and campaign totals.
   * The platform campaign is restored to the Unmapped Campaigns pool.
   */
  unlinkLineItemDataSource(
    agencyId: string,
    lineItemId: string,
    sourceId: string,
    userId?: string,
    userName?: string
  ): {
    success: boolean;
    message: string;
    rolledBack: {
      spend: number;
      impressions: number;
      clicks: number;
      conversions: number;
      conversion_value: number;
      reach: number;
      video_views: number;
      engagements: number;
      metricRows: number;
    };
    lineItemId: string;
    campaignId?: string;
  } {
    // 1. Locate the data source mapping
    const sourceIdx = this.lineItemDataSources.findIndex(s => s.id === sourceId && s.line_item_id === lineItemId);
    const source = sourceIdx !== -1 ? this.lineItemDataSources[sourceIdx] : this.lineItemDataSources.find(s => s.id === sourceId);
    if (!source) throw new Error('Data source mapping not found');

    const lineItem = this.getLineItemById(agencyId, lineItemId);
    const campaignId = lineItem?.campaign_id;
    const campaign = campaignId ? this.getCampaignById(agencyId, campaignId) : undefined;

    // 2. Identify all daily metrics belonging to this platform campaign for this line item/campaign
    const matchingMetrics = this.dailyMetrics.filter(m =>
      m.agency_id === agencyId &&
      (m.line_item_id === lineItemId || (campaignId && m.campaign_id === campaignId)) &&
      (m.platform_campaign_id === source.platform_campaign_id ||
       (source.platform_campaign_id && m.platform_campaign_id === source.platform_campaign_id))
    );

    // 3. Compute rolled-back totals
    const rolledBackSpend = matchingMetrics.reduce((sum, m) => sum + (Number(m.spend) || 0), 0);
    const rolledBackImpressions = matchingMetrics.reduce((sum, m) => sum + (Number(m.impressions) || 0), 0);
    const rolledBackClicks = matchingMetrics.reduce((sum, m) => sum + (Number(m.clicks) || 0), 0);
    const rolledBackConversions = matchingMetrics.reduce((sum, m) => sum + (Number(m.conversions) || 0), 0);
    const rolledBackConversionValue = matchingMetrics.reduce((sum, m) => sum + (Number(m.conversion_value) || 0), 0);
    const rolledBackReach = matchingMetrics.reduce((sum, m) => sum + (Number(m.reach) || 0), 0);
    const rolledBackVideoViews = matchingMetrics.reduce((sum, m) => sum + (Number(m.video_views) || 0), 0);
    const rolledBackEngagements = matchingMetrics.reduce((sum, m) => sum + (Number(m.engagements) || 0), 0);

    // 4. Remove these daily metrics from database and Firestore (rolling back totals)
    const metricIdsToRemove = new Set(matchingMetrics.map(m => m.id));
    this.dailyMetrics = this.dailyMetrics.filter(m => !metricIdsToRemove.has(m.id));
    matchingMetrics.forEach(m => {
      deleteDocById('daily_metrics', m.id).catch(err => console.error('[Firestore] delete daily metric rollback error:', err));
    });

    // 5. Restore or create in unmapped campaigns
    let unmapped = this.unmappedCampaigns.find(u => u.platform_campaign_id === source.platform_campaign_id);
    if (unmapped) {
      unmapped.status = 'unmapped';
      unmapped.mapped_campaign_id = undefined;
      unmapped.mapped_line_item_id = undefined;
      unmapped.updated_at = new Date().toISOString();
      if (!unmapped.metrics || unmapped.metrics.length === 0) {
        unmapped.metrics = matchingMetrics.map(m => ({
          report_date: m.report_date,
          spend: m.spend,
          impressions: m.impressions,
          reach: m.reach,
          clicks: m.clicks,
          conversions: m.conversions,
          conversion_value: m.conversion_value,
          video_views: m.video_views,
          engagements: m.engagements
        }));
        unmapped.total_spend = rolledBackSpend || unmapped.total_spend;
        unmapped.total_impressions = rolledBackImpressions || unmapped.total_impressions;
        unmapped.total_clicks = rolledBackClicks || unmapped.total_clicks;
        unmapped.total_conversions = rolledBackConversions || unmapped.total_conversions;
      }
      saveDoc('unmapped_campaigns', unmapped.id, unmapped).catch(err => console.error('[Firestore] revert unmapped error:', err));
    } else {
      this.createUnmappedCampaign({
        agency_id: agencyId,
        client_id: campaign?.client_id,
        brand_id: campaign?.brand_id,
        client_name: campaign ? this.getClientById(agencyId, campaign.client_id)?.name : undefined,
        brand_name: campaign ? this.getBrandById(agencyId, campaign.brand_id)?.name : undefined,
        platform: source.platform,
        platform_account_id: source.platform_account_id,
        platform_account_name: source.platform_account_name,
        platform_campaign_id: source.platform_campaign_id,
        platform_campaign_name: source.platform_campaign_name,
        objective: lineItem?.objective || campaign?.objective || 'Conversions',
        currency: lineItem?.currency || campaign?.currency || 'LKR',
        total_spend: rolledBackSpend,
        total_impressions: rolledBackImpressions,
        total_clicks: rolledBackClicks,
        total_conversions: rolledBackConversions,
        total_conversion_value: rolledBackConversionValue,
        total_video_views: rolledBackVideoViews,
        first_report_date: matchingMetrics[0]?.report_date,
        last_report_date: matchingMetrics[matchingMetrics.length - 1]?.report_date,
        row_count: matchingMetrics.length,
        status: 'unmapped',
        pulled_at: new Date().toISOString(),
        metrics: matchingMetrics.map(m => ({
          report_date: m.report_date,
          spend: m.spend,
          impressions: m.impressions,
          reach: m.reach,
          clicks: m.clicks,
          conversions: m.conversions,
          conversion_value: m.conversion_value,
          video_views: m.video_views,
          engagements: m.engagements
        }))
      });
    }

    // 6. Remove data source mapping from lineItemDataSources and Firestore
    const currentDsIdx = this.lineItemDataSources.findIndex(s => s.id === source.id);
    if (currentDsIdx !== -1) {
      this.lineItemDataSources.splice(currentDsIdx, 1);
      deleteDocById('line_item_data_sources', source.id).catch(err => console.error('[Firestore] delete DataSource error:', err));
    }

    // 7. Update line item primary platform IDs if pointing to this source
    if (lineItem) {
      if (lineItem.platform_campaign_id === source.platform_campaign_id) {
        const remaining = this.lineItemDataSources.filter(s => s.line_item_id === lineItemId && s.status === 'active');
        if (remaining.length > 0) {
          lineItem.platform_campaign_id = remaining[0].platform_campaign_id;
          lineItem.platform_account_id = remaining[0].platform_account_id;
        } else {
          lineItem.platform_campaign_id = '';
          lineItem.platform_account_id = '';
        }
        lineItem.updated_at = new Date().toISOString();
        saveDoc('line_items', lineItem.id, lineItem).catch(err => console.error('[Firestore] update line_item error:', err));
      }
    }

    // 8. Recalculate campaign budget
    if (campaignId) {
      this.recalculateCampaignBudget(campaignId);
    }

    // 9. Audit log
    const currencyStr = lineItem?.currency || campaign?.currency || 'LKR';
    this.addAuditLog({
      agency_id: agencyId,
      user_id: userId || 'user_active',
      user_name: userName || 'Agency Media Planner',
      action: 'UNLINKED_DATA_SOURCE',
      entity_type: 'line_item',
      entity_id: lineItemId,
      details: `Unlinked ${source.platform.toUpperCase()} campaign "${source.platform_campaign_name}" (${source.platform_campaign_id}) from Line Item "${lineItem?.name || lineItemId}". Rolled back ${currencyStr} ${rolledBackSpend.toLocaleString()} spend and ${rolledBackImpressions.toLocaleString()} impressions from totals.`
    });

    return {
      success: true,
      message: `Unlinked ${source.platform_campaign_name}. Rolled back ${currencyStr} ${rolledBackSpend.toLocaleString()} spend and ${rolledBackImpressions.toLocaleString()} impressions from totals.`,
      rolledBack: {
        spend: rolledBackSpend,
        impressions: rolledBackImpressions,
        clicks: rolledBackClicks,
        conversions: rolledBackConversions,
        conversion_value: rolledBackConversionValue,
        reach: rolledBackReach,
        video_views: rolledBackVideoViews,
        engagements: rolledBackEngagements,
        metricRows: matchingMetrics.length
      },
      lineItemId,
      campaignId
    };
  }

  disconnectLineItemDataSource(
    agencyId: string,
    lineItemId: string,
    sourceId: string,
    userId?: string,
    userName?: string,
    rollbackTotals: boolean = true
  ): LineItemDataSource & { rolledBack?: any } {
    if (rollbackTotals) {
      const unlinkRes = this.unlinkLineItemDataSource(agencyId, lineItemId, sourceId, userId, userName);
      return {
        id: sourceId,
        line_item_id: lineItemId,
        platform: 'meta',
        platform_account_id: '',
        platform_campaign_id: '',
        platform_campaign_name: '',
        linked_at: new Date().toISOString(),
        status: 'disconnected',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        rolledBack: unlinkRes.rolledBack
      };
    }

    const source = this.lineItemDataSources.find(s => s.id === sourceId && s.line_item_id === lineItemId);
    if (!source) throw new Error('Data source mapping not found');

    source.status = 'disconnected';
    source.updated_at = new Date().toISOString();
    saveDoc('line_item_data_sources', source.id, source).catch(err => console.error('[Firestore] disconnect DataSource error:', err));

    const lineItem = this.getLineItemById(agencyId, lineItemId);
    if (lineItem?.campaign_id) {
      this.recalculateCampaignBudget(lineItem.campaign_id);
    }
    return source;
  }

  deleteLineItemDataSource(
    agencyId: string,
    lineItemId: string,
    sourceId: string,
    userId?: string,
    userName?: string
  ): { success: boolean; message: string; rolledBack?: any } {
    return this.unlinkLineItemDataSource(agencyId, lineItemId, sourceId, userId, userName);
  }

  unmapCampaign(
    agencyId: string,
    unmappedId: string,
    userId?: string,
    userName?: string
  ): {
    success: boolean;
    message: string;
    rolledBack: any;
  } {
    const unmapped = this.getUnmappedCampaignById(agencyId, unmappedId);
    if (!unmapped) throw new Error('Campaign record not found');

    // Find any lineItemDataSource matching this platform_campaign_id
    const source = this.lineItemDataSources.find(s => s.platform_campaign_id === unmapped.platform_campaign_id);
    if (source) {
      return this.unlinkLineItemDataSource(agencyId, source.line_item_id, source.id, userId, userName);
    }

    // Fallback: If source record was removed, find matching daily metrics by platform_campaign_id
    const targetLineItemId = unmapped.mapped_line_item_id;
    const targetCampaignId = unmapped.mapped_campaign_id;

    const matchingMetrics = this.dailyMetrics.filter(m =>
      m.agency_id === agencyId &&
      (m.platform_campaign_id === unmapped.platform_campaign_id ||
       (targetLineItemId && m.line_item_id === targetLineItemId))
    );

    const rolledBackSpend = matchingMetrics.reduce((sum, m) => sum + (Number(m.spend) || 0), 0);
    const rolledBackImpressions = matchingMetrics.reduce((sum, m) => sum + (Number(m.impressions) || 0), 0);

    const metricIdsToRemove = new Set(matchingMetrics.map(m => m.id));
    this.dailyMetrics = this.dailyMetrics.filter(m => !metricIdsToRemove.has(m.id));
    matchingMetrics.forEach(m => {
      deleteDocById('daily_metrics', m.id).catch(() => {});
    });

    unmapped.status = 'unmapped';
    unmapped.mapped_campaign_id = undefined;
    unmapped.mapped_line_item_id = undefined;
    unmapped.updated_at = new Date().toISOString();
    saveDoc('unmapped_campaigns', unmapped.id, unmapped).catch(() => {});

    if (targetCampaignId) {
      this.recalculateCampaignBudget(targetCampaignId);
    }

    return {
      success: true,
      message: `Unlinked campaign "${unmapped.platform_campaign_name}". Rolled back spend (${unmapped.currency} ${rolledBackSpend.toLocaleString()}) and metrics from campaign totals.`,
      rolledBack: {
        spend: rolledBackSpend,
        impressions: rolledBackImpressions,
        metricRows: matchingMetrics.length
      }
    };
  }

  unlinkCampaignDataSources(
    agencyId: string,
    campaignId: string,
    userId?: string,
    userName?: string
  ): {
    success: boolean;
    message: string;
    totalRolledBackSpend: number;
    unlinkedSourcesCount: number;
  } {
    const lineItems = this.getLineItems(agencyId, campaignId);
    let totalSpend = 0;
    let unlinkedCount = 0;

    for (const li of lineItems) {
      const sources = this.lineItemDataSources.filter(s => s.line_item_id === li.id);
      for (const src of sources) {
        try {
          const res = this.unlinkLineItemDataSource(agencyId, li.id, src.id, userId, userName);
          totalSpend += res.rolledBack.spend;
          unlinkedCount++;
        } catch {
          // ignore
        }
      }
    }

    this.recalculateCampaignBudget(campaignId);

    return {
      success: true,
      message: `Unlinked ${unlinkedCount} data sources. Rolled back ${totalSpend.toLocaleString()} spend from campaign totals.`,
      totalRolledBackSpend: totalSpend,
      unlinkedSourcesCount: unlinkedCount
    };
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

    // If an unmapped campaign exists with this platform_campaign_id, remove it automatically
    const unmappedIdx = this.unmappedCampaigns.findIndex(u => u.platform_campaign_id === params.platform_campaign_id);
    if (unmappedIdx !== -1) {
      const removedId = this.unmappedCampaigns[unmappedIdx].id;
      this.deleteUnmappedCampaign(agencyId, removedId);
    }

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
      alert.auto_resolved = false;
    } else {
      delete alert.auto_resolved;
    }
    saveDoc('alerts', alert.id, alert).catch(err => console.error('[Firestore] updateAlertStatus error:', err));
    return alert;
  }

  /**
   * Brings one line item's alerts into line with what is currently true of it.
   *
   * `desired` is the alert the line item warrants right now, or null when it
   * warrants none. The rules this encodes:
   *
   *  - a condition that still holds updates the open alert rather than adding
   *    another one;
   *  - a condition that has stopped holding closes the open alert, marked as
   *    closed by the system;
   *  - a condition someone has already resolved by hand stays quiet while it
   *    continues, instead of being raised again by the next sync - which is
   *    what made resolving an alert appear to do nothing;
   *  - a condition that returns after genuinely clearing raises a fresh alert.
   */
  reconcileAlert(
    agencyId: string,
    lineItemId: string,
    desired: Omit<Alert, 'id' | 'created_at' | 'status'> | null
  ): void {
    const mine = this.alerts.filter(a => a.agency_id === agencyId && a.line_item_id === lineItemId);

    if (!desired) {
      mine
        .filter(a => a.status !== 'resolved')
        .forEach(a => {
          a.status = 'resolved';
          a.resolved_at = new Date().toISOString();
          a.auto_resolved = true;
          saveDoc('alerts', a.id, a).catch(() => {});
        });
      return;
    }

    // Anything open for this line item that is no longer the right alert has
    // been superseded - an item cannot be both underspending and overspending.
    mine
      .filter(a => a.status !== 'resolved' && a.alert_type !== desired.alert_type)
      .forEach(a => {
        a.status = 'resolved';
        a.resolved_at = new Date().toISOString();
        a.auto_resolved = true;
        saveDoc('alerts', a.id, a).catch(() => {});
      });

    const existing = mine
      .filter(a => a.alert_type === desired.alert_type)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];

    if (!existing) {
      this.createAlert({ ...desired, status: 'active' } as any);
      return;
    }

    if (existing.status === 'resolved') {
      // Closed by the system means the problem had gone and is now back.
      // Resolved by a person means they have seen it and it has not lapsed
      // since, so leave it alone.
      if (existing.auto_resolved) {
        this.createAlert({ ...desired, status: 'active' } as any);
      }
      return;
    }

    existing.severity = desired.severity;
    existing.title = desired.title;
    existing.message = desired.message;
    saveDoc('alerts', existing.id, existing).catch(() => {});
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

    // 4. Ensure active LineItemDataSource is created and tracked
    this.ensureLineItemDataSource(agencyId, {
      line_item_id: targetLine.id,
      platform: unmapped.platform,
      platform_account_id: unmapped.platform_account_id,
      platform_account_name: unmapped.platform_account_name,
      platform_campaign_id: unmapped.platform_campaign_id,
      platform_campaign_name: unmapped.platform_campaign_name,
      linked_by: 'Unmapped Campaign Mapping'
    });

    // 4b. Update mapped campaign with mapped status and target references
    unmapped.status = 'mapped';
    unmapped.mapped_campaign_id = targetCampaign.id;
    unmapped.mapped_line_item_id = targetLine.id;
    unmapped.updated_at = new Date().toISOString();
    saveDoc('unmapped_campaigns', unmapped.id, unmapped).catch(err => console.error('[Firestore] update unmapped status error:', err));

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


  /**
   * Push the current in-memory state back to Firestore in bulk. Used by the
   * "Sync to Firestore" admin action to force a full re-write, e.g. after
   * data was edited directly in memory or a prior write was missed.
   */
  async resyncToFirestore(agencyId?: string): Promise<{
    agencies: number;
    clients: number;
    brands: number;
    campaigns: number;
    lineItems: number;
    alerts: number;
  }> {
    const agencies = agencyId ? this.agencies.filter(a => a.id === agencyId) : this.agencies;
    const clients = agencyId ? this.clients.filter(c => c.agency_id === agencyId) : this.clients;
    const brands = agencyId ? this.brands.filter(b => b.agency_id === agencyId) : this.brands;
    const campaigns = agencyId ? this.campaigns.filter(c => c.agency_id === agencyId) : this.campaigns;
    const lineItems = agencyId ? this.lineItems.filter(l => l.agency_id === agencyId) : this.lineItems;
    const alerts = agencyId ? this.alerts.filter(a => a.agency_id === agencyId) : this.alerts;

    await Promise.all([
      batchSaveDocs('agencies', agencies),
      batchSaveDocs('clients', clients),
      batchSaveDocs('brands', brands),
      batchSaveDocs('campaigns', campaigns),
      batchSaveDocs('line_items', lineItems),
      batchSaveDocs('alerts', alerts)
    ]);

    return {
      agencies: agencies.length,
      clients: clients.length,
      brands: brands.length,
      campaigns: campaigns.length,
      lineItems: lineItems.length,
      alerts: alerts.length
    };
  }

  /**
   * Move every record owned by one agency to another.
   *
   * Written for a specific failure mode: records created while the app was
   * scoped to one tenant become invisible to an account belonging to another,
   * because every read filters on agency_id. The data is hydrated and then
   * filtered out of every response, which is indistinguishable from data loss.
   *
   * Line item data sources carry no agency_id - they are reached through their
   * line item - so they move implicitly and need no restamping.
   */
  async reassignAgency(fromAgencyId: string, toAgencyId: string): Promise<Record<string, number>> {
    const groups: [string, { id: string; agency_id: string }[]][] = [
      ['clients', this.clients],
      ['brands', this.brands],
      ['campaigns', this.campaigns],
      ['line_items', this.lineItems],
      ['daily_metrics', this.dailyMetrics],
      ['unmapped_campaigns', this.unmappedCampaigns],
      ['alerts', this.alerts]
    ];

    const moved: Record<string, number> = {};

    for (const [collection, rows] of groups) {
      const mine = rows.filter(r => r.agency_id === fromAgencyId);

      // Chunked so a large metrics table does not open thousands of
      // concurrent writes.
      for (let i = 0; i < mine.length; i += 100) {
        const chunk = mine.slice(i, i + 100);
        chunk.forEach(row => { row.agency_id = toAgencyId; });
        await Promise.all(chunk.map(row => saveDoc(collection, row.id, row as any)));
      }

      moved[collection] = mine.length;
    }

    console.log(`[Firestore Database] Reassigned ${fromAgencyId} -> ${toAgencyId}:`, moved);
    return moved;
  }

  /**
   * Undoes one import by removing the rows it wrote, in the mapped daily
   * metrics and in the unmapped queue alike.
   *
   * It removes rather than restores. A day this import overwrote had a previous
   * value, and that value is not kept anywhere, so reverting leaves the day
   * absent rather than back as it was - re-import the correct file to refill it.
   *
   * Line items the import created are left alone: they may have been edited
   * since, and deleting records is the more expensive mistake. Any that are
   * left holding no data are named in the result so they can be removed by hand.
   */
  async revertImport(agencyId: string, importId: string): Promise<{
    metrics_removed: number;
    unmapped_rows_removed: number;
    unmapped_records_removed: number;
    line_items_left_empty: { id: string; name: string }[];
  }> {
    const doomed = this.dailyMetrics.filter(m => m.agency_id === agencyId && m.import_id === importId);
    const touchedLineItems = new Set(doomed.map(m => m.line_item_id));
    const touchedCampaigns = new Set(doomed.map(m => m.campaign_id));

    this.dailyMetrics = this.dailyMetrics.filter(m => !(m.agency_id === agencyId && m.import_id === importId));
    for (let i = 0; i < doomed.length; i += 100) {
      await Promise.all(doomed.slice(i, i + 100).map(m => deleteDocById('daily_metrics', m.id)));
    }

    let unmappedRowsRemoved = 0;
    const unmappedToDelete: string[] = [];

    for (const u of this.unmappedCampaigns.filter(x => x.agency_id === agencyId)) {
      const kept = (u.metrics || []).filter((m: any) => m.import_id !== importId);
      if (kept.length === (u.metrics || []).length) continue;

      unmappedRowsRemoved += (u.metrics || []).length - kept.length;

      if (kept.length === 0) {
        unmappedToDelete.push(u.id);
        continue;
      }

      const sum = (f: string) => kept.reduce((s: number, m: any) => s + (m[f] || 0), 0);
      const dates = kept.map((m: any) => m.report_date).sort();
      this.updateUnmappedCampaign(agencyId, u.id, {
        metrics: kept,
        row_count: kept.length,
        total_spend: sum('spend'),
        total_impressions: sum('impressions'),
        total_clicks: sum('clicks'),
        total_conversions: sum('conversions'),
        total_conversion_value: sum('conversion_value'),
        total_video_views: sum('video_views'),
        first_report_date: dates[0],
        last_report_date: dates[dates.length - 1]
      } as any);
    }

    for (const id of unmappedToDelete) {
      this.unmappedCampaigns = this.unmappedCampaigns.filter(u => u.id !== id);
      await deleteDocById('unmapped_campaigns', id);
    }

    // Budgets are derived from line item budgets rather than delivery, but the
    // campaign totals shown alongside them are recomputed for consistency.
    touchedCampaigns.forEach(id => { if (id) this.recalculateCampaignBudget(id); });

    const leftEmpty = [...touchedLineItems]
      .map(id => this.lineItems.find(l => l.id === id))
      .filter((l): l is NonNullable<typeof l> => !!l)
      .filter(l => this.dailyMetrics.every(m => m.line_item_id !== l.id))
      .map(l => ({ id: l.id, name: l.name }));

    console.log(`[Firestore Database] Reverted import ${importId}: ${doomed.length} metrics, ${unmappedRowsRemoved} unmapped rows, ${unmappedToDelete.length} unmapped records.`);

    return {
      metrics_removed: doomed.length,
      unmapped_rows_removed: unmappedRowsRemoved,
      unmapped_records_removed: unmappedToDelete.length,
      line_items_left_empty: leftEmpty
    };
  }

  /**
   * Builds a demo dataset for showing the platform to someone.
   *
   * Three things the old seed got wrong and this does not: dates are anchored
   * to today rather than hardcoded, so the dashboard never looks abandoned;
   * every record is written to Firestore, so a restart mid-demo does not empty
   * it; and every id carries a `demo_` prefix so removeDemoDataset can take
   * exactly this data out afterwards and nothing else.
   *
   * The numbers are shaped, not random. A dashboard where everything is green
   * demonstrates nothing, so the set deliberately contains a campaign pacing
   * well, one overspending, and one underdelivering against its KPI.
   *
   * Re-running replaces the set rather than adding to it, on any day.
   */
  async seedDemoDataset(agencyId: string, today = new Date()): Promise<Record<string, number>> {
    // Clear the previous set first. Ids are derived from the date, so re-seeding
    // on a later day writes a shifted window and leaves the days that fell out
    // of it behind: delivery dated before the campaign's own start, counted in
    // its totals and drawn on its charts. Removing first makes a re-seed mean
    // the same thing whenever it runs.
    await this.removeDemoDataset(agencyId);

    const iso = (d: Date) => d.toISOString().slice(0, 10);
    const shift = (days: number) => {
      const d = new Date(today);
      d.setUTCDate(d.getUTCDate() + days);
      return iso(d);
    };
    const now = new Date().toISOString();

    // Metrics run to yesterday: platforms do not report a day until it closes,
    // and a half-empty today would read as a gap.
    const DAYS = 30;
    const flightStart = shift(-DAYS);
    const flightEnd = shift(14);

    const clients = [
      { id: 'demo_client_fonterra', name: 'Fonterra Brands Lanka', industry: 'FMCG & Dairy', currency: 'LKR', contact_person: 'Dilani Jayawardena', contact_email: 'dilani@fonterra.lk' },
      { id: 'demo_client_singer', name: 'Singer Sri Lanka', industry: 'Consumer Electronics & Retail', currency: 'LKR', contact_person: 'Roshan Silva', contact_email: 'roshan@singer.lk' },
      { id: 'demo_client_serendib', name: 'Serendib Resorts', industry: 'Travel & Hospitality', currency: 'USD', contact_person: 'Ayesha Fernando', contact_email: 'ayesha@serendibresorts.com' }
    ];

    const brands = [
      { id: 'demo_brand_ratthi', client_id: 'demo_client_fonterra', name: 'Ratthi', description: 'Everyday milk powder', default_currency: 'LKR' },
      { id: 'demo_brand_anchor', client_id: 'demo_client_fonterra', name: 'Anchor Newdale', description: 'Yoghurt and dairy snacks', default_currency: 'LKR' },
      { id: 'demo_brand_singer_home', client_id: 'demo_client_singer', name: 'Singer Home Appliances', description: 'Kitchen and home range', default_currency: 'LKR' },
      { id: 'demo_brand_serendib', client_id: 'demo_client_serendib', name: 'Serendib Beach Collection', description: 'Coastal resort portfolio', default_currency: 'USD' }
    ];

    // health: how this campaign should read on the dashboard.
    const campaigns = [
      { id: 'demo_camp_ratthi', client_id: 'demo_client_fonterra', brand_id: 'demo_brand_ratthi', name: 'Ratthi Sachet Launch', description: 'Launch burst for the 20g sachet', objective: 'Reach', currency: 'LKR', health: 'good' },
      { id: 'demo_camp_newdale', client_id: 'demo_client_fonterra', brand_id: 'demo_brand_anchor', name: 'Newdale Always On', description: 'Always-on yoghurt awareness', objective: 'Video Views', currency: 'LKR', health: 'overspending' },
      { id: 'demo_camp_singer', client_id: 'demo_client_singer', brand_id: 'demo_brand_singer_home', name: 'Singer Avurudu Offers', description: 'Seasonal appliance promotion', objective: 'Conversions', currency: 'LKR', health: 'good' },
      { id: 'demo_camp_serendib', client_id: 'demo_client_serendib', brand_id: 'demo_brand_serendib', name: 'Serendib Winter Escapes', description: 'European winter season drive', objective: 'Conversions', currency: 'USD', health: 'underdelivering' }
    ];

    // Each line item is one platform buy inside a campaign. KPI targets are
    // sized against what the delivery below actually produces at this point in
    // the flight, so an on-track line reads on-track rather than failing a
    // number picked out of the air.
    const lines = [
      { id: 'demo_line_ratthi_meta', campaign_id: 'demo_camp_ratthi', platform: 'meta' as PlatformType, name: 'Ratthi | Meta Reach | Sachet', budget: 850000, primary_kpi: 'reach' as KpiMetricType, primary_kpi_target: 2138000, buying_kpi: 'cpm' as KpiMetricType, buying_kpi_target: 320, cpm: 310, ctr: 0.0135, pace: 1.0 },
      { id: 'demo_line_ratthi_tiktok', campaign_id: 'demo_camp_ratthi', platform: 'tiktok' as PlatformType, name: 'Ratthi | TikTok Video | Sachet', budget: 520000, primary_kpi: 'video_views' as KpiMetricType, primary_kpi_target: 1099000, buying_kpi: 'cpv' as KpiMetricType, buying_kpi_target: 0.22, cpm: 240, ctr: 0.009, pace: 0.97 },
      { id: 'demo_line_newdale_meta', campaign_id: 'demo_camp_newdale', platform: 'meta' as PlatformType, name: 'Newdale | Meta Video | Always On', budget: 600000, primary_kpi: 'video_views' as KpiMetricType, primary_kpi_target: 1272000, buying_kpi: 'cpv' as KpiMetricType, buying_kpi_target: 0.35, cpm: 355, ctr: 0.011, pace: 1.38 },
      { id: 'demo_line_newdale_google', campaign_id: 'demo_camp_newdale', platform: 'google' as PlatformType, name: 'Newdale | YouTube Bumper', budget: 380000, primary_kpi: 'impressions' as KpiMetricType, primary_kpi_target: 1565000, buying_kpi: 'cpm' as KpiMetricType, buying_kpi_target: 290, cpm: 335, ctr: 0.006, pace: 1.31 },
      { id: 'demo_line_singer_meta', campaign_id: 'demo_camp_singer', platform: 'meta' as PlatformType, name: 'Singer | Meta Conversions | Avurudu', budget: 1250000, primary_kpi: 'conversions' as KpiMetricType, primary_kpi_target: 2360, buying_kpi: 'cpa' as KpiMetricType, buying_kpi_target: 520, cpm: 405, ctr: 0.021, cvr: 0.038, pace: 1.03 },
      { id: 'demo_line_singer_google', campaign_id: 'demo_camp_singer', platform: 'google' as PlatformType, name: 'Singer | Search | Appliances', budget: 700000, primary_kpi: 'conversions' as KpiMetricType, primary_kpi_target: 2620, buying_kpi: 'cpa' as KpiMetricType, buying_kpi_target: 470, cpm: 620, ctr: 0.048, cvr: 0.055, pace: 0.99 },
      { id: 'demo_line_serendib_meta', campaign_id: 'demo_camp_serendib', platform: 'meta' as PlatformType, name: 'Serendib | Meta Conversions | EU', budget: 9500, primary_kpi: 'conversions' as KpiMetricType, primary_kpi_target: 340, buying_kpi: 'cpa' as KpiMetricType, buying_kpi_target: 29, cpm: 7.4, ctr: 0.016, cvr: 0.019, pace: 0.62 },
      { id: 'demo_line_serendib_tiktok', campaign_id: 'demo_camp_serendib', platform: 'tiktok' as PlatformType, name: 'Serendib | TikTok Traffic | EU', budget: 4200, primary_kpi: 'clicks' as KpiMetricType, primary_kpi_target: 18000, buying_kpi: 'cpc' as KpiMetricType, buying_kpi_target: 0.11, cpm: 4.1, ctr: 0.021, pace: 0.58 }
    ];

    const writes: Promise<any>[] = [];
    const put = <T extends { id: string }>(collection: string, arr: T[], row: T) => {
      const idx = arr.findIndex(x => x.id === row.id);
      if (idx >= 0) arr[idx] = row; else arr.push(row);
      writes.push(saveDoc(collection, row.id, row as any));
    };

    clients.forEach(c => put('clients', this.clients, { ...c, agency_id: agencyId, created_at: now, updated_at: now } as any));
    brands.forEach(b => put('brands', this.brands, { ...b, agency_id: agencyId, created_at: now, updated_at: now } as any));

    campaigns.forEach(c => {
      const budget = lines.filter(l => l.campaign_id === c.id).reduce((s, l) => s + l.budget, 0);
      put('campaigns', this.campaigns, {
        id: c.id, agency_id: agencyId, client_id: c.client_id, brand_id: c.brand_id,
        name: c.name, description: c.description, objective: c.objective,
        start_date: flightStart, end_date: flightEnd,
        total_budget: budget, currency: c.currency, status: 'active',
        created_at: now, updated_at: now
      } as any);
    });

    lines.forEach((l, li) => {
      const camp = campaigns.find(c => c.id === l.campaign_id)!;
      put('line_items', this.lineItems, {
        id: l.id, agency_id: agencyId, campaign_id: l.campaign_id,
        client_id: camp.client_id, brand_id: camp.brand_id,
        platform: l.platform, platform_account_id: `act_demo_${li + 1}`,
        platform_campaign_id: `demo_pc_${li + 1}`,
        name: l.name, objective: camp.objective,
        start_date: flightStart, end_date: flightEnd,
        budget: l.budget, currency: camp.currency,
        primary_kpi: l.primary_kpi, primary_kpi_target: l.primary_kpi_target,
        buying_kpi: l.buying_kpi, buying_kpi_target: l.buying_kpi_target,
        secondary_kpi_targets: {}, status: 'active', pacing_tolerance: 12,
        created_at: now, updated_at: now
      } as any);

      put('line_item_data_sources', this.lineItemDataSources, {
        id: `demo_ds_${li + 1}`, line_item_id: l.id, platform: l.platform,
        platform_account_id: `act_demo_${li + 1}`, platform_account_name: `${camp.name} Ad Account`,
        platform_campaign_id: `demo_pc_${li + 1}`, platform_campaign_name: l.name,
        linked_at: now, status: 'active', created_at: now, updated_at: now
      } as any);

      // Daily delivery. Spend follows the line's flight budget at its pacing
      // multiplier, with a weekday rhythm and a little day-to-day noise so the
      // charts do not look drawn with a ruler.
      const dailyBudget = (l.budget / (DAYS + 14)) * l.pace;
      for (let d = DAYS; d >= 1; d--) {
        const date = shift(-d);
        const dow = new Date(`${date}T00:00:00Z`).getUTCDay();
        const weekend = dow === 0 || dow === 6 ? 0.82 : 1.06;
        const wobble = 0.9 + ((li * 7 + d * 13) % 21) / 100;
        const spend = Math.round(dailyBudget * weekend * wobble * 100) / 100;

        const cpm = l.cpm * (0.94 + ((d * 3 + li) % 13) / 100);
        const impressions = Math.round((spend / cpm) * 1000);
        const clicks = Math.round(impressions * l.ctr);
        const conversions = (l as any).cvr ? Math.round(clicks * (l as any).cvr) : Math.round(clicks * 0.012);
        const orderValue = camp.currency === 'USD' ? 210 : 6400;

        put('daily_metrics', this.dailyMetrics, {
          id: `demo_metric_${l.id}_${date}`,
          agency_id: agencyId, client_id: camp.client_id, brand_id: camp.brand_id,
          campaign_id: l.campaign_id, line_item_id: l.id,
          platform: l.platform, ad_account_id: `act_demo_${li + 1}`,
          platform_campaign_id: `demo_pc_${li + 1}`, campaign_name: l.name,
          report_date: date, currency: camp.currency,
          spend,
          impressions,
          reach: Math.round(impressions * 0.78),
          clicks,
          conversions,
          conversion_value: Math.round(conversions * orderValue),
          video_views: l.primary_kpi === 'video_views' ? Math.round(impressions * 0.52) : Math.round(impressions * 0.18),
          engagements: Math.round(clicks * 2.4),
          campaign_status: 'ACTIVE', objective: camp.objective,
          created_at: now
        } as any);
      }
    });

    for (let i = 0; i < writes.length; i += 100) {
      await Promise.all(writes.slice(i, i + 100));
    }

    campaigns.forEach(c => this.recalculateCampaignBudget(c.id));

    const counts = {
      clients: clients.length,
      brands: brands.length,
      campaigns: campaigns.length,
      line_items: lines.length,
      data_sources: lines.length,
      daily_metrics: lines.length * DAYS
    };
    console.log(`[Firestore Database] Demo dataset seeded for ${agencyId}:`, counts);
    return counts;
  }

  /**
   * Removes exactly what seedDemoDataset created, by id prefix, leaving real
   * records untouched. Alerts raised against demo line items go too, otherwise
   * the alert list keeps pointing at records that no longer exist.
   */
  async removeDemoDataset(agencyId: string): Promise<Record<string, number>> {
    const isDemo = (id: string) => typeof id === 'string' && id.startsWith('demo_');
    const counts: Record<string, number> = {};
    const deletes: Promise<any>[] = [];

    const purge = <T extends { id: string; agency_id?: string }>(
      collection: string,
      arr: T[],
      keep: (rows: T[]) => void,
      match: (row: T) => boolean
    ) => {
      const doomed = arr.filter(r => r.agency_id === agencyId && match(r));
      counts[collection] = doomed.length;
      doomed.forEach(r => deletes.push(deleteDocById(collection, r.id)));
      keep(arr.filter(r => !(r.agency_id === agencyId && match(r))));
    };

    purge('daily_metrics', this.dailyMetrics, rows => { this.dailyMetrics = rows; }, r => isDemo(r.id));
    purge('alerts', this.alerts, rows => { this.alerts = rows; }, r => isDemo((r as any).line_item_id || ''));
    purge('line_items', this.lineItems, rows => { this.lineItems = rows; }, r => isDemo(r.id));
    purge('campaigns', this.campaigns, rows => { this.campaigns = rows; }, r => isDemo(r.id));
    purge('brands', this.brands, rows => { this.brands = rows; }, r => isDemo(r.id));
    purge('clients', this.clients, rows => { this.clients = rows; }, r => isDemo(r.id));

    // Data sources have no agency of their own; they belong to their line item.
    const doomedDs = this.lineItemDataSources.filter(ds => isDemo(ds.id));
    counts['line_item_data_sources'] = doomedDs.length;
    doomedDs.forEach(ds => deletes.push(deleteDocById('line_item_data_sources', ds.id)));
    this.lineItemDataSources = this.lineItemDataSources.filter(ds => !isDemo(ds.id));

    for (let i = 0; i < deletes.length; i += 100) {
      await Promise.all(deletes.slice(i, i + 100));
    }

    console.log(`[Firestore Database] Demo dataset removed for ${agencyId}:`, counts);
    return counts;
  }

  getFirestoreStatus(agencyId?: string): {
    connected: boolean;
    projectId: string;
    databaseId: string;
    syncedCounts: { agencies: number; clients: number; brands: number; campaigns: number; lineItems: number; alerts: number };
  } {
    const { projectId, databaseId } = getFirestoreConnectionInfo();
    return {
      connected: this.firestoreInitialized,
      projectId,
      databaseId,
      syncedCounts: {
        agencies: (agencyId ? this.agencies.filter(a => a.id === agencyId) : this.agencies).length,
        clients: (agencyId ? this.clients.filter(c => c.agency_id === agencyId) : this.clients).length,
        brands: (agencyId ? this.brands.filter(b => b.agency_id === agencyId) : this.brands).length,
        campaigns: (agencyId ? this.campaigns.filter(c => c.agency_id === agencyId) : this.campaigns).length,
        lineItems: (agencyId ? this.lineItems.filter(l => l.agency_id === agencyId) : this.lineItems).length,
        alerts: (agencyId ? this.alerts.filter(a => a.agency_id === agencyId) : this.alerts).length
      }
    };
  }
}

export const db = new RelationalDatabase();
