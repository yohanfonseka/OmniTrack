import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import { CampaignCalculatedMetrics, Client, Brand, CampaignLineItem } from '../../types';
import { ApiService } from '../../lib/api';
import { CampaignOverview } from './CampaignOverview';
import { PlatformBreakdown } from './PlatformBreakdown';
import { ConnectDataSourceModal } from '../modals/ConnectDataSourceModal';
import { HealthBadge } from '../common/HealthBadge';
import { formatMoney as formatCurrencyMoney, formatPercent } from '../../lib/formatters';
import {
  Layers,
  RefreshCw,
  PlusCircle,
  Briefcase,
  Target,
  Building2,
  ArrowRight,
  TrendingUp,
  X
} from 'lucide-react';

interface DrillDownContainerProps {
  onOpenCreateLineItem?: (campaignId: string) => void;
  onOpenCreateCampaign?: () => void;
}

export const DrillDownContainer: React.FC<DrillDownContainerProps> = ({
  onOpenCreateLineItem,
  onOpenCreateCampaign
}) => {
  const { currentAgency, drillDown, selectCampaign, selectPlatform, selectLineItem } = useAuth();

  const [campaigns, setCampaigns] = useState<CampaignCalculatedMetrics[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters: Client, Brand, and Campaign (empty string = "All")
  const [filterClientId, setFilterClientId] = useState<string>('');
  const [filterBrandId, setFilterBrandId] = useState<string>('');
  const [selectedCampaignId, setSelectedCampaignId] = useState<string>('');
  const [connectingLineItem, setConnectingLineItem] = useState<CampaignLineItem | null>(null);

  const loadData = async () => {
    if (!currentAgency) return;
    setLoading(true);
    setError(null);
    try {
      const [campList, clientList, brandList] = await Promise.all([
        ApiService.getCampaigns(currentAgency.id),
        ApiService.getClients(currentAgency.id),
        ApiService.getBrands(currentAgency.id)
      ]);
      setCampaigns(campList);
      setClients(clientList);
      setBrands(brandList);

      // Sync with drillDown if provided initially
      if (drillDown.campaignId && campList.some(c => c.campaign.id === drillDown.campaignId)) {
        setSelectedCampaignId(drillDown.campaignId);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load campaign hierarchy');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();

    const handleRefresh = () => {
      loadData();
    };
    window.addEventListener('refresh-omnitrack', handleRefresh);
    window.addEventListener('campaigns-updated', handleRefresh);
    return () => {
      window.removeEventListener('refresh-omnitrack', handleRefresh);
      window.removeEventListener('campaigns-updated', handleRefresh);
    };
  }, [currentAgency]);

  // Sync drillDown state with selected campaign
  useEffect(() => {
    if (drillDown.campaignId && drillDown.campaignId !== selectedCampaignId) {
      setSelectedCampaignId(drillDown.campaignId);
    }
  }, [drillDown.campaignId]);

  // Dynamically compute available brands based on selected client
  const availableBrands = useMemo(() => {
    if (!filterClientId) return brands;
    return brands.filter(b => b.client_id === filterClientId);
  }, [brands, filterClientId]);

  // Dynamically compute available campaigns based on selected client & brand
  const availableCampaigns = useMemo(() => {
    return campaigns.filter(c => {
      if (filterClientId && c.campaign.client_id !== filterClientId) return false;
      if (filterBrandId && c.campaign.brand_id !== filterBrandId) return false;
      return true;
    });
  }, [campaigns, filterClientId, filterBrandId]);

  // Calculate synthesized metrics when "All Campaigns" is selected
  const allCampaignsMetrics: CampaignCalculatedMetrics | null = useMemo(() => {
    if (availableCampaigns.length === 0) return null;

    const totalBudget = availableCampaigns.reduce((sum, c) => sum + (c.total_budget || 0), 0);
    const totalSpend = availableCampaigns.reduce((sum, c) => sum + (c.total_spend || 0), 0);
    const expectedSpend = availableCampaigns.reduce((sum, c) => sum + (c.expected_spend || 0), 0);
    const totalImpr = availableCampaigns.reduce((sum, c) => sum + (c.total_impressions || 0), 0);
    const totalReach = availableCampaigns.reduce((sum, c) => sum + (c.total_reach || 0), 0);
    const totalClicks = availableCampaigns.reduce((sum, c) => sum + (c.total_clicks || 0), 0);
    const totalConv = availableCampaigns.reduce((sum, c) => sum + (c.total_conversions || 0), 0);
    const totalConvVal = availableCampaigns.reduce((sum, c) => sum + (c.total_conversion_value || 0), 0);
    const totalVideo = availableCampaigns.reduce((sum, c) => sum + (c.total_video_views || 0), 0);

    // Aggregate platforms across all matching campaigns
    const platformMap = new Map<string, any>();
    availableCampaigns.forEach(c => {
      (c.platforms || []).forEach(p => {
        const platKey = p.platform.toLowerCase();
        if (!platformMap.has(platKey)) {
          platformMap.set(platKey, {
            platform: p.platform,
            currency: p.currency || c.campaign.currency || 'LKR',
            budget: 0,
            spend: 0,
            expected_spend: 0,
            budget_remaining: 0,
            pacing_percentage: 100,
            impressions: 0,
            clicks: 0,
            conversions: 0,
            video_views: 0,
            engagements: 0,
            cpm: 0,
            ctr: 0,
            cpc: 0,
            cpa: 0,
            cpe: 0,
            roas: 0,
            health: 'green',
            line_items_count: 0,
            line_items: []
          });
        }
        const plat = platformMap.get(platKey);
        plat.budget += p.budget || 0;
        plat.spend += p.spend || 0;
        plat.expected_spend += p.expected_spend || 0;
        plat.budget_remaining += p.budget_remaining || 0;
        plat.impressions += p.impressions || 0;
        plat.clicks += p.clicks || 0;
        plat.conversions += p.conversions || 0;
        plat.video_views += p.video_views || 0;
        plat.engagements += p.engagements || 0;
        plat.line_items_count += p.line_items_count || (p.line_items ? p.line_items.length : 0);
        if (p.line_items) {
          plat.line_items.push(...p.line_items);
        }
        if (p.health === 'red') plat.health = 'red';
        else if (p.health === 'amber' && plat.health !== 'red') plat.health = 'amber';
      });
    });

    const aggregatedPlatforms = Array.from(platformMap.values()).map(p => {
      p.pacing_percentage = p.expected_spend > 0 ? (p.spend / p.expected_spend) * 100 : 100;
      p.cpm = p.impressions > 0 ? (p.spend / p.impressions) * 1000 : 0;
      p.ctr = p.impressions > 0 ? (p.clicks / p.impressions) * 100 : 0;
      p.cpc = p.clicks > 0 ? p.spend / p.clicks : 0;
      p.cpa = p.conversions > 0 ? p.spend / p.conversions : 0;
      return p;
    });

    const hasRed = availableCampaigns.some(c => c.overall_health === 'red');
    const hasAmber = availableCampaigns.some(c => c.overall_health === 'amber');
    const overallHealth = hasRed ? 'red' : hasAmber ? 'amber' : 'green';

    const selectedClient = clients.find(cl => cl.id === filterClientId);
    const selectedBrand = brands.find(b => b.id === filterBrandId);

    const firstCamp = availableCampaigns[0]?.campaign;

    return {
      campaign: {
        id: 'all_filtered',
        agency_id: currentAgency?.id || '',
        client_id: filterClientId || '',
        brand_id: filterBrandId || '',
        name: `All Filtered Campaigns (${availableCampaigns.length})`,
        description: 'Blended overview of all active campaigns matching selected filters',
        objective: 'Blended Performance',
        start_date: firstCamp?.start_date || '2026-09-01',
        end_date: firstCamp?.end_date || '2026-09-30',
        total_budget: totalBudget,
        currency: firstCamp?.currency || 'LKR',
        status: 'active',
        created_at: '',
        updated_at: ''
      },
      client_name: selectedClient ? selectedClient.name : 'All Clients',
      brand_name: selectedBrand ? selectedBrand.name : 'All Brands',
      total_budget: totalBudget,
      total_spend: totalSpend,
      budget_used_percentage: totalBudget > 0 ? (totalSpend / totalBudget) * 100 : 0,
      budget_remaining: totalBudget - totalSpend,
      expected_spend: expectedSpend,
      overall_pacing: expectedSpend > 0 ? (totalSpend / expectedSpend) * 100 : 100,
      projected_final_spend: totalSpend,
      overall_health: overallHealth,
      total_impressions: totalImpr,
      total_reach: totalReach,
      total_clicks: totalClicks,
      blended_ctr: totalImpr > 0 ? (totalClicks / totalImpr) * 100 : 0,
      blended_cpm: totalImpr > 0 ? (totalSpend / totalImpr) * 1000 : 0,
      total_conversions: totalConv,
      blended_cpa: totalConv > 0 ? totalSpend / totalConv : 0,
      total_conversion_value: totalConvVal,
      total_video_views: totalVideo,
      platforms: aggregatedPlatforms
    };
  }, [availableCampaigns, filterClientId, filterBrandId, clients, brands, currentAgency]);

  // Resolved active campaign metrics: specific campaign if chosen, or aggregated if "All Campaigns"
  const activeCampaignMetrics = selectedCampaignId
    ? campaigns.find(c => c.campaign.id === selectedCampaignId)
    : allCampaignsMetrics;

  const isAllCampaignsView = !selectedCampaignId;

  return (
    <div className="space-y-6">
      {/* Top Filter Bar: Replaces Breadcrumbs with Client, Brand, Campaign filters */}
      <div className="bg-white border border-slate-200 rounded-2xl p-3.5 sm:p-4 shadow-2xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          {/* Filters: Client, Brand, Campaign */}
          <div className="flex flex-wrap items-center gap-2.5 flex-1">
            {/* Client Filter Dropdown */}
            <div className="flex items-center gap-2 bg-slate-50 hover:bg-slate-100/80 border border-slate-200/90 rounded-xl px-3 py-2 transition-colors min-w-[170px] flex-1 sm:flex-initial">
              <Building2 className="w-4 h-4 text-indigo-600 shrink-0" />
              <div className="flex flex-col min-w-0 flex-1">
                <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider leading-none mb-1">
                  Client
                </span>
                <select
                  id="filter-client-select"
                  value={filterClientId}
                  onChange={e => {
                    const newClient = e.target.value;
                    setFilterClientId(newClient);
                    setFilterBrandId('');
                    setSelectedCampaignId('');
                  }}
                  className="bg-transparent text-xs font-bold text-slate-800 outline-none cursor-pointer truncate pr-1"
                >
                  <option value="">All Clients ({clients.length})</option>
                  {clients.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Brand Filter Dropdown */}
            <div className="flex items-center gap-2 bg-slate-50 hover:bg-slate-100/80 border border-slate-200/90 rounded-xl px-3 py-2 transition-colors min-w-[170px] flex-1 sm:flex-initial">
              <Layers className="w-4 h-4 text-purple-600 shrink-0" />
              <div className="flex flex-col min-w-0 flex-1">
                <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider leading-none mb-1">
                  Brand
                </span>
                <select
                  id="filter-brand-select"
                  value={filterBrandId}
                  onChange={e => {
                    const newBrand = e.target.value;
                    setFilterBrandId(newBrand);
                    setSelectedCampaignId('');
                    if (newBrand) {
                      const brandObj = brands.find(b => b.id === newBrand);
                      if (brandObj && !filterClientId) {
                        setFilterClientId(brandObj.client_id);
                      }
                    }
                  }}
                  className="bg-transparent text-xs font-bold text-slate-800 outline-none cursor-pointer truncate pr-1"
                >
                  <option value="">All Brands ({availableBrands.length})</option>
                  {availableBrands.map(b => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Campaign Filter Dropdown */}
            <div className="flex items-center gap-2 bg-slate-50 hover:bg-slate-100/80 border border-slate-200/90 rounded-xl px-3 py-2 transition-colors min-w-[210px] flex-1 sm:flex-initial">
              <Target className="w-4 h-4 text-emerald-600 shrink-0" />
              <div className="flex flex-col min-w-0 flex-1">
                <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider leading-none mb-1">
                  Campaign
                </span>
                <select
                  id="filter-campaign-select"
                  value={selectedCampaignId}
                  onChange={e => {
                    const campId = e.target.value;
                    setSelectedCampaignId(campId);
                    if (campId) {
                      const campObj = campaigns.find(c => c.campaign.id === campId);
                      if (campObj) {
                        selectCampaign(campId, campObj.campaign.client_id, campObj.campaign.brand_id);
                        if (!filterClientId) setFilterClientId(campObj.campaign.client_id);
                        if (!filterBrandId) setFilterBrandId(campObj.campaign.brand_id);
                      }
                    } else {
                      selectCampaign('', '', '');
                    }
                  }}
                  className="bg-transparent text-xs font-bold text-slate-800 outline-none cursor-pointer truncate pr-1"
                >
                  <option value="">All Campaigns ({availableCampaigns.length})</option>
                  {availableCampaigns.map(c => (
                    <option key={c.campaign.id} value={c.campaign.id}>
                      {c.campaign.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Reset Filter Button if active */}
            {(filterClientId || filterBrandId || selectedCampaignId) && (
              <button
                type="button"
                onClick={() => {
                  setFilterClientId('');
                  setFilterBrandId('');
                  setSelectedCampaignId('');
                  selectCampaign('', '', '');
                }}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors shrink-0"
              >
                <X className="w-3.5 h-3.5" />
                <span>Clear Filters</span>
              </button>
            )}
          </div>

          {/* Right Action buttons */}
          <div className="flex items-center gap-2 shrink-0 self-end lg:self-center">
            <button
              onClick={loadData}
              title="Refresh campaign metrics"
              className="p-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-100 transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
            </button>

            {onOpenCreateCampaign && (
              <button
                onClick={onOpenCreateCampaign}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-700 shadow-2xs transition-colors"
              >
                <PlusCircle className="w-4 h-4" />
                <span>New Campaign</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Main Drill-Down Body */}
      {loading ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center text-slate-500 space-y-3">
          <RefreshCw className="w-6 h-6 animate-spin mx-auto text-indigo-600" />
          <p className="text-sm font-medium">Calculating multi-platform drill-down metrics...</p>
        </div>
      ) : error ? (
        <div className="bg-rose-50 border border-rose-200 rounded-2xl p-6 text-rose-800 text-xs flex flex-col sm:flex-row items-center justify-between gap-3">
          <div>
            <strong className="block text-rose-900 text-sm mb-0.5">Failed to load campaign hierarchy</strong>
            <span>{error}</span>
          </div>
          <button
            onClick={() => loadData()}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-rose-700 hover:bg-rose-800 text-white rounded-lg text-xs font-bold transition-colors shrink-0 shadow-xs cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Retry</span>
          </button>
        </div>
      ) : !activeCampaignMetrics ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center space-y-4">
          <Briefcase className="w-10 h-10 text-slate-300 mx-auto" />
          <div>
            <h4 className="text-base font-bold text-slate-900">No Campaigns Found</h4>
            <p className="text-xs text-slate-500 mt-1">
              {filterClientId || filterBrandId
                ? 'No campaigns match the selected client or brand filters. Try selecting All or adjust your filters.'
                : 'No campaigns have been created yet. Create a business campaign to start tracking.'}
            </p>
          </div>
          {onOpenCreateCampaign && (
            <button
              onClick={onOpenCreateCampaign}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white rounded-lg text-xs font-semibold hover:bg-indigo-700 shadow-xs"
            >
              <PlusCircle className="w-4 h-4" />
              <span>Create Campaign</span>
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-8">
          {/* Level 1: Campaign Overview */}
          <section aria-labelledby="campaign-overview-heading">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                {isAllCampaignsView ? 'Level 1: Blended Aggregated View' : 'Level 1: Campaign Aggregated View'}
              </span>
              {!isAllCampaignsView && onOpenCreateLineItem && (
                <button
                  onClick={() => onOpenCreateLineItem(activeCampaignMetrics.campaign.id)}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-800"
                >
                  <PlusCircle className="w-3.5 h-3.5" />
                  <span>Add Line Item</span>
                </button>
              )}
            </div>
            <CampaignOverview
              campaignMetrics={activeCampaignMetrics}
              onDrillDownPlatform={plat => selectPlatform(plat)}
              onCampaignUpdated={() => loadData()}
              onCampaignDeleted={() => {
                setSelectedCampaignId('');
                selectCampaign('', '', '');
                loadData();
              }}
            />
          </section>

          {/* If All Campaigns is selected, show the Campaign Breakdown Cards list */}
          {isAllCampaignsView && availableCampaigns.length > 1 && (
            <section className="space-y-3 pt-2 border-t border-slate-200/80">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Individual Campaigns in this Selection</h3>
                  <p className="text-xs text-slate-500">
                    Click any campaign to inspect its dedicated line items and platform breakdown
                  </p>
                </div>
                <span className="text-xs font-mono font-bold text-slate-500 bg-slate-100 px-2.5 py-1 rounded-lg">
                  {availableCampaigns.length} Campaigns
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
                {availableCampaigns.map(campItem => {
                  const c = campItem.campaign;
                  const curr = c.currency || 'LKR';
                  const budgetUsedPct = Math.round(campItem.budget_used_percentage || 0);

                  return (
                    <div
                      key={c.id}
                      onClick={() => {
                        setSelectedCampaignId(c.id);
                        selectCampaign(c.id, c.client_id, c.brand_id);
                        if (!filterClientId) setFilterClientId(c.client_id);
                        if (!filterBrandId) setFilterBrandId(c.brand_id);
                      }}
                      className="p-4 rounded-xl border border-slate-200 bg-white hover:border-indigo-300 hover:shadow-xs transition-all cursor-pointer group flex flex-col justify-between"
                    >
                      <div>
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <span className="font-bold text-xs text-slate-900 group-hover:text-indigo-600 transition-colors line-clamp-1">
                            {c.name}
                          </span>
                          <HealthBadge status={campItem.overall_health} />
                        </div>

                        <div className="flex items-center gap-1.5 text-[11px] text-slate-500 mb-3">
                          <span>{campItem.client_name}</span>
                          <span>•</span>
                          <span>{campItem.brand_name}</span>
                        </div>

                        <div className="space-y-2 mb-3">
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-slate-500">Spend / Budget</span>
                            <span className="font-bold text-slate-800">
                              {formatCurrencyMoney(campItem.total_spend, curr, 0)} / {formatCurrencyMoney(campItem.total_budget, curr, 0)}
                            </span>
                          </div>
                          <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${
                                budgetUsedPct > 100
                                  ? 'bg-rose-500'
                                  : budgetUsedPct > 85
                                  ? 'bg-amber-500'
                                  : 'bg-indigo-600'
                              }`}
                              style={{ width: `${Math.min(budgetUsedPct, 100)}%` }}
                            />
                          </div>
                          <div className="flex items-center justify-between text-[11px] text-slate-500">
                            <span>Pacing: <strong className="text-slate-700">{Math.round(campItem.overall_pacing || 100)}%</strong></span>
                            <span>{campItem.platforms?.length || 0} Platforms</span>
                          </div>
                        </div>
                      </div>

                      <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs text-indigo-600 font-semibold group-hover:translate-x-0.5 transition-transform">
                        <span>Inspect Campaign</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* Level 2 & Level 3: Platform Breakdown & Line-Item Details */}
          <section aria-labelledby="platform-breakdown-heading" className="pt-2 border-t border-slate-200/80">
            <PlatformBreakdown
              platforms={activeCampaignMetrics.platforms}
              currency={activeCampaignMetrics.campaign.currency}
              selectedPlatform={drillDown.platform}
              selectedLineItemId={drillDown.lineItemId}
              onSelectPlatform={selectPlatform}
              onSelectLineItem={selectLineItem}
              onConnectDataSource={lineItem => setConnectingLineItem(lineItem)}
              onOpenCreateLineItem={
                !isAllCampaignsView && onOpenCreateLineItem
                  ? () => onOpenCreateLineItem(activeCampaignMetrics.campaign.id)
                  : undefined
              }
            />
          </section>
        </div>
      )}

      {/* Connect Data Source Modal */}
      {connectingLineItem && currentAgency && (
        <ConnectDataSourceModal
          agencyId={currentAgency.id}
          lineItem={connectingLineItem}
          onClose={() => setConnectingLineItem(null)}
          onConnected={() => {
            setConnectingLineItem(null);
            loadData();
          }}
        />
      )}
    </div>
  );
};
