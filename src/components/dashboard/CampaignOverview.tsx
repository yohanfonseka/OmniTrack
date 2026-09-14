import React, { useState } from 'react';
import { CampaignCalculatedMetrics, Campaign } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { ApiService } from '../../lib/api';
import { HealthBadge } from '../common/HealthBadge';
import { MetricCard } from '../common/MetricCard';
import { CampaignNameDisplay } from '../common/CampaignNameDisplay';
import { EditCampaignModal } from '../modals/EditCampaignModal';
import { ConfirmDeleteModal } from '../modals/ConfirmDeleteModal';
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
  ArrowRightLeft,
  Target,
  Award,
  ShieldCheck,
  CheckCircle2,
  Pencil,
  Trash2,
  Unlink
} from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from 'recharts';
import { formatMoney as formatCurrencyMoney, formatNumber, formatPercent } from '../../lib/formatters';

interface CampaignOverviewProps {
  campaignMetrics: CampaignCalculatedMetrics;
  onDrillDownPlatform?: (platform: string) => void;
  onViewAllLineItems?: () => void;
  onCampaignUpdated?: (campaign: Campaign) => void;
  onCampaignDeleted?: () => void;
}

export const CampaignOverview: React.FC<CampaignOverviewProps> = ({
  campaignMetrics,
  onDrillDownPlatform,
  onViewAllLineItems,
  onCampaignUpdated,
  onCampaignDeleted
}) => {
  const { currentAgency } = useAuth();
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [unlinkingCampaign, setUnlinkingCampaign] = useState(false);

  const { campaign } = campaignMetrics;
  const currency = campaign.currency || 'LKR';
  const isSpecificCampaign = Boolean(campaign.id && !campaign.id.startsWith('All'));

  const formatMoney = (val: number) => {
    return formatCurrencyMoney(val, currency, currency === 'USD' ? 2 : 0);
  };

  const handleUnlinkCampaignData = async () => {
    if (!currentAgency || !isSpecificCampaign) return;
    const confirmed = window.confirm(
      `Unlink All Platform Data & Roll Back Totals?\n\nAre you sure you want to unlink all live ad data sources from "${campaign.name}"?\n\nAll ad spend (${formatMoney(campaignMetrics.total_spend)}) and associated metric data will be rolled back from the campaign totals and restored to the unmapped queue.`
    );
    if (!confirmed) return;

    setUnlinkingCampaign(true);
    try {
      const res = await ApiService.unlinkCampaignData(currentAgency.id, campaign.id);
      window.dispatchEvent(new CustomEvent('refresh-omnitrack'));
      window.dispatchEvent(new CustomEvent('campaigns-updated'));
    } catch (err: any) {
      alert(err.message || 'Failed to unlink campaign data');
    } finally {
      setUnlinkingCampaign(false);
    }
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

  const ratingScore = campaignMetrics.campaign_rating_score ?? 85;
  const ratingLabel = campaignMetrics.campaign_rating_label ?? (ratingScore >= 85 ? 'Optimal' : ratingScore >= 70 ? 'Good' : ratingScore >= 50 ? 'Fair' : 'Critical');

  return (
    <div className="space-y-6">
      {/* Top Banner with Health, Rating and Schedule */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-6 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4 pb-5 border-b border-slate-100">
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-3 mb-2.5">
              <span className="text-xs px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 font-bold">
                {campaignMetrics.client_name} → {campaignMetrics.brand_name}
              </span>
              <HealthBadge status={campaignMetrics.overall_health} size="sm" />
              
              {/* Campaign Rating Badge */}
              <div
                className={`inline-flex items-center gap-2 px-3 py-1 rounded-xl text-xs font-bold border shadow-2xs ${
                  campaignMetrics.overall_health === 'red'
                    ? 'bg-rose-50 text-rose-800 border-rose-200'
                    : campaignMetrics.overall_health === 'amber'
                    ? 'bg-amber-50 text-amber-800 border-amber-200'
                    : 'bg-indigo-50 text-indigo-800 border-indigo-200'
                }`}
                title="Weighted composite rating driven by deliverable pacing (50%), budget spend pacing (35%), and buying efficiency (15%)"
              >
                <Award className="w-3.5 h-3.5 text-indigo-600" />
                <span>Campaign Rating: <strong>{ratingScore}/100</strong></span>
                <span className="px-1.5 py-0.2 rounded bg-white/80 font-black text-[10px] uppercase">
                  {ratingLabel}
                </span>
              </div>
            </div>

            <CampaignNameDisplay rawName={campaign.name} nameLabel="Campaign Name" />

            {campaign.description && (
              <p className="text-xs text-slate-500 mt-2 max-w-3xl leading-relaxed">{campaign.description}</p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2.5 text-xs">
            <div className="px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-slate-600 flex items-center gap-2">
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
              <span>{campaign.start_date} to {campaign.end_date}</span>
            </div>
            <div className="px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-slate-600 flex items-center gap-2">
              <Clock className="w-3.5 h-3.5 text-slate-400" />
              <span>Updated: {campaignMetrics.last_successful_update}</span>
            </div>

            {isSpecificCampaign && (
              <div className="flex items-center gap-2 pl-1 sm:border-l sm:border-slate-200 sm:ml-1">
                {campaignMetrics.total_spend > 0 && (
                  <button
                    type="button"
                    id={`unlink-campaign-btn-${campaign.id}`}
                    onClick={handleUnlinkCampaignData}
                    disabled={unlinkingCampaign}
                    className="px-2.5 py-1.5 rounded-lg bg-white border border-rose-200 text-rose-700 hover:bg-rose-50 transition-all font-semibold flex items-center gap-1.5 shadow-2xs cursor-pointer disabled:opacity-50"
                    title="Unlink all platform data sources and roll back campaign totals"
                  >
                    <Unlink className="w-3.5 h-3.5 text-rose-600" />
                    <span>{unlinkingCampaign ? 'Unlinking...' : 'Unlink Data'}</span>
                  </button>
                )}
                <button
                  type="button"
                  id={`edit-campaign-btn-${campaign.id}`}
                  onClick={() => setShowEditModal(true)}
                  className="px-2.5 py-1.5 rounded-lg bg-white border border-slate-200 text-slate-700 hover:text-indigo-600 hover:border-indigo-300 hover:bg-indigo-50/50 transition-all font-semibold flex items-center gap-1.5 shadow-2xs"
                  title="Edit Campaign Details"
                >
                  <Pencil className="w-3.5 h-3.5 text-slate-500" />
                  <span>Edit</span>
                </button>
                <button
                  type="button"
                  id={`delete-campaign-btn-${campaign.id}`}
                  onClick={() => setShowDeleteModal(true)}
                  className="px-2.5 py-1.5 rounded-lg bg-white border border-slate-200 text-slate-700 hover:text-rose-600 hover:border-rose-300 hover:bg-rose-50/50 transition-all font-semibold flex items-center gap-1.5 shadow-2xs"
                  title="Delete Campaign"
                >
                  <Trash2 className="w-3.5 h-3.5 text-slate-500" />
                  <span>Delete</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Health Diagnostic Note */}
        {campaignMetrics.requiring_attention_count > 0 && (
          <div className="mt-4 p-3.5 rounded-xl bg-amber-50/90 border border-amber-200/90 text-xs text-amber-900 flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold">Rollup Warning: </span>
              <span>
                Campaign health rolled up to <strong>{campaignMetrics.overall_health.toUpperCase()}</strong> ({ratingScore}/100) because{' '}
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

        {/* Primary Budget & Pacing Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5 mt-5">
          <MetricCard
            label="Total Campaign Budget"
            value={formatMoney(campaignMetrics.total_budget ?? 0)}
            subValue="Sum of line-item budgets"
            icon={<DollarSign className="w-4 h-4" />}
          />
          <MetricCard
            label="Total Spend"
            value={formatMoney(campaignMetrics.total_spend ?? 0)}
            subValue={`${(campaignMetrics.budget_used_percentage ?? 0).toFixed(1)}% utilized`}
            icon={<PieChart className="w-4 h-4" />}
          />
          <MetricCard
            label="Budget Remaining"
            value={formatMoney(campaignMetrics.budget_remaining ?? 0)}
            subValue={`Projected: ${formatMoney(campaignMetrics.projected_final_spend ?? 0)}`}
            icon={<Activity className="w-4 h-4" />}
          />
          <MetricCard
            label="Overall Pacing"
            value={`${(campaignMetrics.overall_pacing ?? 0).toFixed(0)}%`}
            subValue={`Expected: ${formatMoney(campaignMetrics.expected_spend ?? 0)}`}
            variance={(campaignMetrics.total_spend ?? 0) > 0 ? (campaignMetrics.overall_pacing ?? 0) - 100 : 0}
            varianceLabel={(campaignMetrics.total_spend ?? 0) > 0 ? "vs scheduled pace" : "awaiting delivery"}
            isPositiveGood={false}
            statusColor={(campaignMetrics.total_spend ?? 0) === 0 ? 'slate' : (campaignMetrics.overall_pacing ?? 0) < 70 || (campaignMetrics.overall_pacing ?? 0) > 130 ? 'rose' : 'emerald'}
          />
        </div>

        {/* Aggregate Budget Pacing Progress Bar */}
        <div className="mt-5 pt-5 border-t border-slate-100 space-y-2">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between text-xs gap-2">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-slate-700">Cumulative Budget Flight Pacing</span>
              <span className="text-slate-500 font-mono text-[11px]">
                {(((campaignMetrics.total_spend ?? 0) / (campaignMetrics.total_budget || 1)) * 100).toFixed(1)}% utilized
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-4 text-slate-500 text-[11px]">
              <span className="flex items-center gap-1.5 font-medium text-slate-700">
                <span className="w-2.5 h-2.5 rounded-full bg-indigo-600 inline-block" /> Actual Spend: {formatMoney(campaignMetrics.total_spend ?? 0)}
              </span>
              <span className="flex items-center gap-1.5 font-medium text-slate-700">
                <span className="w-2.5 h-2.5 rounded-full bg-slate-900 inline-block" /> Expected Pace: {formatMoney(campaignMetrics.expected_spend ?? 0)}
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

          {/* Schedule & Expected Marker Footer */}
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

      {/* Primary KPI Deliverables & Secondary Buying KPIs Section (Directly impacting campaign rating) */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-6 shadow-xs space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100">
          <div>
            <div className="flex items-center gap-2">
              <Target className="w-5 h-5 text-indigo-600" />
              <h3 className="text-base font-bold text-slate-900 tracking-tight">
                Primary Deliverable Targets & Buying KPIs
              </h3>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Primary deliverable pacing (50%), budget spend pacing (35%), and buying efficiency (15%) drive the overall campaign rating score of <strong>{ratingScore}/100 ({ratingLabel})</strong>.
            </p>
          </div>
          {onViewAllLineItems && (
            <button
              onClick={onViewAllLineItems}
              className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 hover:underline"
            >
              <span>View Line Item Breakdown</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Primary Deliverable KPIs Grid */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-indigo-600"></span>
              Primary Deliverable Targets (Volume Performance)
            </span>
            <span className="text-[11px] text-slate-400">Pacing against flight schedule</span>
          </div>

          {campaignMetrics.primary_kpis_summary && campaignMetrics.primary_kpis_summary.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
              {campaignMetrics.primary_kpis_summary.map(kpiSum => {
                const kpiLabel = kpiSum.label || kpiSum.kpi.replace('_', ' ').toUpperCase();
                const isVolume = ['reach', 'impressions', 'video_views', 'clicks', 'conversions', 'engagements'].includes(kpiSum.kpi);
                const target = kpiSum.target ?? (kpiSum as any).total_target ?? 0;
                const actual = kpiSum.actual ?? (kpiSum as any).total_actual ?? 0;
                const variance = kpiSum.variance ?? (kpiSum as any).variance_percentage ?? 0;
                const pacing = kpiSum.pacing_percentage ?? (kpiSum as any).overall_pacing_percentage ?? 0;
                const progress = kpiSum.progress_percentage ?? (target > 0 ? (actual / target) * 100 : 0);
                const achievedPct = Math.min(100, Math.max(0, progress));
                const isFavorable = kpiSum.status === 'green' || (isVolume ? pacing >= 85 : variance <= 15);

                return (
                  <div
                    key={kpiSum.kpi}
                    className="bg-slate-50/80 border border-slate-200/80 rounded-xl p-4 space-y-3"
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <span className="px-2 py-0.5 rounded text-[10px] font-extrabold uppercase bg-indigo-100 text-indigo-800">
                          {kpiLabel}
                        </span>
                        <div className="text-lg font-bold text-slate-900 mt-1">
                          {isVolume ? formatNumber(actual, 0) : `${currency} ${formatNumber(actual, 2)}`}
                          <span className="text-xs font-normal text-slate-500">
                            {' '}/ {isVolume ? formatNumber(target, 0) : `${currency} ${formatNumber(target, 2)}`} target
                          </span>
                        </div>
                      </div>
                      <span
                        className={`text-xs font-bold px-2 py-0.5 rounded-full border ${
                          isFavorable
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : 'bg-rose-50 text-rose-700 border-rose-200'
                        }`}
                      >
                        {variance >= 0 ? '+' : ''}{variance.toFixed(1)}% pace
                      </span>
                    </div>

                    <div className="space-y-1">
                      <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${
                            isFavorable ? 'bg-indigo-600' : 'bg-amber-500'
                          }`}
                          style={{ width: `${achievedPct}%` }}
                        />
                      </div>
                      <div className="flex items-center justify-between text-[11px] text-slate-500 pt-0.5">
                        <span>{achievedPct.toFixed(1)}% of total target</span>
                        <span>Flight pace: {pacing.toFixed(0)}%</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="p-4 bg-slate-50 border border-dashed border-slate-200 rounded-xl text-xs text-slate-500 flex items-center justify-between">
              <span>
                {campaignMetrics.active_line_items_count === 0
                  ? 'No line items configured for this campaign yet. Add line items to configure primary deliverable targets and monitor pacing.'
                  : 'No specific deliverable target volumes configured across active line items.'}
              </span>
            </div>
          )}
        </div>

        {/* Secondary Buying Efficiency KPIs Grid */}
        {campaignMetrics.buying_kpis_summary && campaignMetrics.buying_kpis_summary.length > 0 && (
          <div className="pt-2 border-t border-slate-100">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                Secondary Buying KPIs (Cost Efficiency Caps)
              </span>
              <span className="text-[11px] text-slate-400">Lower unit cost protects margins</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3.5">
              {campaignMetrics.buying_kpis_summary.map(bk => {
                const bkCurrency = bk.currency || currency;
                const target = bk.target ?? (bk as any).target_average ?? 0;
                const actual = bk.actual ?? (bk as any).actual_blended ?? 0;
                const variance = bk.variance ?? (bk as any).variance_percentage ?? 0;
                const isFavorable = bk.status === 'green' || (bk as any).is_favorable || variance <= 0;

                return (
                  <div
                    key={`${bk.kpi}_${bk.currency}`}
                    className="bg-emerald-50/40 border border-emerald-200/80 rounded-xl p-3.5 space-y-1.5"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold text-slate-800 uppercase">
                        {bk.label || `${bk.kpi} Target`}
                      </span>
                      <span
                        className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                          isFavorable
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-rose-100 text-rose-800'
                        }`}
                      >
                        {variance <= 0 ? 'Favorable' : 'Over Target'}
                      </span>
                    </div>
                    <div className="text-base font-bold text-slate-900">
                      {bkCurrency} {formatNumber(actual, 2)}
                      <span className="text-xs font-normal text-slate-500">
                        {' '}(target: {bkCurrency} {formatNumber(target, 2)})
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-500 flex items-center justify-between">
                      <span>Efficiency Variance:</span>
                      <span className={`font-bold ${isFavorable ? 'text-emerald-700' : 'text-rose-700'}`}>
                        {variance > 0 ? '+' : ''}{variance.toFixed(1)}%
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
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
                  tickFormatter={val => (val != null && !isNaN(Number(val)) ? `${(Number(val) / 1000).toFixed(0)}k` : '0')}
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

      {/* Edit Campaign Modal */}
      {showEditModal && (
        <EditCampaignModal
          campaign={campaign}
          clientName={campaignMetrics.client_name}
          brandName={campaignMetrics.brand_name}
          onClose={() => setShowEditModal(false)}
          onUpdated={updated => {
            setShowEditModal(false);
            if (onCampaignUpdated) onCampaignUpdated(updated);
          }}
        />
      )}

      {/* Confirm Delete Campaign Modal */}
      {showDeleteModal && (
        <ConfirmDeleteModal
          title="Delete Campaign"
          itemName={campaign.name}
          itemType="Campaign"
          warningDetails={`Deleting "${campaign.name}" will permanently delete this campaign, its ${campaignMetrics.platforms?.reduce((acc, p) => acc + p.line_items.length, 0) || 0} line items, daily performance history, and all mapped data connections.`}
          onClose={() => setShowDeleteModal(false)}
          onConfirm={async () => {
            if (!currentAgency) return;
            await ApiService.deleteCampaign(currentAgency.id, campaign.id);
            window.dispatchEvent(new CustomEvent('refresh-omnitrack'));
            window.dispatchEvent(new CustomEvent('campaigns-updated'));
            if (onCampaignDeleted) {
              onCampaignDeleted();
            }
          }}
        />
      )}
    </div>
  );
};
