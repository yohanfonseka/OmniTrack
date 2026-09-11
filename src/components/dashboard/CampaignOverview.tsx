import React from 'react';
import { CampaignCalculatedMetrics } from '../../types';
import { HealthBadge } from '../common/HealthBadge';
import { MetricCard } from '../common/MetricCard';
import {
  DollarSign,
  PieChart,
  Activity,
  AlertTriangle,
  Eye,
  MousePointer,
  Users,
  Film,
  Calendar,
  Layers,
  ArrowRight,
  TrendingUp,
  Clock,
  ArrowRightLeft
} from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from 'recharts';
import { formatMoney as formatCurrencyMoney, formatNumber, formatPercent } from '../../lib/formatters';

interface CampaignOverviewProps {
  campaignMetrics: CampaignCalculatedMetrics;
  onDrillDownPlatform?: (platform: string) => void;
  onViewAllLineItems?: () => void;
}

export const CampaignOverview: React.FC<CampaignOverviewProps> = ({
  campaignMetrics,
  onDrillDownPlatform,
  onViewAllLineItems
}) => {
  const { campaign } = campaignMetrics;
  const currency = campaign.currency || 'LKR';

  const formatMoney = (val: number) => {
    return formatCurrencyMoney(val, currency, currency === 'USD' ? 2 : 0);
  };

  // Platform comparison chart data
  const platformChartData = campaignMetrics.platforms.map(p => ({
    name: p.platform.toUpperCase(),
    budget: p.budget,
    spend: p.spend,
    expected_spend: p.expected_spend
  }));

  // Calculate flight elapsed and total days if not provided directly
  const daysTotal = campaignMetrics.days_total ?? (() => {
    const start = new Date(campaign.start_date);
    const end = new Date(campaign.end_date);
    const diff = Math.abs(end.getTime() - start.getTime());
    return Math.max(1, Math.ceil(diff / (1000 * 60 * 60 * 24)) + 1);
  })();

  const daysElapsed = campaignMetrics.days_elapsed ?? (() => {
    const start = new Date(campaign.start_date);
    const end = new Date(campaign.end_date);
    const ref = new Date('2026-09-08T23:59:59Z');
    if (ref < start) return 0;
    if (ref >= end) return daysTotal;
    const diff = Math.max(0, ref.getTime() - start.getTime());
    return Math.min(daysTotal, Math.max(1, Math.ceil(diff / (1000 * 60 * 60 * 24))));
  })();

  const expectedPercentage = Math.min(100, Math.max(0, (campaignMetrics.expected_spend / (campaignMetrics.total_budget || 1)) * 100));
  const spendPercentage = Math.min(100, Math.max(0, (campaignMetrics.total_spend / (campaignMetrics.total_budget || 1)) * 100));

  return (
    <div className="space-y-6">
      {/* Top Banner with Health and Schedule */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-6 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-5 border-b border-slate-100">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-2xl font-bold text-slate-900 tracking-tight">{campaign.name}</h2>
              <HealthBadge status={campaignMetrics.overall_health} size="lg" />
              <span className="text-xs px-2.5 py-1 rounded-md bg-slate-100 text-slate-700 font-medium">
                {campaignMetrics.client_name} → {campaignMetrics.brand_name}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1 max-w-2xl">{campaign.description}</p>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-xs">
            <div className="px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-slate-600 flex items-center gap-2">
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
              <span>{campaign.start_date} to {campaign.end_date}</span>
            </div>
            <div className="px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-slate-600 flex items-center gap-2">
              <Clock className="w-3.5 h-3.5 text-slate-400" />
              <span>Updated: {campaignMetrics.last_successful_update}</span>
            </div>
          </div>
        </div>

        {/* Health Diagnostic Note */}
        {campaignMetrics.requiring_attention_count > 0 && (
          <div className="mt-4 p-3.5 rounded-xl bg-amber-50/90 border border-amber-200/90 text-xs text-amber-900 flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold">Rollup Warning: </span>
              <span>
                Campaign health rolled up to <strong>{campaignMetrics.overall_health.toUpperCase()}</strong> because{' '}
                {campaignMetrics.requiring_attention_count} of {campaignMetrics.active_line_items_count} line items have pacing variances or KPI targets outside tolerance.
              </span>
            </div>
          </div>
        )}

        {/* Multi-Currency Transparency Banner */}
        {((campaignMetrics.usd_spend && campaignMetrics.usd_spend > 0) || (campaignMetrics.usd_budget && campaignMetrics.usd_budget > 0)) && (
          <div className="mt-4 p-3.5 rounded-xl bg-indigo-50/80 border border-indigo-200 text-xs text-indigo-950 flex items-start gap-3">
            <ArrowRightLeft className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
            <div className="space-y-1.5 flex-1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-bold text-slate-900">Multi-Currency Consolidated Campaign (USD + LKR)</span>
                <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-white border border-indigo-200 text-indigo-700 font-medium">
                  Exchange Rate: 1 USD = {formatNumber(campaignMetrics.usd_to_lkr_rate || 305, 2)} LKR
                </span>
              </div>
              <p className="text-slate-600 text-[11px] leading-relaxed">
                This campaign seamlessly combines both USD and LKR line items. All aggregate delivery totals are automatically converted and normalized into the campaign's base currency (<strong>{currency}</strong>).
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 font-mono text-[11px]">
                <div className="bg-white/90 p-2 rounded-lg border border-indigo-100">
                  <span className="text-slate-400 block text-[10px] font-sans font-semibold uppercase">USD Spend</span>
                  <span className="font-bold text-slate-900">${formatNumber(campaignMetrics.usd_spend || 0, 2)}</span>
                </div>
                <div className="bg-white/90 p-2 rounded-lg border border-indigo-100">
                  <span className="text-slate-400 block text-[10px] font-sans font-semibold uppercase">LKR Spend</span>
                  <span className="font-bold text-slate-900">Rs. {formatNumber(campaignMetrics.lkr_spend || 0, 0)}</span>
                </div>
                <div className="bg-white/90 p-2 rounded-lg border border-indigo-100">
                  <span className="text-slate-400 block text-[10px] font-sans font-semibold uppercase">USD Budget</span>
                  <span className="font-bold text-slate-900">${formatNumber(campaignMetrics.usd_budget || 0, 2)}</span>
                </div>
                <div className="bg-white/90 p-2 rounded-lg border border-indigo-100">
                  <span className="text-slate-400 block text-[10px] font-sans font-semibold uppercase">LKR Budget</span>
                  <span className="font-bold text-slate-900">Rs. {formatNumber(campaignMetrics.lkr_budget || 0, 0)}</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Primary Budget & Pacing Summary Cards (Section 8.1) */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5 mt-5">
          <MetricCard
            label="Total Campaign Budget"
            value={formatMoney(campaignMetrics.total_budget)}
            subValue="Sum of line-item budgets"
            icon={<DollarSign className="w-4 h-4" />}
          />
          <MetricCard
            label="Total Spend"
            value={formatMoney(campaignMetrics.total_spend)}
            subValue={`${campaignMetrics.budget_used_percentage.toFixed(1)}% utilized`}
            icon={<PieChart className="w-4 h-4" />}
          />
          <MetricCard
            label="Budget Remaining"
            value={formatMoney(campaignMetrics.budget_remaining)}
            subValue={`Projected: ${formatMoney(campaignMetrics.projected_final_spend)}`}
            icon={<Activity className="w-4 h-4" />}
          />
          <MetricCard
            label="Overall Pacing"
            value={`${campaignMetrics.overall_pacing.toFixed(0)}%`}
            subValue={`Expected: ${formatMoney(campaignMetrics.expected_spend)}`}
            variance={campaignMetrics.overall_pacing - 100}
            varianceLabel="vs scheduled pace"
            isPositiveGood={false}
            statusColor={campaignMetrics.overall_pacing < 70 || campaignMetrics.overall_pacing > 130 ? 'rose' : 'emerald'}
          />
        </div>

        {/* Aggregate Budget Pacing Progress Bar */}
        <div className="mt-5 pt-5 border-t border-slate-100 space-y-2">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between text-xs gap-2">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-slate-700">Cumulative Campaign Pacing</span>
              <span className="text-slate-500 font-mono text-[11px]">
                {((campaignMetrics.total_spend / (campaignMetrics.total_budget || 1)) * 100).toFixed(1)}% utilized
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-4 text-slate-500 text-[11px]">
              <span className="flex items-center gap-1.5 font-medium text-slate-700">
                <span className="w-2.5 h-2.5 rounded-full bg-indigo-600 inline-block" /> Actual Spend: {formatMoney(campaignMetrics.total_spend)}
              </span>
              <span className="flex items-center gap-1.5 font-medium text-slate-700">
                <span className="w-2.5 h-2.5 rounded-full bg-slate-900 inline-block" /> Expected Pace: {formatMoney(campaignMetrics.expected_spend)}
              </span>
            </div>
          </div>

          <div className="w-full h-3.5 bg-slate-200 rounded-full overflow-hidden relative shadow-inner">
            {/* Actual spend bar */}
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                campaignMetrics.overall_health === 'red'
                  ? 'bg-rose-500'
                  : campaignMetrics.overall_health === 'amber'
                  ? 'bg-amber-500'
                  : 'bg-indigo-600'
              }`}
              style={{ width: `${spendPercentage}%` }}
            />

            {/* Expected spend marker - z-20 and rendered on top of spend bar */}
            <div
              className="absolute top-0 bottom-0 w-1 bg-slate-900 shadow-xs ring-1 ring-white/90 z-20 transition-all duration-300 -ml-0.5"
              style={{ left: `${expectedPercentage}%` }}
              title={`Expected Pace: ${formatMoney(campaignMetrics.expected_spend)} (Day ${daysElapsed} of ${daysTotal})`}
            />
          </div>

          {/* Schedule & Expected Marker Footer (matches drilled-down version) */}
          <div className="flex items-center justify-between text-[11px] text-slate-500 pt-0.5">
            <span>Start: {campaign.start_date}</span>
            <span className="flex items-center gap-1.5 font-medium text-slate-700 bg-slate-100/90 px-2 py-0.5 rounded-md border border-slate-200/60">
              <span className="inline-block w-2 h-2 bg-slate-800 rounded-full" />
              Expected Marker: Day {daysElapsed}/{daysTotal} ({formatMoney(campaignMetrics.expected_spend)})
            </span>
            <span>End: {campaign.end_date}</span>
          </div>
        </div>
      </div>

      {/* Aggregated Performance & Ratio Metrics (Recalculated Mathematically, Section 14) */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-900 tracking-tight uppercase">
            Aggregate Delivery & Recalculated Ratios
          </h3>
          <span className="text-xs text-slate-500">Recalculated from totals, not averaged</span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <MetricCard
            label="Total Impressions"
            value={formatNumber(campaignMetrics.total_impressions, 0)}
            subValue={`Reach: ${formatNumber(campaignMetrics.total_reach, 0)}`}
            icon={<Eye className="w-3.5 h-3.5" />}
          />
          <MetricCard
            label="Total Clicks"
            value={formatNumber(campaignMetrics.total_clicks, 0)}
            subValue={`Engagements: ${formatNumber(campaignMetrics.total_engagements, 0)}`}
            icon={<MousePointer className="w-3.5 h-3.5" />}
          />
          <MetricCard
            label="Blended CTR"
            value={`${formatNumber(campaignMetrics.blended_ctr, 2)}%`}
            subValue="Clicks / Impressions"
            icon={<TrendingUp className="w-3.5 h-3.5" />}
          />
          <MetricCard
            label="Blended CPM"
            value={`${currency} ${formatNumber(campaignMetrics.blended_cpm, 1)}`}
            subValue="Spend / Impressions × 1k"
            icon={<DollarSign className="w-3.5 h-3.5" />}
          />
          <MetricCard
            label="Total Conversions"
            value={formatNumber(campaignMetrics.total_conversions, 0)}
            subValue={`Views: ${formatNumber(campaignMetrics.total_video_views, 0)}`}
            icon={<Users className="w-3.5 h-3.5" />}
          />
          <MetricCard
            label="Blended CPA"
            value={campaignMetrics.total_conversions > 0 ? `${currency} ${formatNumber(campaignMetrics.blended_cpa, 1)}` : '—'}
            subValue="Spend / Conversions"
            icon={<DollarSign className="w-3.5 h-3.5" />}
          />
        </div>
      </div>

      {/* Platform Comparison Visualizer */}
      {platformChartData.length > 0 && (
        <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-900 tracking-tight uppercase">Platform Budget vs Actual Spend</h3>
            </div>
            {onViewAllLineItems && (
              <button
                onClick={onViewAllLineItems}
                className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 hover:underline"
              >
                <span>Inspect Line Items</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="h-60 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={platformChartData} margin={{ top: 10, right: 20, left: 10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#475569', fontWeight: 600 }} axisLine={false} tickLine={false} />
                <YAxis
                  tick={{ fontSize: 10, fill: '#64748b' }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={val => `${(val / 1000).toFixed(0)}k`}
                />
                <Tooltip
                  contentStyle={{ backgroundColor: '#0f172a', borderRadius: '8px', border: 'none', color: '#fff', fontSize: '11px' }}
                  formatter={(val: any) => [`${currency} ${Number(val).toLocaleString()}`, '']}
                />
                <Legend iconType="circle" wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                <Bar dataKey="budget" name="Allocated Budget" fill="#cbd5e1" radius={[4, 4, 0, 0]} />
                <Bar dataKey="expected_spend" name="Expected Spend" fill="#94a3b8" radius={[4, 4, 0, 0]} />
                <Bar dataKey="spend" name="Actual Spend" fill="#4f46e5" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
};
