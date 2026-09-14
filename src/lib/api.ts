import {
  Agency,
  User,
  Client,
  Brand,
  Campaign,
  CampaignLineItem,
  LineItemCalculatedMetrics,
  CampaignCalculatedMetrics,
  Alert,
  ImportJob,
  DashboardShare,
  UnmappedCampaign,
  LineItemDataSource,
  PlatformAccount
} from '../types';

export class ApiService {
  private static async request<T>(path: string, options: RequestInit = {}, agencyId?: string, retries = 2): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string> || {})
    };
    if (agencyId) {
      headers['x-agency-id'] = agencyId;
    }

    try {
      const res = await fetch(path, {
        ...options,
        headers
      });

      if (!res.ok) {
        let errMsg = `Request failed: ${res.status} ${res.statusText}`;
        try {
          const errorData = await res.json();
          if (errorData.error) errMsg = errorData.error;
        } catch {
          // Fallback
        }
        throw new Error(errMsg);
      }

      return res.json();
    } catch (err: any) {
      // Retry once or twice if transient network failure (e.g. server starting up or connection reset)
      if (retries > 0 && (!options.method || options.method === 'GET')) {
        await new Promise(r => setTimeout(r, 400));
        return this.request<T>(path, options, agencyId, retries - 1);
      }
      throw err;
    }
  }

  // Agencies
  static getAgencies(): Promise<Agency[]> {
    return this.request<Agency[]>('/api/agencies');
  }

  static createAgency(data: Partial<Agency>): Promise<Agency> {
    return this.request<Agency>('/api/agencies', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  // Users
  static getUsers(agencyId?: string): Promise<User[]> {
    const q = agencyId ? `?agency_id=${agencyId}` : '';
    return this.request<User[]>(`/api/users${q}`);
  }

  // Clients
  static getClients(agencyId: string): Promise<Client[]> {
    return this.request<Client[]>('/api/clients', {}, agencyId);
  }

  static createClient(agencyId: string, data: Partial<Client>): Promise<Client> {
    return this.request<Client>('/api/clients', {
      method: 'POST',
      body: JSON.stringify(data)
    }, agencyId);
  }

  static updateClient(agencyId: string, id: string, data: Partial<Client>): Promise<Client> {
    return this.request<Client>(`/api/clients/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data)
    }, agencyId);
  }

  static deleteClient(agencyId: string, id: string): Promise<{ message: string }> {
    return this.request<{ message: string }>(`/api/clients/${id}`, {
      method: 'DELETE'
    }, agencyId);
  }

  // Brands
  static getBrands(agencyId: string, clientId?: string): Promise<Brand[]> {
    const q = clientId ? `?client_id=${clientId}` : '';
    return this.request<Brand[]>(`/api/brands${q}`, {}, agencyId);
  }

  static createBrand(agencyId: string, data: Partial<Brand>): Promise<Brand> {
    return this.request<Brand>('/api/brands', {
      method: 'POST',
      body: JSON.stringify(data)
    }, agencyId);
  }

  static updateBrand(agencyId: string, id: string, data: Partial<Brand>): Promise<Brand> {
    return this.request<Brand>(`/api/brands/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data)
    }, agencyId);
  }

  static deleteBrand(agencyId: string, id: string): Promise<{ message: string }> {
    return this.request<{ message: string }>(`/api/brands/${id}`, {
      method: 'DELETE'
    }, agencyId);
  }

  // Campaigns
  static getCampaigns(agencyId: string, clientId?: string, brandId?: string): Promise<CampaignCalculatedMetrics[]> {
    const params = new URLSearchParams();
    if (clientId) params.set('client_id', clientId);
    if (brandId) params.set('brand_id', brandId);
    const qs = params.toString() ? `?${params.toString()}` : '';
    return this.request<CampaignCalculatedMetrics[]>(`/api/campaigns${qs}`, {}, agencyId);
  }

  static getCampaignDetails(agencyId: string, id: string): Promise<CampaignCalculatedMetrics> {
    return this.request<CampaignCalculatedMetrics>(`/api/campaigns/${id}`, {}, agencyId);
  }

  static createCampaign(agencyId: string, data: Partial<Campaign>): Promise<Campaign> {
    return this.request<Campaign>('/api/campaigns', {
      method: 'POST',
      body: JSON.stringify(data)
    }, agencyId);
  }

  static updateCampaign(agencyId: string, id: string, data: Partial<Campaign>): Promise<Campaign> {
    return this.request<Campaign>(`/api/campaigns/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data)
    }, agencyId);
  }

  static deleteCampaign(agencyId: string, id: string): Promise<{ message: string }> {
    return this.request<{ message: string }>(`/api/campaigns/${id}`, {
      method: 'DELETE'
    }, agencyId);
  }

  // Line Items
  static getLineItems(agencyId: string, campaignId?: string): Promise<LineItemCalculatedMetrics[]> {
    const q = campaignId ? `?campaign_id=${campaignId}` : '';
    return this.request<LineItemCalculatedMetrics[]>(`/api/line-items${q}`, {}, agencyId);
  }

  static getLineItemDetails(agencyId: string, id: string): Promise<LineItemCalculatedMetrics> {
    return this.request<LineItemCalculatedMetrics>(`/api/line-items/${id}`, {}, agencyId);
  }

  static createLineItem(agencyId: string, data: Partial<CampaignLineItem>): Promise<CampaignLineItem> {
    return this.request<CampaignLineItem>('/api/line-items', {
      method: 'POST',
      body: JSON.stringify(data)
    }, agencyId);
  }

  static updateLineItem(agencyId: string, id: string, data: Partial<CampaignLineItem>): Promise<CampaignLineItem> {
    return this.request<CampaignLineItem>(`/api/line-items/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data)
    }, agencyId);
  }

  static deleteLineItem(agencyId: string, id: string): Promise<{ message: string }> {
    return this.request<{ message: string }>(`/api/line-items/${id}`, {
      method: 'DELETE'
    }, agencyId);
  }

  // Line Item Data Sources & Platform Mapping
  static getPlatformAccounts(agencyId: string, platform?: string): Promise<PlatformAccount[]> {
    const q = platform ? `?platform=${platform}` : '';
    return this.request<PlatformAccount[]>(`/api/platform-accounts${q}`, {}, agencyId);
  }

  static getLineItemDataSources(agencyId: string, lineItemId: string): Promise<LineItemDataSource[]> {
    return this.request<LineItemDataSource[]>(`/api/line-items/${lineItemId}/data-sources`, {}, agencyId);
  }

  static getAvailablePlatformCampaigns(
    agencyId: string,
    lineItemId: string,
    accountId?: string
  ): Promise<{
    campaign_id: string;
    campaign_name: string;
    platform: string;
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
  }[]> {
    const q = accountId ? `?account_id=${encodeURIComponent(accountId)}` : '';
    return this.request<any[]>(`/api/line-items/${lineItemId}/available-campaigns${q}`, {}, agencyId);
  }

  static connectLineItemDataSource(
    agencyId: string,
    lineItemId: string,
    data: {
      platform: string;
      platform_account_id: string;
      platform_campaign_id: string;
      platform_campaign_name: string;
      connection_id?: string;
    }
  ): Promise<LineItemDataSource> {
    return this.request<LineItemDataSource>(`/api/line-items/${lineItemId}/data-sources`, {
      method: 'POST',
      body: JSON.stringify(data)
    }, agencyId);
  }

  static disconnectLineItemDataSource(
    agencyId: string,
    lineItemId: string,
    sourceId: string,
    rollback: boolean = true
  ): Promise<LineItemDataSource & { rolledBack?: any }> {
    return this.request<LineItemDataSource & { rolledBack?: any }>(`/api/line-items/${lineItemId}/data-sources/${sourceId}/disconnect`, {
      method: 'POST',
      body: JSON.stringify({ rollback })
    }, agencyId);
  }

  static unlinkLineItemDataSource(
    agencyId: string,
    lineItemId: string,
    sourceId: string
  ): Promise<{
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
  }> {
    return this.request<{
      success: boolean;
      message: string;
      rolledBack: any;
      lineItemId: string;
      campaignId?: string;
    }>(`/api/line-items/${lineItemId}/data-sources/${sourceId}/unlink`, {
      method: 'POST'
    }, agencyId);
  }

  static deleteLineItemDataSource(
    agencyId: string,
    lineItemId: string,
    sourceId: string
  ): Promise<{ message: string; rolledBack?: any }> {
    return this.request<{ message: string; rolledBack?: any }>(`/api/line-items/${lineItemId}/data-sources/${sourceId}`, {
      method: 'DELETE'
    }, agencyId);
  }

  static unlinkCampaignData(
    agencyId: string,
    campaignId: string
  ): Promise<{ success: boolean; message: string; totalRolledBackSpend: number; unlinkedSourcesCount: number }> {
    return this.request<{ success: boolean; message: string; totalRolledBackSpend: number; unlinkedSourcesCount: number }>(
      `/api/campaigns/${campaignId}/unlink-data`,
      {
        method: 'POST'
      },
      agencyId
    );
  }

  // Alerts
  static getAlerts(agencyId: string, status?: string): Promise<Alert[]> {
    const q = status ? `?status=${status}` : '';
    return this.request<Alert[]>(`/api/alerts${q}`, {}, agencyId);
  }

  static updateAlertStatus(agencyId: string, id: string, status: 'active' | 'acknowledged' | 'resolved'): Promise<Alert> {
    return this.request<Alert>(`/api/alerts/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status })
    }, agencyId);
  }

  // Imports
  static getImports(agencyId: string): Promise<ImportJob[]> {
    return this.request<ImportJob[]>('/api/imports', {}, agencyId);
  }

  static previewCsv(csvContent: string): Promise<any> {
    return this.request<any>('/api/imports/preview', {
      method: 'POST',
      body: JSON.stringify({ csv_content: csvContent })
    });
  }

  static executeImport(agencyId: string, data: any): Promise<ImportJob> {
    return this.request<ImportJob>('/api/imports/execute', {
      method: 'POST',
      body: JSON.stringify(data)
    }, agencyId);
  }

  static getSampleCsv(platform: string): Promise<{ csv: string }> {
    return this.request<{ csv: string }>(`/api/imports/sample/${platform}`);
  }

  // Shares
  static getShares(agencyId: string): Promise<DashboardShare[]> {
    return this.request<DashboardShare[]>('/api/shares', {}, agencyId);
  }

  static createShare(agencyId: string, data: Partial<DashboardShare>): Promise<DashboardShare> {
    return this.request<DashboardShare>('/api/shares', {
      method: 'POST',
      body: JSON.stringify(data)
    }, agencyId);
  }

  static verifyShare(token: string): Promise<any> {
    return this.request<any>(`/api/shares/verify/${token}`);
  }

  // Super User Stats & Audit Logs
  static getSuperUserStats(): Promise<any> {
    return this.request<any>('/api/superuser/stats');
  }

  static getAuditLogs(agencyId?: string): Promise<any[]> {
    const q = agencyId ? `?agency_id=${agencyId}` : '';
    return this.request<any[]>(`/api/audit-logs${q}`);
  }

  // Unmapped Campaigns
  static getUnmappedCampaigns(agencyId: string, status?: string): Promise<UnmappedCampaign[]> {
    const q = status ? `?status=${status}` : '';
    return this.request<UnmappedCampaign[]>(`/api/unmapped-campaigns${q}`, {}, agencyId);
  }

  static getUnmappedCampaignById(agencyId: string, id: string): Promise<UnmappedCampaign> {
    return this.request<UnmappedCampaign>(`/api/unmapped-campaigns/${id}`, {}, agencyId);
  }

  static pullPlatformData(agencyId: string, platform?: string): Promise<{ pulled_count: number; unmapped_count: number; new_unmapped: UnmappedCampaign[] }> {
    return this.request<{ pulled_count: number; unmapped_count: number; new_unmapped: UnmappedCampaign[] }>(
      '/api/unmapped-campaigns/pull',
      {
        method: 'POST',
        body: JSON.stringify({ platform })
      },
      agencyId
    );
  }

  static mapUnmappedCampaign(
    agencyId: string,
    id: string,
    payload: {
      target_campaign_id?: string;
      target_line_item_id?: string;
      new_line_item?: any;
      new_campaign?: any;
    }
  ): Promise<{ success: boolean; lineItem: CampaignLineItem; campaign: Campaign; metricsTransferred: number }> {
    return this.request<{ success: boolean; lineItem: CampaignLineItem; campaign: Campaign; metricsTransferred: number }>(
      `/api/unmapped-campaigns/${id}/map`,
      {
        method: 'POST',
        body: JSON.stringify(payload)
      },
      agencyId
    );
  }

  static unmapCampaign(
    agencyId: string,
    id: string
  ): Promise<{ success: boolean; message: string; rolledBack: any }> {
    return this.request<{ success: boolean; message: string; rolledBack: any }>(
      `/api/unmapped-campaigns/${id}/unmap`,
      {
        method: 'POST'
      },
      agencyId
    );
  }

  static dismissUnmappedCampaign(agencyId: string, id: string): Promise<UnmappedCampaign> {
    return this.request<UnmappedCampaign>(
      `/api/unmapped-campaigns/${id}/dismiss`,
      {
        method: 'POST'
      },
      agencyId
    );
  }

  static deleteUnmappedCampaign(agencyId: string, id: string): Promise<{ message: string }> {
    return this.request<{ message: string }>(
      `/api/unmapped-campaigns/${id}`,
      {
        method: 'DELETE'
      },
      agencyId
    );
  }

  // System Administration & Data Management
  static clearPlatformData(agencyId?: string): Promise<{ success: boolean; message: string; details?: any }> {
    return this.request<{ success: boolean; message: string; details?: any }>('/api/system/clear-platform-data', {
      method: 'POST',
      body: JSON.stringify({ agency_id: agencyId })
    });
  }

  static clearAllData(): Promise<{ success: boolean; message: string; details?: any }> {
    return this.request<{ success: boolean; message: string; details?: any }>('/api/system/clear-all-data', {
      method: 'POST'
    });
  }

  static seedDemoData(): Promise<{ success: boolean; message: string }> {
    return this.request<{ success: boolean; message: string }>('/api/system/seed-demo-data', {
      method: 'POST'
    });
  }
}
