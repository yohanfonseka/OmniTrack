import React, { useState } from 'react';
import { LineItemCalculatedMetrics, CampaignLineItem } from '../../types';
import { ApiService } from '../../lib/api';
import { HealthBadge } from '../common/HealthBadge';
import { MetricCard } from '../common/MetricCard';
import {
  Calendar,
  Layers,
  Target,
  Clock,
  TrendingUp,
  AlertTriangle,
  DollarSign,
  Hash,
  Eye,
  MousePointer,
  ChevronDown,
  ChevronUp,
  Link2,
  Unlink,
  Plus,
  CheckCircle2,
  ShieldCheck,
  RefreshCw
} from 'lucide-react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { formatMoney as formatCurrencyMoney, formatNumber, formatPercent } from '../../lib/formatters';

interface LineItemDetailsProps {
  metrics: LineItemCalculatedMetrics;
  onClose?: () => void;
  isExpandedView?: boolean;
  onConnectDataSource?: (lineItem: CampaignLineItem) => void;
}

export const LineItemDetails: React.FC<LineItemDetailsProps> = ({
  metrics,
  onClose,
  isExpandedView = true,
  onConnectDataSource
}) => {
  const [activeMetricTab, setActiveMetricTab] = useState<'spend' | 'impressions' | 'kpi'>('spend');
  const [showDailyTable, setShowDailyTable] = useState(false);
  const [disconnectingId, setDisconnectingId] = useState<string | null>(null);

  const { line_item } = metrics;
  const currency = line_item.currency || 'LKR';

  // Format currency
  const formatMoney = (val: number) => {
    return formatCurrencyMoney(val, currency, currency === 'USD' ? 2 : 0);
  };

  const handleDisconnect = async (sourceId: string) => {
    if (!confirm('Are you sure you want to disconnect this platform campaign? Live metric synchronization will stop.')) {
      return;
    }
    setDisconnectingId(sourceId);
    try {
      await ApiService.disconnectLineItemDataSource(line_item.agency_id, line_item.id, sourceId);
      window.dispatchEvent(new CustomEvent('refresh-omnitrack'));
      window.dispatchEvent(new CustomEvent('campaigns-updated'));
    } catch (err: any) {
      alert(err.message || 'Failed to disconnect data source');
    } finally {
      setDisconnectingId(null);
    }
  };

  // Generate chart data from daily metrics or synthesize daily trend
  const dailyData = (metrics.daily_metrics && metrics.daily_metrics.length > 0)
    ? metrics.daily_metrics.map(m => ({
        date: m.report_date.slice(5), // MM-DD
        spend: m.spend,
        impressions: m.impressions,
        clicks: m.clicks,
        conversions: m.conversions,
        engagements: m.engagements
      }))
    : [];

  return (
    <div
      id={`line-item-detail-${line_item.id}`}
      className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-6"
    >
      {/* Header Info & Health */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-slate-100 text-slate-700">
              {line_item.platform}
            </span>
            <h3 className="text-lg font-bold text-slate-900">{line_item.name}</h3>
            <HealthBadge status={metrics.health} />
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 text-xs text-slate-500">
            <span>Objective: <strong className="text-slate-700">{line_item.objective}</strong></span>
            <span>•</span>
            <span className="flex items-center gap-1.5">
              <span>Account:</span>
              {line_item.platform_account_id && line_item.platform_account_id !== 'act_default' ? (
                <code className="font-mono text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded">{line_item.platform_account_id}</code>
              ) : (
                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                  Unlinked (populates on import)
                </span>
              )}
            </span>
            <span>•</span>
            <span className="flex items-center gap-1.5">
              <span>Platform Campaign ID:</span>
              {line_item.platform_campaign_id && !line_item.platform_campaign_id.startsWith('cid_') ? (
                <code className="font-mono text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded">{line_item.platform_campaign_id}</code>
              ) : (
                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                  Pending Mapping
                </span>
              )}
            </span>
          </div>
        </div>

        {onClose && (
          <button
            onClick={onClose}
            className="self-start sm:self-center px-3 py-1.5 text-xs font-semibold text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors flex items-center gap-1.5"
          >
            <ChevronUp className="w-3.5 h-3.5" />
            <span>Hide Drill-Down</span>
          </button>
        )}
      </div>

      {/* Health Reasons / Alert Explanations */}
      {metrics.health_reasons.length > 0 && (
        <div
          className={`p-3.5 rounded-lg border text-xs flex items-start gap-2.5 ${
            metrics.health === 'red'
              ? 'bg-rose-50/80 border-rose-200 text-rose-800'
              : metrics.health === 'amber'
              ? 'bg-amber-50/80 border-amber-200 text-amber-800'
              : 'bg-emerald-50/80 border-emerald-200 text-emerald-800'
          }`}
        >
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <div>
            <span className="font-bold">Operational Status Diagnosis: </span>
            <span>{metrics.health_reasons.join(' | ')}</span>
          </div>
        </div>
      )}

      {/* Live Data Sources Mapping Section (Level 3 -> Level 4) */}
      <div className="bg-slate-50/70 border border-slate-200/90 rounded-xl p-4 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <Link2 className="w-4 h-4 text-indigo-600" />
              <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                Live Platform Data Sources ({metrics.data_sources?.length || 0})
              </h4>
              <span
                className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${
                  metrics.data_source_status === 'connected'
                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                    : 'bg-amber-100 text-amber-800 border border-amber-300'
                }`}
              >
                {metrics.data_source_status === 'connected' ? 'Connected' : 'Not Connected'}
              </span>
            </div>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Live advertising platform campaigns feeding daily spend and performance data into this line item.
            </p>
          </div>

          {onConnectDataSource && (
            <button
              onClick={() => onConnectDataSource(line_item)}
              className="self-start sm:self-center inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold shadow-2xs transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>
                {metrics.data_sources && metrics.data_sources.length > 0
                  ? 'Link Another Platform Campaign'
                  : 'Connect Data Source'}
              </span>
            </button>
          )}
        </div>

        {/* Data Sources List */}
        {!metrics.data_sources || metrics.data_sources.length === 0 ? (
          <div className="p-4 bg-amber-50/60 border border-amber-200/80 rounded-xl flex items-start gap-3 text-xs text-amber-900">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div className="flex-1 space-y-1">
              <span className="font-bold">No Platform Campaign Linked</span>
              <p className="text-[11px] text-amber-800 leading-relaxed">
                This campaign line item is not currently connected to a live {line_item.platform.toUpperCase()} Ads campaign. Daily delivery metrics cannot be synchronized until mapped.
              </p>
              {onConnectDataSource && (
                <div className="pt-1">
                  <button
                    onClick={() => onConnectDataSource(line_item)}
                    className="inline-flex items-center gap-1 text-xs font-bold text-amber-900 hover:text-amber-950 underline decoration-amber-400 underline-offset-2"
                  >
                    Click here to map a platform campaign →
                  </button>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="divide-y divide-slate-200/60 bg-white rounded-xl border border-slate-200/80 overflow-hidden">
            {metrics.data_sources.map(ds => (
              <div
                key={ds.id}
                className="p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
              >
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-slate-900">{ds.platform_campaign_name}</span>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded">
                      ID: {ds.platform_campaign_id}
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full font-bold uppercase bg-emerald-50 text-emerald-700 border border-emerald-200">
                      {ds.status}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-500 flex items-center gap-3">
                    <span>
                      Ad Account: <strong>{ds.platform_account_name || ds.platform_account_id}</strong> ({ds.platform_account_id})
                    </span>
                    <span>•</span>
                    <span>Linked: {ds.linked_at ? new Date(ds.linked_at).toLocaleDateString() : 'Active'}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => handleDisconnect(ds.id)}
                    disabled={disconnectingId === ds.id}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-rose-600 hover:text-rose-700 hover:bg-rose-50 rounded-md border border-rose-200/80 transition-colors disabled:opacity-50"
                  >
                    {disconnectingId === ds.id ? (
                      <RefreshCw className="w-3 h-3 animate-spin" />
                    ) : (
                      <Unlink className="w-3 h-3" />
                    )}
                    <span>Disconnect</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Key Metric Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <MetricCard
          label="Budget Allocated"
          value={formatMoney(line_item.budget)}
          subValue={`Spent: ${formatMoney(metrics.total_spend)}`}
          statusColor="slate"
        />
        <MetricCard
          label="Pacing %"
          value={`${metrics.pacing_percentage.toFixed(0)}%`}
          subValue={`Expected: ${formatMoney(metrics.expected_spend)}`}
          variance={metrics.pacing_percentage - 100}
          varianceLabel="vs expected pace"
          isPositiveGood={false} // near 0 variance is best
          statusColor={metrics.pacing_percentage < 70 || metrics.pacing_percentage > 130 ? 'rose' : 'emerald'}
        />
        <MetricCard
          label={`Target ${line_item.primary_kpi.toUpperCase()}`}
          value={`${currency === 'USD' ? '$' : 'Rs.'} ${formatNumber(line_item.primary_kpi_target, 2)}`}
          subValue={`Actual: ${currency === 'USD' ? '$' : 'Rs.'} ${formatNumber(metrics.primary_kpi_actual, 2)}`}
          variance={metrics.primary_kpi_variance}
          varianceLabel="variance"
          isPositiveGood={!['cpm', 'cpc', 'cpa', 'cpe'].includes(line_item.primary_kpi)}
        />
        <MetricCard
          label="Projected Final Spend"
          value={formatMoney(metrics.projected_final_spend)}
          subValue={`Schedule: Day ${metrics.days_elapsed} of ${metrics.days_total}`}
          statusColor="slate"
        />
      </div>

      {/* Spend vs Expected Spend Progress Bar */}
      <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-4 space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="font-semibold text-slate-700">Budget Consumption & Delivery Progress</span>
          <span className="text-slate-500 font-mono">
            {((metrics.total_spend / (line_item.budget || 1)) * 100).toFixed(1)}% utilized
          </span>
        </div>
        <div className="w-full h-3.5 bg-slate-200 rounded-full overflow-hidden relative shadow-inner">
          {/* Actual spend bar */}
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              metrics.health === 'red'
                ? 'bg-rose-500'
                : metrics.health === 'amber'
                ? 'bg-amber-500'
                : 'bg-emerald-500'
            }`}
            style={{ width: `${Math.min(100, (metrics.total_spend / (line_item.budget || 1)) * 100)}%` }}
          />

          {/* Expected spend marker - z-20 and rendered on top of spend bar */}
          <div
            className="absolute top-0 bottom-0 w-1 bg-slate-900 shadow-xs ring-1 ring-white/90 z-20 transition-all duration-300 -ml-0.5"
            style={{ left: `${Math.min(100, (metrics.expected_spend / (line_item.budget || 1)) * 100)}%` }}
            title={`Expected Spend: ${formatMoney(metrics.expected_spend)} (Day ${metrics.days_elapsed} of ${metrics.days_total})`}
          />
        </div>
        <div className="flex items-center justify-between text-[11px] text-slate-500 pt-0.5">
          <span>Start: {line_item.start_date}</span>
          <span className="flex items-center gap-1.5 font-medium text-slate-700 bg-slate-100/90 px-2 py-0.5 rounded-md border border-slate-200/60">
            <span className="inline-block w-2 h-2 bg-slate-800 rounded-full" /> Expected Marker: Day {metrics.days_elapsed}/{metrics.days_total} ({formatMoney(metrics.expected_spend)})
          </span>
          <span>End: {line_item.end_date}</span>
        </div>
      </div>

      {/* Interactive Trend Chart */}
      {dailyData.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
              <TrendingUp className="w-3.5 h-3.5 text-indigo-600" />
              Daily Metric Trends ({dailyData.length} reporting days)
            </h4>
            <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg text-xs font-medium">
              <button
                onClick={() => setActiveMetricTab('spend')}
                className={`px-2.5 py-1 rounded-md transition-colors ${
                  activeMetricTab === 'spend' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Daily Spend
              </button>
              <button
                onClick={() => setActiveMetricTab('impressions')}
                className={`px-2.5 py-1 rounded-md transition-colors ${
                  activeMetricTab === 'impressions' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Impressions
              </button>
            </div>
          </div>

          <div className="h-48 w-full bg-slate-50/50 border border-slate-200/70 rounded-xl p-2">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={dailyData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id={`color-${line_item.id}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#4f46e5" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <YAxis
                  tick={{ fontSize: 10, fill: '#64748b' }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={val => (val >= 1000 ? `${(val / 1000).toFixed(0)}k` : val)}
                />
                <Tooltip
                  contentStyle={{ backgroundColor: '#0f172a', borderRadius: '8px', border: 'none', color: '#fff', fontSize: '11px' }}
                  formatter={(val: any) => [
                    activeMetricTab === 'spend' ? `${currency} ${Number(val).toLocaleString()}` : Number(val).toLocaleString(),
                    activeMetricTab === 'spend' ? 'Spend' : 'Impressions'
                  ]}
                />
                <Area
                  type="monotone"
                  dataKey={activeMetricTab}
                  stroke="#4f46e5"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill={`url(#color-${line_item.id})`}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Recalculated Ratios Row */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 pt-2 border-t border-slate-100 text-xs">
        <div className="p-2 rounded bg-slate-50">
          <span className="text-slate-400 text-[10px] block uppercase font-medium">Recalculated CPM</span>
          <span className="font-bold text-slate-800">{currency === 'USD' ? '$' : 'Rs.'} {formatNumber(metrics.actual_cpm, 2)}</span>
        </div>
        <div className="p-2 rounded bg-slate-50">
          <span className="text-slate-400 text-[10px] block uppercase font-medium">Blended CTR</span>
          <span className="font-bold text-slate-800">{formatNumber(metrics.actual_ctr, 2)}%</span>
        </div>
        <div className="p-2 rounded bg-slate-50">
          <span className="text-slate-400 text-[10px] block uppercase font-medium">Cost / Click (CPC)</span>
          <span className="font-bold text-slate-800">{currency === 'USD' ? '$' : 'Rs.'} {formatNumber(metrics.actual_cpc, 2)}</span>
        </div>
        <div className="p-2 rounded bg-slate-50">
          <span className="text-slate-400 text-[10px] block uppercase font-medium">Engagements</span>
          <span className="font-bold text-slate-800">{formatNumber(metrics.total_engagements, 0)}</span>
        </div>
        <div className="p-2 rounded bg-slate-50">
          <span className="text-slate-400 text-[10px] block uppercase font-medium">Conversions</span>
          <span className="font-bold text-slate-800">{formatNumber(metrics.total_conversions, 0)}</span>
        </div>
      </div>
    </div>
  );
};
