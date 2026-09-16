export type UserRole = 'super_user' | 'agency_admin' | 'agency_member' | 'client_viewer';
export type PlatformType = 'meta' | 'tiktok' | 'google';
export type CampaignStatus = 'active' | 'paused' | 'completed' | 'draft';
export type HealthStatus = 'green' | 'amber' | 'red';
export type KpiMetricType = 
  | 'reach'
  | 'impressions'
  | 'video_views'
  | 'clicks' 
  | 'conversions' 
  | 'engagements'
  | 'cpm' 
  | 'cpc' 
  | 'cpv'
  | 'cpa' 
  | 'ctr' 
  | 'cpe' 
  | 'roas' 
  | 'spend';

export interface Agency {
  id: string;
  name: string;
  slug: string;
  plan: 'boutique' | 'growth' | 'enterprise';
  status: 'active' | 'suspended' | 'trial';
  max_clients: number;
  max_campaigns: number;
  contact_email: string;
  /** Currency every cross-currency rollup is reported in. Defaults to LKR. */
  base_currency?: string;
  /** Units of base_currency per 1 unit of the keyed currency, e.g. { USD: 305 } when base is LKR. */
  exchange_rates?: Record<string, number>;
  created_at: string;
  updated_at: string;
}

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  agency_id?: string;
  client_id?: string;
  brand_id?: string;
  /** Firebase Auth uid once this user has signed in or been invited. */
  auth_uid?: string;
  created_at: string;
}

export interface Client {
  id: string;
  agency_id: string;
  name: string;
  industry: string;
  currency: string;
  contact_person: string;
  contact_email: string;
  created_at: string;
  updated_at: string;
}

export interface Brand {
  id: string;
  agency_id: string;
  client_id: string;
  name: string;
  description: string;
  default_currency: string;
  default_kpi_targets?: Record<string, number>;
  created_at: string;
  updated_at: string;
}

export interface Campaign {
  id: string;
  agency_id: string;
  client_id: string;
  brand_id: string;
  name: string;
  description: string;
  objective: string;
  start_date: string;
  end_date: string;
  total_budget: number;
  currency: string;
  usd_to_lkr_rate?: number;
  status: CampaignStatus;
  created_at: string;
  updated_at: string;
}

export interface CampaignLineItem {
  id: string;
  campaign_id: string;
  agency_id: string;
  client_id: string;
  brand_id: string;
  platform: PlatformType;
  platform_account_id: string;
  platform_campaign_id: string;
  name: string;
  objective: string;
  start_date: string;
  end_date: string;
  budget: number;
  currency: string;
  primary_kpi: KpiMetricType;
  primary_kpi_target: number;
  buying_kpi?: KpiMetricType;
  buying_kpi_target?: number;
  secondary_kpi_targets?: Partial<Record<KpiMetricType, number>>;
  status: CampaignStatus;
  pacing_tolerance: number;
  created_at: string;
  updated_at: string;
}

export interface LineItemDataSource {
  id: string;
  line_item_id: string;
  platform: PlatformType;
  platform_account_id: string;
  platform_account_name?: string;
  platform_campaign_id: string;
  platform_campaign_name: string;
  connection_id?: string;
  linked_at: string;
  linked_by?: string;
  last_seen_at?: string;
  status: 'active' | 'disconnected';
  created_at: string;
  updated_at: string;
}

export interface PlatformAccount {
  id: string;
  agency_id: string;
  platform: PlatformType;
  account_name: string;
  account_id: string;
  status: 'connected' | 'disconnected' | 'stale';
  last_synced_at: string;
}

export interface LineItemDailyMetric {
  id: string;
  agency_id: string;
  client_id: string;
  brand_id: string;
  campaign_id: string;
  line_item_id: string;
  platform: PlatformType;
  ad_account_id: string;
  platform_campaign_id: string;
  campaign_name: string;
  report_date: string;
  currency: string;
  spend: number;
  impressions: number;
  reach: number;
  clicks: number;
  conversions: number;
  conversion_value: number;
  video_views: number;
  engagements: number;
  campaign_status: string;
  objective: string;
  import_id?: string;
  created_at: string;
}

export interface UnmappedCampaign {
  id: string;
  agency_id: string;
  client_id?: string;
  brand_id?: string;
  client_name?: string;
  brand_name?: string;
  platform: PlatformType;
  platform_account_id: string;
  platform_account_name?: string;
  platform_campaign_id: string;
  platform_campaign_name: string;
  objective?: string;
  currency: string;
  total_spend: number;
  total_impressions: number;
  total_clicks: number;
  total_conversions: number;
  total_conversion_value: number;
  total_video_views: number;
  first_report_date?: string;
  last_report_date?: string;
  row_count: number;
  status: 'unmapped' | 'mapped' | 'dismissed';
  mapped_campaign_id?: string;
  mapped_line_item_id?: string;
  pulled_at: string;
  created_at: string;
  updated_at: string;
  metrics?: {
    report_date: string;
    spend: number;
    impressions: number;
    reach: number;
    clicks: number;
    conversions: number;
    conversion_value: number;
    video_views: number;
    engagements: number;
  }[];
}

export type AlertType = 
  | 'overspending'
  | 'underspending'
  | 'no_delivery'
  | 'stopped_paused'
  | 'cpm_above_target'
  | 'ctr_below_target'
  | 'cpc_above_target'
  | 'cpa_above_target'
  | 'conversion_behind_pace'
  | 'data_import_failed'
  | 'data_stale'
  | 'account_disconnected';

export interface Alert {
  id: string;
  agency_id: string;
  client_id?: string;
  brand_id?: string;
  campaign_id?: string;
  line_item_id?: string;
  platform?: PlatformType;
  alert_type: AlertType;
  severity: HealthStatus;
  title: string;
  message: string;
  status: 'active' | 'acknowledged' | 'resolved';
  created_at: string;
  resolved_at?: string;
}

export interface ImportJob {
  id: string;
  agency_id: string;
  client_id: string;
  brand_id: string;
  platform: PlatformType;
  file_name: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  total_rows: number;
  processed_rows: number;
  inserted_count: number;
  updated_count: number;
  skipped_count: number;
  /** Rows that reported no delivery at all and were omitted on import. */
  empty_rows_count?: number;
  errors: string[];
  started_at: string;
  completed_at?: string;
}

export interface ColumnMapping {
  id: string;
  agency_id: string;
  platform: PlatformType;
  mapping_name: string;
  mappings: Record<string, string>;
  created_at: string;
}

export interface DashboardShare {
  id: string;
  agency_id: string;
  client_id: string;
  brand_id?: string;
  campaign_id?: string;
  title: string;
  share_token: string;
  recipient_email?: string;
  expires_at?: string;
  created_at: string;
  access_count: number;
}

export interface AuditLog {
  id: string;
  agency_id?: string;
  user_id: string;
  user_name: string;
  action: string;
  entity_type: string;
  entity_id: string;
  details: string;
  created_at: string;
}

export interface LineItemCalculatedMetrics {
  line_item: CampaignLineItem;
  client_name: string;
  brand_name: string;
  campaign_name: string;
  total_spend: number;
  expected_spend: number;
  budget_remaining: number;
  pacing_percentage: number;
  projected_final_spend: number;
  total_impressions: number;
  total_reach: number;
  total_clicks: number;
  total_conversions: number;
  total_conversion_value: number;
  total_video_views: number;
  total_engagements: number;
  actual_cpm: number;
  actual_cpc: number;
  actual_ctr: number;
  actual_cpa: number;
  actual_cpe: number;
  actual_roas: number;
  actual_cpv?: number;
  primary_kpi: KpiMetricType;
  primary_kpi_target: number;
  primary_kpi_actual: number;
  primary_kpi_expected: number;
  primary_kpi_pacing: number;
  primary_kpi_progress: number;
  primary_kpi_variance: number;
  buying_kpi?: KpiMetricType;
  buying_kpi_target?: number;
  buying_kpi_actual?: number;
  buying_kpi_variance?: number;
  health: HealthStatus;
  health_score: number;
  health_reasons: string[];
  days_elapsed: number;
  days_total: number;
  last_updated: string;
  daily_metrics?: LineItemDailyMetric[];
  data_sources?: LineItemDataSource[];
  data_source_status?: 'connected' | 'not_connected';
  connected_sources_count?: number;
}

export interface PlatformCalculatedMetrics {
  platform: PlatformType;
  currency?: string;
  converted_budget?: number;
  converted_spend?: number;
  line_items_count: number;
  budget: number;
  spend: number;
  budget_remaining: number;
  expected_spend: number;
  pacing_percentage: number;
  impressions: number;
  clicks: number;
  conversions: number;
  video_views: number;
  engagements: number;
  cpm: number;
  ctr: number;
  cpc: number;
  cpa: number;
  cpe: number;
  roas: number;
  health: HealthStatus;
  line_items: LineItemCalculatedMetrics[];
}

export interface CampaignCalculatedMetrics {
  campaign: Campaign;
  client_name: string;
  brand_name: string;
  total_budget: number;
  total_spend: number;
  budget_used_percentage: number;
  budget_remaining: number;
  expected_spend: number;
  overall_pacing: number;
  projected_final_spend: number;
  overall_health: HealthStatus;
  campaign_rating_score: number; // 0 to 100
  campaign_rating_label: string; // 'Optimal' | 'On Track' | 'Needs Attention' | 'Critical Risk'
  primary_kpis_summary?: {
    kpi: KpiMetricType;
    label: string;
    target: number;
    actual: number;
    expected: number;
    pacing_percentage: number;
    progress_percentage: number;
    variance: number;
    status: HealthStatus;
  }[];
  buying_kpis_summary?: {
    kpi: KpiMetricType;
    label: string;
    target: number;
    actual: number;
    variance: number;
    currency: string;
    status: HealthStatus;
  }[];
  days_elapsed?: number;
  days_total?: number;
  total_impressions: number;
  total_reach: number;
  total_clicks: number;
  blended_ctr: number;
  blended_cpm: number;
  total_conversions: number;
  total_conversion_value: number;
  blended_cpa: number;
  blended_cpc: number;
  blended_roas: number;
  total_video_views: number;
  total_engagements: number;
  active_line_items_count: number;
  requiring_attention_count: number;
  last_successful_update: string;
  platforms: PlatformCalculatedMetrics[];
  has_multiple_currencies?: boolean;
  exchange_rate?: number;
  /**
   * Money totals restated in the agency's base currency. Campaigns can each be
   * denominated differently, so only these may be summed across campaigns.
   */
  base_currency?: string;
  total_budget_base?: number;
  total_spend_base?: number;
  expected_spend_base?: number;
  total_conversion_value_base?: number;
  projected_final_spend_base?: number;
  line_items_count?: number;
  connected_line_items_count?: number;
  unconnected_line_items_count?: number;
  currency_budgets?: Record<string, number>;
  currency_breakdown?: {
    currency: string;
    budget: number;
    spend: number;
    expected_spend: number;
  }[];
}
