import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { PlatformType, KpiMetricType, CampaignLineItem } from '../../types';
import { ApiService } from '../../lib/api';
import { Layers, Target, DollarSign, Calendar, X, RefreshCw, AlertCircle } from 'lucide-react';
import { FormattedNumberInput } from '../common/FormattedNumberInput';

interface EditLineItemModalProps {
  lineItem: CampaignLineItem;
  campaignCurrency?: string;
  onClose: () => void;
  onUpdated: (updated: CampaignLineItem) => void;
}

export const EditLineItemModal: React.FC<EditLineItemModalProps> = ({
  lineItem,
  campaignCurrency = 'LKR',
  onClose,
  onUpdated
}) => {
  const { currentAgency } = useAuth();

  const [platform, setPlatform] = useState<PlatformType>(lineItem.platform || 'meta');
  const [lineItemCurrency, setLineItemCurrency] = useState<string>(lineItem.currency || 'USD');
  const [name, setName] = useState(lineItem.name);
  const [objective, setObjective] = useState(lineItem.objective || 'Brand Awareness');
  const [accountId, setAccountId] = useState(lineItem.platform_account_id || '');
  const [platformCampaignId, setPlatformCampaignId] = useState(lineItem.platform_campaign_id || '');
  const [startDate, setStartDate] = useState(lineItem.start_date || '2026-09-01');
  const [endDate, setEndDate] = useState(lineItem.end_date || '2026-09-30');
  const [budget, setBudget] = useState<number>(lineItem.budget || 0);
  const [primaryKpi, setPrimaryKpi] = useState<KpiMetricType>(lineItem.primary_kpi || 'impressions');
  const [primaryKpiTarget, setPrimaryKpiTarget] = useState<number>(lineItem.primary_kpi_target || 100000);
  const [buyingKpi, setBuyingKpi] = useState<KpiMetricType | 'none'>(lineItem.buying_kpi || 'cpm');
  const [buyingKpiTarget, setBuyingKpiTarget] = useState<number>(
    lineItem.buying_kpi_target || (lineItemCurrency === 'USD' ? 2.5 : 250)
  );
  const [tolerance, setTolerance] = useState<number>(lineItem.pacing_tolerance || 15);
  const [status, setStatus] = useState<'draft' | 'active' | 'paused' | 'completed'>(lineItem.status || 'active');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handlePlatformChange = (newPlatform: PlatformType) => {
    setPlatform(newPlatform);
  };

  const handlePrimaryKpiChange = (newKpi: KpiMetricType) => {
    setPrimaryKpi(newKpi);
    if (newKpi === 'reach') {
      setBuyingKpi('cpm');
    } else if (newKpi === 'impressions') {
      setBuyingKpi('cpm');
    } else if (newKpi === 'video_views') {
      setBuyingKpi('cpv');
    } else if (newKpi === 'clicks') {
      setBuyingKpi('cpc');
    } else if (newKpi === 'conversions') {
      setBuyingKpi('cpa');
    } else if (newKpi === 'engagements') {
      setBuyingKpi('cpe');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentAgency) return;
    if (!name.trim()) {
      setError('Line item name is required.');
      return;
    }
    if (budget <= 0) {
      setError('Budget must be greater than zero.');
      return;
    }
    if (primaryKpiTarget <= 0) {
      setError('Primary KPI target must be greater than zero.');
      return;
    }
    if (new Date(endDate) < new Date(startDate)) {
      setError('Flight end date cannot be earlier than flight start date.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const updated = await ApiService.updateLineItem(currentAgency.id, lineItem.id, {
        platform,
        currency: lineItemCurrency,
        name: name.trim(),
        objective: objective.trim(),
        platform_account_id: accountId.trim(),
        platform_campaign_id: platformCampaignId.trim(),
        start_date: startDate,
        end_date: endDate,
        budget,
        primary_kpi: primaryKpi,
        primary_kpi_target: primaryKpiTarget,
        buying_kpi: buyingKpi === 'none' ? undefined : buyingKpi,
        buying_kpi_target: buyingKpi === 'none' ? undefined : buyingKpiTarget,
        pacing_tolerance: tolerance,
        status
      });

      window.dispatchEvent(new CustomEvent('refresh-omnitrack'));
      window.dispatchEvent(new CustomEvent('campaigns-updated'));
      onUpdated(updated);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to update line item');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150"
      onClick={e => {
        if (e.target === e.currentTarget && !isSubmitting) onClose();
      }}
    >
      <div className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-2xl border border-slate-200/80 space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">Edit Campaign Line Item</h3>
              <p className="text-xs text-slate-500">Configure platform budget, KPI targets, and flight details</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition-colors disabled:opacity-50"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {error && (
          <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          {/* Platform & Currency Selector */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Advertising Platform *</label>
              <select
                value={platform}
                onChange={e => handlePlatformChange(e.target.value as PlatformType)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs outline-none bg-white font-medium focus:border-indigo-500"
              >
                <option value="meta">Meta Ads (FB & Instagram)</option>
                <option value="google_ads">Google Ads (Search & Display)</option>
                <option value="youtube">YouTube Ads</option>
                <option value="tiktok">TikTok Ads</option>
                <option value="linkedin">LinkedIn Ads</option>
                <option value="programmatic">Programmatic / DV360</option>
              </select>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Line Item Currency *</label>
              <select
                value={lineItemCurrency}
                onChange={e => setLineItemCurrency(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs outline-none bg-white font-medium focus:border-indigo-500"
              >
                <option value="USD">USD ($) - Standard for Meta/Google</option>
                <option value="LKR">LKR (Rs.) - Local Spend Currency</option>
              </select>
            </div>
          </div>

          {/* Line Item Name & Objective */}
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Line Item Name *</label>
            <input
              type="text"
              required
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Meta - Broad Reach & Video Engagement"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs outline-none font-medium focus:border-indigo-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Tactical Objective</label>
              <input
                type="text"
                value={objective}
                onChange={e => setObjective(e.target.value)}
                placeholder="e.g. Video Completion, Traffic, Lead Gen"
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Allocated Budget ({lineItemCurrency}) *</label>
              <FormattedNumberInput
                value={budget}
                onChange={setBudget}
                placeholder="Budget amount"
                decimals={lineItemCurrency === 'USD' ? 2 : 0}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs outline-none font-mono font-bold text-slate-900 focus:border-indigo-500"
              />
            </div>
          </div>

          {/* Platform Account and Campaign ID */}
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2.5">
            <span className="font-bold text-slate-900 uppercase block tracking-wider text-[11px]">
              Platform Mapping & Identifiers (Optional)
            </span>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                  Ad Account ID
                </label>
                <input
                  type="text"
                  value={accountId}
                  onChange={e => setAccountId(e.target.value)}
                  placeholder="e.g. act_192837465"
                  className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-xs outline-none font-mono bg-white focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                  Platform Campaign ID
                </label>
                <input
                  type="text"
                  value={platformCampaignId}
                  onChange={e => setPlatformCampaignId(e.target.value)}
                  placeholder="e.g. 23849182741"
                  className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-xs outline-none font-mono bg-white focus:border-indigo-500"
                />
              </div>
            </div>
          </div>

          {/* Dates and Status */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Start Date *</label>
              <input
                type="date"
                required
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">End Date *</label>
              <input
                type="date"
                required
                value={endDate}
                onChange={e => setEndDate(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Status *</label>
              <select
                value={status}
                onChange={e => setStatus(e.target.value as any)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs outline-none bg-white font-semibold focus:border-indigo-500"
              >
                <option value="active">Active</option>
                <option value="draft">Draft</option>
                <option value="paused">Paused</option>
                <option value="completed">Completed</option>
              </select>
            </div>
          </div>

          {/* KPI Targets Section */}
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 space-y-3.5">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="font-bold text-slate-900 uppercase block tracking-wider text-[11px] flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-indigo-600"></span>
                  Primary Deliverable KPI *
                </span>
                <span className="text-[10px] text-indigo-700 bg-indigo-50 font-semibold px-2 py-0.5 rounded-full border border-indigo-200/60">
                  Affects Campaign Rating
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-600 mb-1">Primary KPI Type</label>
                  <select
                    value={primaryKpi}
                    onChange={e => handlePrimaryKpiChange(e.target.value as any)}
                    className="w-full px-2.5 py-2 border border-slate-200 rounded-lg text-xs outline-none bg-white font-semibold text-slate-800 focus:border-indigo-500"
                  >
                    <option value="reach">Unique Reach (Users)</option>
                    <option value="impressions">Total Impressions</option>
                    <option value="video_views">Video Views</option>
                    <option value="clicks">Link Clicks</option>
                    <option value="conversions">Total Conversions</option>
                    <option value="engagements">Total Engagements</option>
                    <option value="cpm">CPM</option>
                    <option value="cpc">CPC</option>
                    <option value="cpa">CPA</option>
                  </select>
                </div>

                <div>
                  <label className="block font-medium text-slate-600 mb-1">
                    Primary Target Goal *
                  </label>
                  <FormattedNumberInput
                    value={primaryKpiTarget}
                    onChange={setPrimaryKpiTarget}
                    placeholder="Deliverable target"
                    decimals={0}
                    className="w-full px-2.5 py-2 border border-slate-200 rounded-lg text-xs outline-none font-mono font-bold text-slate-900 focus:border-indigo-500"
                  />
                </div>
              </div>
            </div>

            {/* Buying Efficiency KPI */}
            <div className="pt-2 border-t border-slate-200/60">
              <span className="font-bold text-slate-800 uppercase block tracking-wider text-[11px] mb-2 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-600"></span>
                Buying Efficiency KPI (Secondary)
              </span>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-600 mb-1">Efficiency Metric</label>
                  <select
                    value={buyingKpi}
                    onChange={e => setBuyingKpi(e.target.value as any)}
                    className="w-full px-2.5 py-2 border border-slate-200 rounded-lg text-xs outline-none bg-white font-medium text-slate-800 focus:border-indigo-500"
                  >
                    <option value="cpm">Target CPM (Cost per 1,000)</option>
                    <option value="cpv">Target CPV (Cost per View)</option>
                    <option value="cpc">Target CPC (Cost per Click)</option>
                    <option value="cpa">Target CPA (Cost per Action)</option>
                    <option value="cpe">Target CPE (Cost per Engagement)</option>
                    <option value="none">None / No Rate Benchmark</option>
                  </select>
                </div>

                <div>
                  <label className="block font-medium text-slate-600 mb-1">
                    Target Rate ({lineItemCurrency})
                  </label>
                  <FormattedNumberInput
                    value={buyingKpiTarget}
                    onChange={setBuyingKpiTarget}
                    disabled={buyingKpi === 'none'}
                    decimals={lineItemCurrency === 'USD' ? 2 : 2}
                    placeholder="Rate target"
                    className="w-full px-2.5 py-2 border border-slate-200 rounded-lg text-xs outline-none font-mono font-bold text-slate-900 disabled:bg-slate-100 disabled:text-slate-400 focus:border-indigo-500"
                  />
                </div>
              </div>
            </div>

            {/* Pacing Tolerance */}
            <div className="pt-2 border-t border-slate-200/60 flex items-center justify-between">
              <div>
                <span className="font-semibold text-slate-700 block">Pacing Variance Tolerance</span>
                <span className="text-[11px] text-slate-500">Threshold before triggering warning status</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="font-mono text-xs font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded">
                  ±{tolerance}%
                </span>
                <select
                  value={tolerance}
                  onChange={e => setTolerance(Number(e.target.value))}
                  className="px-2 py-1 border border-slate-200 rounded-lg text-xs outline-none bg-white font-medium"
                >
                  <option value={10}>±10% (Strict)</option>
                  <option value={15}>±15% (Standard)</option>
                  <option value={20}>±20% (Relaxed)</option>
                </select>
              </div>
            </div>
          </div>

          {/* Modal Actions */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-xs font-semibold text-slate-700 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex items-center gap-1.5 px-5 py-2 bg-indigo-600 text-white rounded-lg text-xs font-semibold hover:bg-indigo-700 shadow-xs transition-colors disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Saving Line Item...</span>
                </>
              ) : (
                <span>Save Line Item</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
