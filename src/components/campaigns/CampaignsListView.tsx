import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import { CampaignCalculatedMetrics } from '../../types';
import { ApiService } from '../../lib/api';
import { HealthBadge } from '../common/HealthBadge';
import { CampaignNameDisplay } from '../common/CampaignNameDisplay';
import { EditCampaignModal } from '../modals/EditCampaignModal';
import { ConfirmDeleteModal } from '../modals/ConfirmDeleteModal';
import {
  Target,
  PlusCircle,
  ArrowRight,
  RefreshCw,
  Search,
  Filter,
  Pencil,
  Trash2,
  LayoutGrid,
  List,
  Calendar,
  Building2,
  Award,
  Layers,
  TrendingUp,
  DollarSign,
  AlertTriangle,
  CheckCircle2,
  Clock,
  ArrowUpDown
} from 'lucide-react';

interface CampaignsListViewProps {
  onSelectCampaign: (campaignId: string, clientId?: string, brandId?: string) => void;
  onOpenCreateCampaign: () => void;
}

export const CampaignsListView: React.FC<CampaignsListViewProps> = ({
  onSelectCampaign,
  onOpenCreateCampaign
}) => {
  const { currentAgency } = useAuth();
  const [campaigns, setCampaigns] = useState<CampaignCalculatedMetrics[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [healthFilter, setHealthFilter] = useState('all');
  const [clientFilter, setClientFilter] = useState('all');
  const [sortBy, setSortBy] = useState<'spend_desc' | 'budget_desc' | 'pacing_desc' | 'name_asc' | 'date_asc'>('spend_desc');
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');

  const [campaignToEdit, setCampaignToEdit] = useState<CampaignCalculatedMetrics | null>(null);
  const [campaignToDelete, setCampaignToDelete] = useState<CampaignCalculatedMetrics | null>(null);

  const loadCampaigns = async () => {
    if (!currentAgency) return;
    setLoading(true);
    try {
      const list = await ApiService.getCampaigns(currentAgency.id);
      setCampaigns(list);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCampaigns();

    const handleRefresh = () => {
      loadCampaigns();
    };
    window.addEventListener('refresh-omnitrack', handleRefresh);
    window.addEventListener('campaigns-updated', handleRefresh);
    return () => {
      window.removeEventListener('refresh-omnitrack', handleRefresh);
      window.removeEventListener('campaigns-updated', handleRefresh);
    };
  }, [currentAgency]);

  // Unique clients for filter dropdown
  const uniqueClients = useMemo(() => {
    const map = new Map<string, string>();
    campaigns.forEach(c => {
      if (c.campaign.client_id && c.client_name) {
        map.set(c.campaign.client_id, c.client_name);
      }
    });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [campaigns]);

  // Aggregated Portfolio Stats
  const portfolioSummary = useMemo(() => {
    // Campaigns can each be in a different currency, so the portfolio totals sum
    // the base-currency figures rather than the raw ones.
    const totalBudget = campaigns.reduce((acc, c) => acc + (c.total_budget_base ?? c.total_budget ?? 0), 0);
    const totalSpend = campaigns.reduce((acc, c) => acc + (c.total_spend_base ?? c.total_spend ?? 0), 0);
    const greenCount = campaigns.filter(c => c.overall_health === 'green').length;
    const amberCount = campaigns.filter(c => c.overall_health === 'amber').length;
    const redCount = campaigns.filter(c => c.overall_health === 'red').length;
    const currency = campaigns[0]?.base_currency || campaigns[0]?.campaign.currency || 'USD';

    return {
      totalCampaigns: campaigns.length,
      totalBudget,
      totalSpend,
      greenCount,
      amberCount,
      redCount,
      currency
    };
  }, [campaigns]);

  // Filter and sort campaigns
  const filteredAndSorted = useMemo(() => {
    const filtered = campaigns.filter(c => {
      if (healthFilter !== 'all' && c.overall_health !== healthFilter) return false;
      if (clientFilter !== 'all' && c.campaign.client_id !== clientFilter) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const matchesName = c.campaign.name.toLowerCase().includes(q);
        const matchesClient = c.client_name.toLowerCase().includes(q);
        const matchesBrand = c.brand_name.toLowerCase().includes(q);
        const matchesDesc = (c.campaign.description || '').toLowerCase().includes(q);
        if (!matchesName && !matchesClient && !matchesBrand && !matchesDesc) {
          return false;
        }
      }
      return true;
    });

    return filtered.sort((a, b) => {
      if (sortBy === 'spend_desc') {
        return (b.total_spend || 0) - (a.total_spend || 0);
      }
      if (sortBy === 'budget_desc') {
        return (b.total_budget || 0) - (a.total_budget || 0);
      }
      if (sortBy === 'pacing_desc') {
        return (b.overall_pacing || 0) - (a.overall_pacing || 0);
      }
      if (sortBy === 'name_asc') {
        return a.campaign.name.localeCompare(b.campaign.name);
      }
      if (sortBy === 'date_asc') {
        return new Date(a.campaign.end_date).getTime() - new Date(b.campaign.end_date).getTime();
      }
      return 0;
    });
  }, [campaigns, healthFilter, clientFilter, searchQuery, sortBy]);

  const getPacingBadge = (pacing: number) => {
    if (pacing < 70 || pacing > 130) {
      return {
        bg: 'bg-rose-50 text-rose-700 border-rose-200/90',
        label: pacing > 130 ? 'Overpacing' : 'Underpacing'
      };
    }
    if (pacing < 85 || pacing > 115) {
      return {
        bg: 'bg-amber-50 text-amber-800 border-amber-200/90',
        label: pacing > 115 ? 'Mild Overspend' : 'Mild Lag'
      };
    }
    return {
      bg: 'bg-emerald-50 text-emerald-700 border-emerald-200/90',
      label: 'On Track'
    };
  };

  const getPlatformStyle = (platform: string) => {
    const p = platform.toLowerCase();
    if (p.includes('meta') || p.includes('facebook') || p.includes('insta')) {
      return 'bg-blue-50 text-blue-700 border-blue-200';
    }
    if (p.includes('google') || p.includes('search') || p.includes('youtube')) {
      return 'bg-amber-50 text-amber-700 border-amber-200';
    }
    if (p.includes('tiktok')) {
      return 'bg-slate-900 text-white border-slate-900';
    }
    return 'bg-indigo-50 text-indigo-700 border-indigo-200';
  };

  return (
    <div className="space-y-6">
      {/* Header & Portfolio Performance Summary Banner */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-5 sm:p-6 shadow-2xs flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
              <Target className="w-6 h-6 text-indigo-600" />
              Active Campaigns
            </h2>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-200/80">
              {portfolioSummary.totalCampaigns} Live
            </span>
          </div>
          <p className="text-xs text-slate-500 max-w-xl">
            Monitor real-time pacing, budget consumption, and performance deliverables across all active client flights.
          </p>
        </div>

        {/* Portfolio Snapshot Metrics */}
        <div className="flex flex-wrap items-center gap-3 sm:gap-4">
          <div className="bg-slate-50 border border-slate-200/90 rounded-xl px-3.5 py-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
              Portfolio Budget
            </span>
            <span className="text-sm font-extrabold text-slate-900">
              {portfolioSummary.currency} {portfolioSummary.totalBudget.toLocaleString()}
            </span>
          </div>

          <div className="bg-slate-50 border border-slate-200/90 rounded-xl px-3.5 py-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
              Incurred Spend
            </span>
            <span className="text-sm font-extrabold text-slate-900">
              {portfolioSummary.currency} {portfolioSummary.totalSpend.toLocaleString()}
            </span>
          </div>

          {/* Health Pills */}
          <div className="bg-slate-50 border border-slate-200/90 rounded-xl px-3.5 py-2 flex items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mr-1">
              Health:
            </span>
            <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700" title="On Track">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              {portfolioSummary.greenCount}
            </span>
            <span className="inline-flex items-center gap-1 text-xs font-bold text-amber-700" title="Needs Attention">
              <span className="w-2 h-2 rounded-full bg-amber-500" />
              {portfolioSummary.amberCount}
            </span>
            <span className="inline-flex items-center gap-1 text-xs font-bold text-rose-700" title="Critical Risk">
              <span className="w-2 h-2 rounded-full bg-rose-500" />
              {portfolioSummary.redCount}
            </span>
          </div>

          <button
            onClick={onOpenCreateCampaign}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-indigo-700 shadow-xs hover:shadow transition-all cursor-pointer"
          >
            <PlusCircle className="w-4 h-4" />
            <span>New Campaign</span>
          </button>
        </div>
      </div>

      {/* Filter and Search Controls Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-white p-3 sm:p-4 rounded-2xl border border-slate-200 shadow-2xs">
        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search campaign name, client, brand, or code..."
            className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-xl text-xs outline-none bg-slate-50/60 focus:bg-white focus:border-indigo-500 transition-colors"
          />
        </div>

        {/* Dropdowns & View Switcher */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Client Filter */}
          {uniqueClients.length > 1 && (
            <select
              value={clientFilter}
              onChange={e => setClientFilter(e.target.value)}
              className="px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 bg-white outline-none focus:border-indigo-500"
            >
              <option value="all">All Clients ({uniqueClients.length})</option>
              {uniqueClients.map(c => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          )}

          {/* Health Status Filter */}
          <div className="flex items-center gap-1.5">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={healthFilter}
              onChange={e => setHealthFilter(e.target.value)}
              className="px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 bg-white outline-none focus:border-indigo-500"
            >
              <option value="all">All Health Statuses</option>
              <option value="green">On Track (Green)</option>
              <option value="amber">Needs Attention (Amber)</option>
              <option value="red">Critical Risk (Red)</option>
            </select>
          </div>

          {/* Sort By */}
          <div className="flex items-center gap-1.5">
            <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value as any)}
              className="px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 bg-white outline-none focus:border-indigo-500"
            >
              <option value="spend_desc">Highest Spend</option>
              <option value="budget_desc">Highest Budget</option>
              <option value="pacing_desc">Pacing %</option>
              <option value="date_asc">Ending Soonest</option>
              <option value="name_asc">Name (A-Z)</option>
            </select>
          </div>

          {/* Refresh button */}
          <button
            onClick={loadCampaigns}
            title="Refresh Campaigns"
            className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>

          {/* View Mode Switcher: Cards vs Table */}
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

      {/* Content Area */}
      {loading ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-slate-400 shadow-2xs">
          <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-indigo-500" />
          <p className="text-xs font-semibold">Loading active campaigns...</p>
        </div>
      ) : filteredAndSorted.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-slate-500 shadow-2xs">
          <Target className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <h3 className="text-sm font-bold text-slate-800">No matching campaigns found</h3>
          <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
            Try adjusting your search filter or health status to view other flights.
          </p>
          <button
            onClick={() => {
              setSearchQuery('');
              setHealthFilter('all');
              setClientFilter('all');
            }}
            className="mt-4 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-colors cursor-pointer"
          >
            Clear Filters
          </button>
        </div>
      ) : viewMode === 'table' ? (
        /* =================== COMPACT TABLE VIEW =================== */
        <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-[10px] uppercase font-bold text-slate-500 tracking-wider">
                  <th className="py-3 px-4 min-w-[280px]">Campaign Hierarchy</th>
                  <th className="py-3 px-4">Client & Brand</th>
                  <th className="py-3 px-4">Flight Window</th>
                  <th className="py-3 px-4 text-right">Allocated Budget</th>
                  <th className="py-3 px-4 text-right">Total Spend</th>
                  <th className="py-3 px-4 text-center">Pacing %</th>
                  <th className="py-3 px-4">Channels</th>
                  <th className="py-3 px-4 text-center">Health</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {filteredAndSorted.map(item => {
                  const currency = item.campaign.currency || 'USD';
                  const pacing = item.overall_pacing ?? 0;
                  const pacingBadge = getPacingBadge(pacing);

                  return (
                    <tr
                      key={item.campaign.id}
                      onClick={() =>
                        onSelectCampaign(
                          item.campaign.id,
                          item.campaign.client_id,
                          item.campaign.brand_id
                        )
                      }
                      className="hover:bg-slate-50/80 cursor-pointer transition-colors"
                    >
                      <td className="py-3.5 px-4 align-top">
                        <CampaignNameDisplay
                          rawName={item.campaign.name}
                          nameLabel="Campaign Name"
                          compact={true}
                        />
                        <div className="flex items-center gap-2 text-[10px] text-slate-400 font-mono mt-1">
                          <span>ID: {item.campaign.id}</span>
                          {item.campaign.objective && (
                            <span className="text-slate-500 font-sans">• {item.campaign.objective}</span>
                          )}
                        </div>
                      </td>

                      <td className="py-3.5 px-4 align-top whitespace-nowrap">
                        <span className="font-bold text-slate-900 block">{item.client_name}</span>
                        <span className="text-[11px] text-slate-500">{item.brand_name}</span>
                      </td>

                      <td className="py-3.5 px-4 align-top whitespace-nowrap text-slate-500 text-[11px]">
                        <span className="block font-medium text-slate-700">{item.campaign.start_date}</span>
                        <span className="text-slate-400">→ {item.campaign.end_date}</span>
                      </td>

                      <td className="py-3.5 px-4 align-top whitespace-nowrap text-right font-bold text-slate-900">
                        {currency} {item.total_budget.toLocaleString()}
                      </td>

                      <td className="py-3.5 px-4 align-top whitespace-nowrap text-right">
                        <span className="font-bold text-slate-900 block">
                          {currency} {(item.total_spend ?? 0).toLocaleString()}
                        </span>
                        <span className="text-[10px] text-slate-400 block">
                          {(item.budget_used_percentage ?? 0).toFixed(0)}% utilized
                        </span>
                      </td>

                      <td className="py-3.5 px-4 align-top whitespace-nowrap text-center">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold border ${pacingBadge.bg}`}>
                          {pacing.toFixed(0)}%
                        </span>
                      </td>

                      <td className="py-3.5 px-4 align-top whitespace-nowrap">
                        <div className="flex flex-wrap items-center gap-1">
                          {item.platforms.length > 0 ? (
                            item.platforms.map(p => (
                              <span
                                key={p.platform}
                                className={`text-[10px] font-bold px-2 py-0.5 rounded-md border uppercase ${getPlatformStyle(p.platform)}`}
                              >
                                {p.platform}
                              </span>
                            ))
                          ) : (
                            <span className="text-[11px] text-slate-400 italic">No channels</span>
                          )}
                        </div>
                      </td>

                      <td className="py-3.5 px-4 align-top whitespace-nowrap text-center">
                        <HealthBadge status={item.overall_health} size="sm" />
                      </td>

                      <td className="py-3.5 px-4 align-top whitespace-nowrap text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={e => {
                              e.stopPropagation();
                              setCampaignToEdit(item);
                            }}
                            className="p-1.5 text-slate-400 hover:text-indigo-600 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
                            title="Edit Campaign"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={e => {
                              e.stopPropagation();
                              setCampaignToDelete(item);
                            }}
                            className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition-colors cursor-pointer"
                            title="Delete Campaign"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                          <span className="text-xs font-bold text-indigo-600 hover:text-indigo-900 inline-flex items-center gap-1 pl-1">
                            <span>Inspect</span>
                            <ArrowRight className="w-3.5 h-3.5" />
                          </span>
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
          {filteredAndSorted.map(item => {
            const currency = item.campaign.currency || 'USD';
            const pacing = item.overall_pacing ?? 0;
            const pacingBadge = getPacingBadge(pacing);
            const ctr = (item.blended_ctr ?? 0).toFixed(2);

            return (
              <div
                key={item.campaign.id}
                onClick={() =>
                  onSelectCampaign(
                    item.campaign.id,
                    item.campaign.client_id,
                    item.campaign.brand_id
                  )
                }
                className="bg-white rounded-2xl border border-slate-200 shadow-2xs hover:border-slate-300 hover:shadow-xs transition-all overflow-hidden cursor-pointer group"
              >
                {/* 1. Card Top Bar: Client/Brand, Health, Pacing, Platforms & Actions */}
                <div className="p-4 sm:p-5 border-b border-slate-100 bg-slate-50/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    {/* Client & Brand Badge */}
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold bg-white text-slate-800 border border-slate-200/90 shadow-2xs">
                      <Building2 className="w-3.5 h-3.5 text-slate-400" />
                      <span>{item.client_name}</span>
                      <span className="text-slate-300">•</span>
                      <span className="text-indigo-600 font-semibold">{item.brand_name}</span>
                    </span>

                    {/* Health Badge */}
                    <HealthBadge status={item.overall_health} size="sm" />

                    {/* Overall Pacing Pill */}
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-extrabold border ${pacingBadge.bg}`}>
                      <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70" />
                      <span>{pacing.toFixed(0)}% Pacing</span>
                      <span className="text-[10px] font-normal opacity-80">({pacingBadge.label})</span>
                    </span>

                    {/* Campaign Rating Score if available */}
                    {item.campaign_rating_score != null && (
                      <span
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-white text-slate-700 border border-slate-200/90 shadow-2xs"
                        title="Campaign Performance Score"
                      >
                        <Award className="w-3 h-3 text-indigo-500" />
                        <span>Rating: {item.campaign_rating_score}/100</span>
                      </span>
                    )}

                    {/* Platform Chips */}
                    {item.platforms.map(p => (
                      <span
                        key={p.platform}
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-md border uppercase ${getPlatformStyle(p.platform)}`}
                      >
                        {p.platform}
                      </span>
                    ))}

                    {/* Objective Badge */}
                    {item.campaign.objective && (
                      <span className="text-[11px] font-bold text-slate-600 bg-white px-2 py-0.5 rounded-lg border border-slate-200 shadow-2xs">
                        {item.campaign.objective}
                      </span>
                    )}
                  </div>

                  {/* Actions (Right) */}
                  <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
                    <button
                      type="button"
                      onClick={e => {
                        e.stopPropagation();
                        setCampaignToEdit(item);
                      }}
                      className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-slate-200/70 rounded-xl transition-colors cursor-pointer"
                      title="Edit Campaign"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>

                    <button
                      type="button"
                      onClick={e => {
                        e.stopPropagation();
                        setCampaignToDelete(item);
                      }}
                      className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-colors cursor-pointer"
                      title="Delete Campaign"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>

                    <div className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-indigo-50 text-indigo-700 group-hover:bg-indigo-600 group-hover:text-white rounded-xl text-xs font-bold shadow-2xs transition-all">
                      <span>Inspect</span>
                      <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                    </div>
                  </div>
                </div>

                {/* 2. Card Body: Campaign Name Hierarchy & Structured Attribute Chips (Full Width) */}
                <div className="p-5 sm:p-6">
                  <CampaignNameDisplay
                    rawName={item.campaign.name}
                    nameLabel="Campaign Name"
                    rawLabel="Full Campaign Name"
                  />

                  {/* Campaign Description / Notes */}
                  {item.campaign.description && (
                    <p className="text-xs text-slate-500 mt-3 line-clamp-2 leading-relaxed">
                      {item.campaign.description}
                    </p>
                  )}
                </div>

                {/* 3. Card Bottom: Balanced 5-Column Performance Metrics Ribbon */}
                <div className="bg-slate-50/90 border-t border-slate-200/90 px-5 sm:px-6 py-3.5 grid grid-cols-2 sm:grid-cols-5 gap-4 items-center">
                  {/* Column 1: Allocated Budget */}
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-0.5">
                      Allocated Budget
                    </span>
                    <span className="text-base sm:text-lg font-black text-slate-900">
                      {currency} {item.total_budget.toLocaleString()}
                    </span>
                  </div>

                  {/* Column 2: Incurred Spend */}
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-0.5">
                      Total Spend
                    </span>
                    <div className="text-xs font-bold text-slate-800">
                      {currency} {(item.total_spend ?? 0).toLocaleString()}
                    </div>
                    <span className="text-[10px] text-slate-500 block">
                      {(item.budget_used_percentage ?? 0).toFixed(0)}% utilized
                    </span>
                  </div>

                  {/* Column 3: Pacing & Expected */}
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-0.5">
                      Pacing Velocity
                    </span>
                    <div className={`text-xs font-black ${
                      pacing < 70 || pacing > 130 ? 'text-rose-600' : pacing < 85 || pacing > 115 ? 'text-amber-600' : 'text-emerald-600'
                    }`}>
                      {pacing.toFixed(0)}% Expected
                    </div>
                    <span className="text-[10px] text-slate-400 block">
                      Exp: {currency} {Math.round(item.expected_spend ?? 0).toLocaleString()}
                    </span>
                  </div>

                  {/* Column 4: Delivery / Impressions */}
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-0.5">
                      Delivery & Engagement
                    </span>
                    <div className="text-xs font-bold text-slate-800">
                      {(item.total_impressions ?? 0).toLocaleString()} <span className="font-normal text-slate-400">imp</span>
                    </div>
                    <span className="text-[10px] text-indigo-600 font-semibold block">
                      {ctr}% CTR ({(item.total_clicks ?? 0).toLocaleString()} clicks)
                    </span>
                  </div>

                  {/* Column 5: Flight Window */}
                  <div className="col-span-2 sm:col-span-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-0.5">
                      Flight Window
                    </span>
                    <div className="text-xs font-medium text-slate-700 flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span className="truncate">
                        {item.campaign.start_date} → {item.campaign.end_date}
                      </span>
                    </div>
                    <span className="text-[10px] text-slate-400 block mt-0.5">
                      {item.platforms.length} platform channel{item.platforms.length === 1 ? '' : 's'}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Edit Campaign Modal */}
      {campaignToEdit && (
        <EditCampaignModal
          campaign={campaignToEdit.campaign}
          clientName={campaignToEdit.client_name}
          brandName={campaignToEdit.brand_name}
          onClose={() => setCampaignToEdit(null)}
          onUpdated={() => {
            setCampaignToEdit(null);
            loadCampaigns();
            window.dispatchEvent(new CustomEvent('refresh-omnitrack'));
            window.dispatchEvent(new CustomEvent('campaigns-updated'));
          }}
        />
      )}

      {/* Confirm Delete Campaign Modal */}
      {campaignToDelete && (
        <ConfirmDeleteModal
          title="Delete Campaign"
          itemName={campaignToDelete.campaign.name}
          itemType="Campaign"
          warningDetails={`Deleting "${campaignToDelete.campaign.name}" will permanently delete this campaign, its line items, daily performance metrics, and all mapped connections.`}
          onClose={() => setCampaignToDelete(null)}
          onConfirm={async () => {
            if (!currentAgency) return;
            await ApiService.deleteCampaign(currentAgency.id, campaignToDelete.campaign.id);
            setCampaignToDelete(null);
            loadCampaigns();
            window.dispatchEvent(new CustomEvent('refresh-omnitrack'));
            window.dispatchEvent(new CustomEvent('campaigns-updated'));
          }}
        />
      )}
    </div>
  );
};
