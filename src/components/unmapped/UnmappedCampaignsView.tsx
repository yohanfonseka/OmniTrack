import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { ApiService } from '../../lib/api';
import { UnmappedCampaign } from '../../types';
import { MapCampaignModal } from './MapCampaignModal';
import { CampaignNameDisplay } from './CampaignNameDisplay';
import {
  Link2,
  Unlink,
  RefreshCw,
  UploadCloud,
  Search,
  Filter,
  CheckCircle2,
  AlertTriangle,
  ArrowUpDown,
  Copy,
  Check,
  Calendar,
  DollarSign,
  Eye,
  MousePointer,
  Target,
  Trash2,
  XCircle,
  Sparkles,
  ExternalLink,
  Layers,
  ArrowRight,
  LayoutGrid,
  List
} from 'lucide-react';

interface UnmappedCampaignsViewProps {
  onNavigateToImports?: () => void;
  onNavigateToCampaigns?: () => void;
}

export const UnmappedCampaignsView: React.FC<UnmappedCampaignsViewProps> = ({
  onNavigateToImports,
  onNavigateToCampaigns
}) => {
  const { currentAgency, refreshUnmappedCount } = useAuth();

  const [campaigns, setCampaigns] = useState<UnmappedCampaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [pulling, setPulling] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [platformFilter, setPlatformFilter] = useState<string>('all');
  const [statusTab, setStatusTab] = useState<'unmapped' | 'mapped' | 'dismissed'>('unmapped');
  const [sortBy, setSortBy] = useState<'spend_desc' | 'date_desc' | 'impressions_desc' | 'name_asc'>('spend_desc');
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');

  // Modal State
  const [selectedForMapping, setSelectedForMapping] = useState<UnmappedCampaign | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const fetchCampaigns = useCallback(async () => {
    if (!currentAgency) return;
    setLoading(true);
    try {
      const data = await ApiService.getUnmappedCampaigns(currentAgency.id, statusTab);
      setCampaigns(data);
    } catch (err) {
      console.error('Failed to fetch unmapped campaigns', err);
    } finally {
      setLoading(false);
    }
  }, [currentAgency, statusTab]);

  useEffect(() => {
    fetchCampaigns();
  }, [fetchCampaigns]);

  // Listen to external updates
  useEffect(() => {
    const handleUpdate = () => {
      fetchCampaigns();
    };
    window.addEventListener('refresh-omnitrack', handleUpdate);
    window.addEventListener('campaigns-updated', handleUpdate);
    return () => {
      window.removeEventListener('refresh-omnitrack', handleUpdate);
      window.removeEventListener('campaigns-updated', handleUpdate);
    };
  }, [fetchCampaigns]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 4000);
  };

  // Pull Platform Data action
  const handlePullPlatformData = async () => {
    if (!currentAgency) return;
    setPulling(true);
    try {
      const res = await ApiService.pullPlatformData(currentAgency.id);
      showToast(`Successfully synced platforms! Pulled ${res.pulled_count} campaigns (${res.unmapped_count} unmapped ready for assignment).`);
      await fetchCampaigns();
      await refreshUnmappedCount();
      window.dispatchEvent(new CustomEvent('refresh-omnitrack'));
    } catch (err: any) {
      showToast(`Sync failed: ${err.message}`);
    } finally {
      setPulling(false);
    }
  };

  // Clear Platform Data action
  const handleClearPlatformData = async () => {
    if (!currentAgency) return;
    if (!window.confirm('Are you sure you want to clear all platform data? This will remove all unmapped campaigns, daily metrics, and platform data source mappings across the agency.')) {
      return;
    }
    setClearing(true);
    try {
      const res = await ApiService.clearPlatformData(currentAgency.id);
      showToast(`Platform data cleared successfully! (${res.details?.unmappedCleared || 0} unmapped campaigns removed).`);
      setCampaigns([]);
      await refreshUnmappedCount();
      window.dispatchEvent(new CustomEvent('refresh-omnitrack'));
      window.dispatchEvent(new CustomEvent('campaigns-updated'));
    } catch (err: any) {
      showToast(`Clear failed: ${err.message}`);
    } finally {
      setClearing(false);
    }
  };

  // Dismiss campaign
  const handleDismiss = async (campaign: UnmappedCampaign) => {
    if (!currentAgency) return;
    try {
      await ApiService.dismissUnmappedCampaign(currentAgency.id, campaign.id);
      showToast(`Campaign "${campaign.platform_campaign_name}" moved to dismissed.`);
      await fetchCampaigns();
      await refreshUnmappedCount();
    } catch (err: any) {
      showToast(`Error: ${err.message}`);
    }
  };

  // Delete campaign
  const handleDelete = async (campaign: UnmappedCampaign) => {
    if (!currentAgency) return;
    if (!window.confirm(`Permanently remove unmapped record for "${campaign.platform_campaign_name}"?`)) {
      return;
    }
    try {
      await ApiService.deleteUnmappedCampaign(currentAgency.id, campaign.id);
      showToast('Campaign record deleted.');
      await fetchCampaigns();
      await refreshUnmappedCount();
    } catch (err: any) {
      showToast(`Error: ${err.message}`);
    }
  };

  const [unlinkingId, setUnlinkingId] = useState<string | null>(null);

  const handleUnlink = async (campaign: UnmappedCampaign) => {
    const currencyStr = campaign.currency || 'USD';
    if (!window.confirm(
      `Unlink Campaign & Roll Back Totals?\n\nAre you sure you want to unlink "${campaign.platform_campaign_name}" from its mapped campaign?\n\nAll ad spend (${currencyStr} ${campaign.total_spend.toLocaleString()}) and associated performance metrics will be completely rolled back from the campaign totals and restored to the unmapped queue.`
    )) {
      return;
    }

    setUnlinkingId(campaign.id);
    try {
      const res = await ApiService.unmapCampaign(currentAgency!.id, campaign.id);
      showToast(res.message || `Unlinked "${campaign.platform_campaign_name}". Totals rolled back.`);
      window.dispatchEvent(new CustomEvent('refresh-omnitrack'));
      window.dispatchEvent(new CustomEvent('campaigns-updated'));
      await fetchCampaigns();
      await refreshUnmappedCount();
    } catch (err: any) {
      showToast(`Error: ${err.message || 'Failed to unlink campaign'}`);
    } finally {
      setUnlinkingId(null);
    }
  };

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(key);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Calculations for KPI summary bar
  const totalUnmappedSpend = campaigns
    .filter(c => c.status === 'unmapped')
    .reduce((acc, c) => acc + (c.total_spend || 0), 0);

  const totalUnmappedImpressions = campaigns
    .filter(c => c.status === 'unmapped')
    .reduce((acc, c) => acc + (c.total_impressions || 0), 0);

  const totalUnmappedConversions = campaigns
    .filter(c => c.status === 'unmapped')
    .reduce((acc, c) => acc + (c.total_conversions || 0), 0);

  // Filter & Sort
  const filteredCampaigns = campaigns
    .filter(c => {
      if (statusTab !== 'all' && c.status !== statusTab) {
        return false;
      }
      if (platformFilter !== 'all' && c.platform.toLowerCase() !== platformFilter.toLowerCase()) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesName = c.platform_campaign_name.toLowerCase().includes(q);
        const matchesId = c.platform_campaign_id.toLowerCase().includes(q);
        const matchesAcc = c.platform_account_id.toLowerCase().includes(q);
        const matchesAccName = c.platform_account_name ? c.platform_account_name.toLowerCase().includes(q) : false;
        return matchesName || matchesId || matchesAcc || matchesAccName;
      }
      return true;
    })
    .sort((a, b) => {
      switch (sortBy) {
        case 'spend_desc':
          return (b.total_spend || 0) - (a.total_spend || 0);
        case 'impressions_desc':
          return (b.total_impressions || 0) - (a.total_impressions || 0);
        case 'date_desc':
          return new Date(b.pulled_at).getTime() - new Date(a.pulled_at).getTime();
        case 'name_asc':
          return a.platform_campaign_name.localeCompare(b.platform_campaign_name);
        default:
          return 0;
      }
    });

  const getPlatformBadge = (platform: string) => {
    switch (platform.toLowerCase()) {
      case 'meta':
        return {
          label: 'Meta Ads',
          bg: 'bg-blue-50 text-blue-700 border-blue-200',
          dot: 'bg-blue-600'
        };
      case 'tiktok':
        return {
          label: 'TikTok Ads',
          bg: 'bg-slate-900 text-white border-slate-700',
          dot: 'bg-cyan-400'
        };
      case 'google':
        return {
          label: 'Google Ads',
          bg: 'bg-emerald-50 text-emerald-700 border-emerald-200',
          dot: 'bg-emerald-600'
        };
      default:
        return {
          label: platform.toUpperCase(),
          bg: 'bg-purple-50 text-purple-700 border-purple-200',
          dot: 'bg-purple-600'
        };
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900 text-white px-4 py-3 rounded-xl shadow-2xl flex items-center gap-3 border border-slate-700 animate-in fade-in slide-in-from-bottom-3 duration-200">
          <Sparkles className="w-4 h-4 text-indigo-400 shrink-0" />
          <span className="text-xs font-medium">{toastMessage}</span>
          <button
            onClick={() => setToastMessage(null)}
            className="text-slate-400 hover:text-white ml-2 text-xs"
          >
            ✕
          </button>
        </div>
      )}

      {/* View Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-2xs">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold text-slate-900">Unmapped Campaigns</h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-extrabold bg-amber-100 text-amber-800 border border-amber-200">
              {campaigns.filter(c => c.status === 'unmapped').length} Pending
            </span>
          </div>
          <p className="text-sm text-slate-500 mt-1 max-w-2xl leading-relaxed">
            Data pulled from advertising platforms (Meta, Google, TikTok) or CSV reports that does not match an existing system campaign. Assign them to an existing campaign or create a new one to immediately transfer all metrics.
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={handlePullPlatformData}
            disabled={pulling || clearing}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${pulling ? 'animate-spin' : ''}`} />
            <span>{pulling ? 'Syncing Platforms...' : 'Pull Platform Data'}</span>
          </button>

          <button
            onClick={handleClearPlatformData}
            disabled={clearing || pulling}
            className="inline-flex items-center gap-2 px-3.5 py-2.5 bg-white hover:bg-rose-50 text-rose-600 hover:text-rose-700 border border-slate-200 hover:border-rose-200 rounded-xl text-xs font-bold transition-all shadow-2xs disabled:opacity-50 cursor-pointer"
            title="Clear all platform ingested campaigns and metrics"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>{clearing ? 'Clearing...' : 'Clear Platform Data'}</span>
          </button>

          {onNavigateToImports && (
            <button
              onClick={onNavigateToImports}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 rounded-xl text-xs font-bold transition-colors cursor-pointer"
            >
              <UploadCloud className="w-3.5 h-3.5 text-slate-500" />
              <span>Import CSV</span>
            </button>
          )}
        </div>
      </div>

      {/* KPI Highlight Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
            Unassigned Campaigns
          </span>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-extrabold text-slate-900">
              {campaigns.filter(c => c.status === 'unmapped').length}
            </span>
            <span className="text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full font-bold">
              Action Required
            </span>
          </div>
          <p className="text-[11px] text-slate-500 mt-2">
            Awaiting mapping to business campaigns
          </p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
            Unassigned Ad Spend
          </span>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-extrabold text-indigo-600">
              LKR {totalUnmappedSpend.toLocaleString()}
            </span>
          </div>
          <p className="text-[11px] text-slate-500 mt-2">
            Spend waiting for budget attribution
          </p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
            Ingested Impressions
          </span>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-extrabold text-slate-900">
              {totalUnmappedImpressions.toLocaleString()}
            </span>
            <Eye className="w-4 h-4 text-slate-400" />
          </div>
          <p className="text-[11px] text-slate-500 mt-2">
            From connected platform API streams
          </p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
            Orphan Conversions
          </span>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-extrabold text-emerald-600">
              {totalUnmappedConversions.toLocaleString()}
            </span>
            <Target className="w-4 h-4 text-emerald-500" />
          </div>
          <p className="text-[11px] text-slate-500 mt-2">
            Ready to be credited to target KPI pacing
          </p>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Status Tabs */}
        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl shrink-0">
          <button
            onClick={() => setStatusTab('unmapped')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              statusTab === 'unmapped'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            Awaiting Mapping ({campaigns.filter(c => c.status === 'unmapped').length})
          </button>
          <button
            onClick={() => setStatusTab('mapped')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              statusTab === 'mapped'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            Previously Mapped
          </button>
          <button
            onClick={() => setStatusTab('dismissed')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              statusTab === 'dismissed'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            Dismissed
          </button>
        </div>

        {/* Search & Platform Filter & Sort & View Switcher */}
        <div className="flex flex-wrap items-center gap-3 flex-1 md:justify-end">
          <div className="relative flex-1 max-w-xs">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search by campaign name or ID..."
              className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div className="flex items-center gap-2">
            <select
              value={platformFilter}
              onChange={e => setPlatformFilter(e.target.value)}
              className="px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-700 font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="all">All Platforms</option>
              <option value="meta">Meta Ads</option>
              <option value="tiktok">TikTok Ads</option>
              <option value="google">Google Ads</option>
            </select>

            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value as any)}
              className="px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-700 font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="spend_desc">Highest Spend</option>
              <option value="impressions_desc">Most Impressions</option>
              <option value="date_desc">Recently Pulled</option>
              <option value="name_asc">Name (A-Z)</option>
            </select>

            {/* View Mode Toggle: Cards vs Table */}
            <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200">
              <button
                type="button"
                onClick={() => setViewMode('cards')}
                className={`p-1.5 rounded-lg text-xs transition-all cursor-pointer ${
                  viewMode === 'cards'
                    ? 'bg-white text-slate-900 shadow-2xs font-bold'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
                title="Structured Cards View"
              >
                <LayoutGrid className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setViewMode('table')}
                className={`p-1.5 rounded-lg text-xs transition-all cursor-pointer ${
                  viewMode === 'table'
                    ? 'bg-white text-slate-900 shadow-2xs font-bold'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
                title="Compact Table View"
              >
                <List className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Campaigns Listing */}
      {loading ? (
        <div className="p-12 text-center bg-white rounded-2xl border border-slate-200">
          <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-xs font-semibold text-slate-600">Loading unmapped campaigns...</p>
        </div>
      ) : filteredCampaigns.length === 0 ? (
        <div className="p-12 text-center bg-white rounded-2xl border border-slate-200 shadow-2xs">
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto mb-3">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <h3 className="text-base font-bold text-slate-900">
            {statusTab === 'unmapped' ? 'All Campaigns Are Mapped' : `No ${statusTab} campaigns found`}
          </h3>
          <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
            {statusTab === 'unmapped'
              ? 'Every campaign pulled from Meta, Google, and TikTok has been attributed to a system campaign. Pull fresh platform data or import a CSV to inspect new campaigns.'
              : 'There are currently no items in this filter.'}
          </p>
          {statusTab === 'unmapped' && (
            <div className="flex items-center justify-center gap-3 mt-5">
              <button
                onClick={handlePullPlatformData}
                disabled={pulling}
                className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${pulling ? 'animate-spin' : ''}`} />
                <span>Pull Fresh Ad Data</span>
              </button>
              {onNavigateToCampaigns && (
                <button
                  onClick={onNavigateToCampaigns}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold cursor-pointer"
                >
                  View Active Campaigns
                </button>
              )}
            </div>
          )}
        </div>
      ) : viewMode === 'table' ? (
        /* =================== COMPACT TABLE VIEW =================== */
        <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-[10px] uppercase font-bold text-slate-500 tracking-wider">
                  <th className="py-3 px-4">Platform</th>
                  <th className="py-3 px-4 min-w-[280px]">Campaign & Ad Set Hierarchy</th>
                  <th className="py-3 px-4">Account</th>
                  <th className="py-3 px-4">Flight Range</th>
                  <th className="py-3 px-4 text-right">Ad Spend</th>
                  <th className="py-3 px-4 text-right">Impressions / CTR</th>
                  <th className="py-3 px-4 text-right">Conversions</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {filteredCampaigns.map(camp => {
                  const badge = getPlatformBadge(camp.platform);
                  const ctr = camp.total_impressions > 0
                    ? ((camp.total_clicks / camp.total_impressions) * 100).toFixed(2)
                    : '0.00';
                  const cpa = camp.total_conversions > 0
                    ? Math.round(camp.total_spend / camp.total_conversions)
                    : 0;

                  return (
                    <tr key={camp.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-3.5 px-4 whitespace-nowrap align-top">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${badge.bg}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${badge.dot}`} />
                          {badge.label}
                        </span>
                      </td>

                      <td className="py-3.5 px-4 align-top">
                        <CampaignNameDisplay
                          rawName={camp.platform_campaign_name}
                          platformCampaignId={camp.platform_campaign_id}
                          compact={true}
                        />
                        <div className="flex items-center gap-1.5 text-[10px] font-mono text-slate-400 mt-1">
                          <span>ID: {camp.platform_campaign_id.slice(0, 16)}...</span>
                          <button
                            onClick={() => copyToClipboard(camp.platform_campaign_id, `t_cid_${camp.id}`)}
                            title="Copy ID"
                            className="text-slate-400 hover:text-slate-700"
                          >
                            {copiedId === `t_cid_${camp.id}` ? (
                              <Check className="w-2.5 h-2.5 text-emerald-600" />
                            ) : (
                              <Copy className="w-2.5 h-2.5" />
                            )}
                          </button>
                        </div>
                      </td>

                      <td className="py-3.5 px-4 whitespace-nowrap text-slate-600 align-top">
                        <span className="font-medium text-slate-800 block">{camp.platform_account_name || '—'}</span>
                        <span className="text-[10px] text-slate-400 font-mono">{camp.platform_account_id}</span>
                      </td>

                      <td className="py-3.5 px-4 whitespace-nowrap text-slate-500 align-top text-[11px]">
                        {camp.first_report_date && camp.last_report_date ? (
                          <>
                            <span className="block">{camp.first_report_date}</span>
                            <span className="text-slate-400">→ {camp.last_report_date}</span>
                          </>
                        ) : (
                          'Recent'
                        )}
                      </td>

                      <td className="py-3.5 px-4 whitespace-nowrap text-right align-top">
                        <span className="font-extrabold text-slate-900 block">
                          {camp.currency || 'USD'} {camp.total_spend.toLocaleString()}
                        </span>
                      </td>

                      <td className="py-3.5 px-4 whitespace-nowrap text-right align-top">
                        <span className="font-bold text-slate-800 block">
                          {camp.total_impressions.toLocaleString()}
                        </span>
                        <span className="text-[10px] text-indigo-600 font-semibold">
                          {ctr}% CTR ({camp.total_clicks.toLocaleString()} clicks)
                        </span>
                      </td>

                      <td className="py-3.5 px-4 whitespace-nowrap text-right align-top">
                        <span className="font-bold text-emerald-600 block">
                          {camp.total_conversions.toLocaleString()}
                        </span>
                        {cpa > 0 && (
                          <span className="text-[10px] text-slate-400 block">
                            CPA: {camp.currency || 'USD'} {cpa.toLocaleString()}
                          </span>
                        )}
                      </td>

                      <td className="py-3.5 px-4 whitespace-nowrap text-right align-top">
                        <div className="flex items-center justify-end gap-1.5">
                          {camp.status === 'unmapped' ? (
                            <button
                              onClick={() => setSelectedForMapping(camp)}
                              className="inline-flex items-center gap-1 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer shadow-2xs"
                            >
                              <Link2 className="w-3 h-3" />
                              <span>Map</span>
                            </button>
                          ) : camp.status === 'mapped' ? (
                            <button
                              onClick={() => handleUnlink(camp)}
                              disabled={unlinkingId === camp.id}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 rounded-lg border border-rose-200 transition-colors disabled:opacity-50 cursor-pointer shadow-2xs"
                              title="Unlink this campaign and roll back all associated spend and metrics from totals"
                            >
                              {unlinkingId === camp.id ? (
                                <RefreshCw className="w-3 h-3 animate-spin" />
                              ) : (
                                <Unlink className="w-3 h-3 text-rose-600" />
                              )}
                              <span>Unlink &amp; Roll Back</span>
                            </button>
                          ) : (
                            <span className="text-[11px] font-semibold text-slate-400 capitalize">
                              {camp.status}
                            </span>
                          )}

                          <button
                            onClick={() => handleDismiss(camp)}
                            title="Dismiss"
                            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                          >
                            <XCircle className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDelete(camp)}
                            title="Delete"
                            className="p-1.5 text-slate-300 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* =================== STRUCTURED CARDS VIEW =================== */
        <div className="space-y-5">
          {filteredCampaigns.map(camp => {
            const badge = getPlatformBadge(camp.platform);
            const ctr = camp.total_impressions > 0
              ? ((camp.total_clicks / camp.total_impressions) * 100).toFixed(2)
              : '0.00';
            const cpa = camp.total_conversions > 0
              ? Math.round(camp.total_spend / camp.total_conversions)
              : 0;

            const isMapped = camp.status === 'mapped';
            const isDismissed = camp.status === 'dismissed';

            return (
              <div
                key={camp.id}
                className="bg-white rounded-2xl border border-slate-200 shadow-2xs hover:border-slate-300 hover:shadow-xs transition-all overflow-hidden"
              >
                {/* 1. Card Top Bar: Platform Identity, Account, ID & Primary Actions */}
                <div className="p-4 sm:p-5 border-b border-slate-100 bg-slate-50/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    {/* Platform Badge */}
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-extrabold border ${badge.bg}`}>
                      <span className={`w-2 h-2 rounded-full ${badge.dot}`} />
                      {badge.label}
                    </span>

                    {/* Objective Badge */}
                    {camp.objective && (
                      <span className="text-[11px] font-bold text-slate-700 bg-white px-2.5 py-1 rounded-lg border border-slate-200/90 shadow-2xs">
                        {camp.objective}
                      </span>
                    )}

                    {/* Ad Account */}
                    {camp.platform_account_name && (
                      <span className="text-xs text-slate-600 bg-white px-2.5 py-1 rounded-lg border border-slate-200/90 shadow-2xs flex items-center gap-1">
                        <span className="text-[10px] uppercase font-bold text-slate-400">Account:</span>
                        <strong className="text-slate-800 font-semibold">{camp.platform_account_name}</strong>
                      </span>
                    )}

                    {/* Campaign Platform ID Pill */}
                    <span className="text-[11px] font-mono text-slate-500 bg-white px-2.5 py-1 rounded-lg border border-slate-200/90 shadow-2xs flex items-center gap-1.5">
                      <span className="text-slate-400">ID:</span>
                      <span className="max-w-[130px] sm:max-w-[180px] truncate" title={camp.platform_campaign_id}>
                        {camp.platform_campaign_id}
                      </span>
                      <button
                        onClick={() => copyToClipboard(camp.platform_campaign_id, `cid_${camp.id}`)}
                        title="Copy Campaign ID"
                        className="text-slate-400 hover:text-slate-700 cursor-pointer"
                      >
                        {copiedId === `cid_${camp.id}` ? (
                          <Check className="w-3 h-3 text-emerald-600" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                      </button>
                    </span>

                    {/* Mapped / Dismissed Status Pills */}
                    {isMapped && (
                      <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
                        <Check className="w-3 h-3 text-emerald-600" />
                        Mapped
                      </span>
                    )}
                    {isDismissed && (
                      <span className="text-xs font-bold text-slate-500 bg-slate-100 px-2.5 py-1 rounded-full border border-slate-200">
                        Dismissed
                      </span>
                    )}
                  </div>

                  {/* Actions Right */}
                  <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
                    {camp.status === 'unmapped' ? (
                      <>
                        <button
                          onClick={() => setSelectedForMapping(camp)}
                          className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-xs hover:shadow transition-all cursor-pointer"
                        >
                          <Link2 className="w-3.5 h-3.5" />
                          <span>Add to Campaign</span>
                        </button>

                        <button
                          onClick={() => handleDismiss(camp)}
                          title="Dismiss Campaign"
                          className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-200/70 rounded-xl transition-colors cursor-pointer"
                        >
                          <XCircle className="w-4 h-4" />
                        </button>
                      </>
                    ) : camp.status === 'mapped' ? (
                      <button
                        onClick={() => handleUnlink(camp)}
                        disabled={unlinkingId === camp.id}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl text-xs font-bold cursor-pointer transition-colors shadow-2xs"
                        title="Unlink this campaign and roll back all associated spend and metrics from totals"
                      >
                        {unlinkingId === camp.id ? (
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Unlink className="w-3.5 h-3.5 text-rose-600" />
                        )}
                        <span>Unlink &amp; Roll Back Totals</span>
                      </button>
                    ) : camp.status === 'dismissed' ? (
                      <button
                        onClick={() => setSelectedForMapping(camp)}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold cursor-pointer"
                      >
                        <Link2 className="w-3.5 h-3.5" />
                        <span>Map to Campaign</span>
                      </button>
                    ) : null}

                    <button
                      onClick={() => handleDelete(camp)}
                      title="Remove Record"
                      className="p-2 text-slate-300 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* 2. Card Body: Campaign Name Hierarchy & Structured Breakdown (Full Width) */}
                <div className="p-5 sm:p-6">
                  <CampaignNameDisplay
                    rawName={camp.platform_campaign_name}
                    platformCampaignId={camp.platform_campaign_id}
                  />

                  {/* If already mapped, show target info */}
                  {isMapped && camp.mapped_campaign_id && (
                    <div className="mt-4 p-3 bg-emerald-50/80 border border-emerald-200 rounded-xl text-xs text-emerald-900 flex items-center gap-2.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span>
                        Mapped to system campaign <strong className="font-semibold">{camp.mapped_campaign_id}</strong> (Line Item: {camp.mapped_line_item_id || 'Primary'}) on{' '}
                        {camp.mapped_at ? new Date(camp.mapped_at).toLocaleDateString() : 'Recently'}.
                      </span>
                    </div>
                  )}
                </div>

                {/* 3. Card Bottom: Balanced Performance Metrics Ribbon */}
                <div className="bg-slate-50/90 border-t border-slate-200/90 px-5 sm:px-6 py-3.5 grid grid-cols-2 sm:grid-cols-5 gap-4 items-center">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-0.5">
                      Total Ad Spend
                    </span>
                    <span className="text-base sm:text-lg font-black text-slate-900">
                      {camp.currency || 'USD'} {camp.total_spend.toLocaleString()}
                    </span>
                  </div>

                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-0.5">
                      Impressions & Reach
                    </span>
                    <div className="text-xs font-bold text-slate-800">
                      {camp.total_impressions.toLocaleString()} <span className="font-normal text-slate-400">imp</span>
                    </div>
                    {camp.metrics && camp.metrics[0]?.reach ? (
                      <span className="text-[10px] text-slate-500 block">
                        {Number(camp.metrics[0].reach).toLocaleString()} reach
                      </span>
                    ) : null}
                  </div>

                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-0.5">
                      Clicks & CTR
                    </span>
                    <div className="text-xs font-bold text-slate-800">
                      {camp.total_clicks.toLocaleString()} <span className="font-normal text-slate-400">clicks</span>
                    </div>
                    <span className="text-[10px] font-semibold text-indigo-600 block">
                      {ctr}% CTR
                    </span>
                  </div>

                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-0.5">
                      Conversions & CPA
                    </span>
                    <div className="text-xs font-bold text-emerald-600">
                      {camp.total_conversions.toLocaleString()} <span className="font-normal text-slate-400">conv</span>
                    </div>
                    {cpa > 0 ? (
                      <span className="text-[10px] text-slate-500 block font-normal">
                        CPA: {camp.currency || 'USD'} {cpa.toLocaleString()}
                      </span>
                    ) : null}
                  </div>

                  <div className="col-span-2 sm:col-span-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-0.5">
                      Activity Window
                    </span>
                    <div className="text-xs font-medium text-slate-700 flex items-center gap-1">
                      <Calendar className="w-3 h-3 text-slate-400 shrink-0" />
                      <span className="truncate">
                        {camp.first_report_date && camp.last_report_date
                          ? `${camp.first_report_date} → ${camp.last_report_date}`
                          : 'Recent activity'}
                      </span>
                    </div>
                    <span className="text-[10px] text-slate-400 block mt-0.5">
                      {camp.row_count || 1} daily report records
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Map to Campaign Modal */}
      {selectedForMapping && (
        <MapCampaignModal
          unmappedCampaign={selectedForMapping}
          isOpen={Boolean(selectedForMapping)}
          onClose={() => setSelectedForMapping(null)}
          onSuccess={(mappedId) => {
            const targetId = mappedId || selectedForMapping.id;
            setCampaigns(prev => prev.filter(c => c.id !== targetId));
            setSelectedForMapping(null);
            showToast(`Campaign dataset successfully mapped and removed from unmapped queue!`);
            fetchCampaigns();
            refreshUnmappedCount();
          }}
        />
      )}
    </div>
  );
};
