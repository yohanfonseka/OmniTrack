import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { CampaignCalculatedMetrics } from '../../types';
import { ApiService } from '../../lib/api';
import { HealthBadge } from '../common/HealthBadge';
import {
  Target,
  PlusCircle,
  ArrowRight,
  TrendingUp,
  DollarSign,
  AlertTriangle,
  RefreshCw,
  Search,
  Filter
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

  const filtered = campaigns.filter(c => {
    if (healthFilter !== 'all' && c.overall_health !== healthFilter) return false;
    if (
      searchQuery &&
      !c.campaign.name.toLowerCase().includes(searchQuery.toLowerCase()) &&
      !c.client_name.toLowerCase().includes(searchQuery.toLowerCase()) &&
      !c.brand_name.toLowerCase().includes(searchQuery.toLowerCase())
    ) {
      return false;
    }
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-6 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <Target className="w-5 h-5 text-indigo-600" />
            Active Campaigns
          </h2>
        </div>

        <button
          onClick={onOpenCreateCampaign}
          className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white rounded-lg text-xs font-semibold hover:bg-indigo-700 shadow-xs transition-colors self-start sm:self-center"
        >
          <PlusCircle className="w-4 h-4" />
          <span>New Campaign</span>
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="relative w-full sm:w-72">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search campaigns, clients, or brands..."
            className="w-full pl-8 pr-3 py-1.5 border border-slate-200 rounded-lg text-xs outline-none bg-white focus:border-indigo-500"
          />
        </div>

        <div className="flex items-center gap-2">
          <Filter className="w-3.5 h-3.5 text-slate-400" />
          <select
            value={healthFilter}
            onChange={e => setHealthFilter(e.target.value)}
            className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-700 bg-white outline-none"
          >
            <option value="all">All Health Statuses</option>
            <option value="red">Critical Risk (Red)</option>
            <option value="amber">Attention (Amber)</option>
            <option value="green">On Track (Green)</option>
          </select>
        </div>
      </div>

      {/* Campaigns Table */}
      <div className="bg-white border border-slate-200/90 rounded-2xl overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-400 font-semibold uppercase text-[10px]">
              <tr>
                <th className="py-3 px-4">Campaign</th>
                <th className="py-3 px-3">Client & Brand</th>
                <th className="py-3 px-3">Allocated Budget</th>
                <th className="py-3 px-3">Total Spend</th>
                <th className="py-3 px-3">Pacing %</th>
                <th className="py-3 px-3">Platforms</th>
                <th className="py-3 px-3">Health</th>
                <th className="py-3 px-4 text-right">Drill-Down</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400">
                    Loading campaigns...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400">
                    No matching campaigns found.
                  </td>
                </tr>
              ) : (
                filtered.map(item => {
                  const currency = item.campaign.currency || 'LKR';
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
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-slate-900 text-xs">{item.campaign.name}</div>
                        <div className="text-[11px] text-slate-400 mt-0.5">
                          {item.campaign.start_date} to {item.campaign.end_date}
                        </div>
                      </td>

                      <td className="py-3.5 px-3">
                        <span className="font-semibold text-slate-800">{item.client_name}</span>
                        <span className="block text-[11px] text-slate-500 font-medium">{item.brand_name}</span>
                      </td>

                      <td className="py-3.5 px-3 font-semibold text-slate-800">
                        {currency} {item.total_budget.toLocaleString()}
                      </td>

                      <td className="py-3.5 px-3">
                        <span className="font-bold text-slate-900">
                          {currency} {item.total_spend.toLocaleString()}
                        </span>
                        <span className="block text-[10px] text-slate-400">
                          {item.budget_used_percentage.toFixed(0)}% utilized
                        </span>
                      </td>

                      <td className="py-3.5 px-3">
                        <span
                          className={`font-bold ${
                            item.overall_pacing < 70 || item.overall_pacing > 130
                              ? 'text-rose-600'
                              : item.overall_pacing < 85 || item.overall_pacing > 115
                              ? 'text-amber-600'
                              : 'text-emerald-600'
                          }`}
                        >
                          {item.overall_pacing.toFixed(0)}%
                        </span>
                      </td>

                      <td className="py-3.5 px-3">
                        <div className="flex items-center gap-1">
                          {item.platforms.length > 0 ? (
                            item.platforms.map(p => (
                              <span
                                key={p.platform}
                                className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-700"
                              >
                                {p.platform}
                              </span>
                            ))
                          ) : (
                            <span className="text-[11px] text-slate-400 italic">No line items</span>
                          )}
                        </div>
                      </td>

                      <td className="py-3.5 px-3">
                        <HealthBadge status={item.overall_health} size="sm" />
                      </td>

                      <td className="py-3.5 px-4 text-right">
                        <span className="text-xs font-semibold text-indigo-600 hover:text-indigo-900 inline-flex items-center gap-1">
                          <span>Inspect</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
