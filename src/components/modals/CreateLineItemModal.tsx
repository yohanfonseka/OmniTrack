import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { PlatformType, KpiMetricType, CampaignLineItem } from '../../types';
import { ApiService } from '../../lib/api';
import { Layers, Target, DollarSign, Calendar, X, ArrowRightLeft } from 'lucide-react';
import { FormattedNumberInput } from '../common/FormattedNumberInput';

interface CreateLineItemModalProps {
  campaignId: string;
  clientId: string;
  brandId: string;
  currency: string;
  onClose: () => void;
  onCreated: () => void;
}

export const CreateLineItemModal: React.FC<CreateLineItemModalProps> = ({
  campaignId,
  clientId,
  brandId,
  currency,
  onClose,
  onCreated
}) => {
  const { currentAgency } = useAuth();

  const [platform, setPlatform] = useState<PlatformType>('meta');
  const [lineItemCurrency, setLineItemCurrency] = useState<string>(
    platform === 'meta' ? 'USD' : currency || 'LKR'
  );
  const [name, setName] = useState('');
  const [objective, setObjective] = useState('Brand Awareness');
  const [accountId, setAccountId] = useState('');
  const [platformCampaignId, setPlatformCampaignId] = useState('');
  const [startDate, setStartDate] = useState('2026-09-01');
  const [endDate, setEndDate] = useState('2026-09-30');
  const [budget, setBudget] = useState<number>(lineItemCurrency === 'USD' ? 1200 : 350000);
  const [primaryKpi, setPrimaryKpi] = useState<KpiMetricType>('impressions');
  const [primaryKpiTarget, setPrimaryKpiTarget] = useState<number>(500000);
  const [buyingKpi, setBuyingKpi] = useState<KpiMetricType | 'none'>('cpm');
  const [buyingKpiTarget, setBuyingKpiTarget] = useState<number>(lineItemCurrency === 'USD' ? 2.5 : 250);
  const [tolerance, setTolerance] = useState<number>(10);
  const [status, setStatus] = useState<'draft' | 'active' | 'paused' | 'completed'>('active');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  React.useEffect(() => {
    if (!currentAgency || !campaignId) return;
    ApiService.getCampaignDetails(currentAgency.id, campaignId).then(data => {
      if (data?.campaign) {
        if (data.campaign.start_date) setStartDate(data.campaign.start_date);
        if (data.campaign.end_date) setEndDate(data.campaign.end_date);
        if (data.campaign.currency && !currency) setLineItemCurrency(data.campaign.currency);
      }
    }).catch(() => {});
  }, [currentAgency, campaignId, currency]);

  const handlePlatformChange = (newPlatform: PlatformType) => {
    setPlatform(newPlatform);
    if (newPlatform === 'meta' && lineItemCurrency === 'LKR') {
      // Promptly recommend USD for Meta
      setLineItemCurrency('USD');
      if (budget === 350000) setBudget(1200);
      if (buyingKpiTarget === 250) setBuyingKpiTarget(2.5);
    }
  };

  const handlePrimaryKpiChange = (newKpi: KpiMetricType) => {
    setPrimaryKpi(newKpi);
    // Provide sensible default targets based on metric category
    if (newKpi === 'reach') {
      setPrimaryKpiTarget(350000);
      setBuyingKpi('cpm');
    } else if (newKpi === 'impressions') {
      setPrimaryKpiTarget(500000);
      setBuyingKpi('cpm');
    } else if (newKpi === 'video_views') {
      setPrimaryKpiTarget(200000);
      setBuyingKpi('cpv');
      setBuyingKpiTarget(lineItemCurrency === 'USD' ? 0.02 : 3.5);
    } else if (newKpi === 'clicks') {
      setPrimaryKpiTarget(15000);
      setBuyingKpi('cpc');
      setBuyingKpiTarget(lineItemCurrency === 'USD' ? 0.25 : 45);
    } else if (newKpi === 'conversions') {
      setPrimaryKpiTarget(500);
      setBuyingKpi('cpa');
      setBuyingKpiTarget(lineItemCurrency === 'USD' ? 15 : 650);
    } else if (newKpi === 'engagements') {
      setPrimaryKpiTarget(25000);
      setBuyingKpi('cpe');
      setBuyingKpiTarget(lineItemCurrency === 'USD' ? 0.05 : 12);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentAgency) return;
    setIsSubmitting(true);
    setError(null);

    try {
      await ApiService.createLineItem(currentAgency.id, {
        campaign_id: campaignId,
        client_id: clientId,
        brand_id: brandId,
        platform,
        platform_account_id: accountId.trim(),
        platform_campaign_id: platformCampaignId.trim(),
        name: name.trim(),
        objective,
        start_date: startDate,
        end_date: endDate,
        budget,
        currency: lineItemCurrency,
        primary_kpi: primaryKpi,
        primary_kpi_target: primaryKpiTarget,
        buying_kpi: buyingKpi !== 'none' ? buyingKpi : undefined,
        buying_kpi_target: buyingKpi !== 'none' && buyingKpiTarget > 0 ? buyingKpiTarget : undefined,
        status,
        pacing_tolerance: tolerance
      });
      window.dispatchEvent(new CustomEvent('refresh-omnitrack'));
      window.dispatchEvent(new CustomEvent('campaigns-updated'));
      onCreated();
      onClose();
    } catch (err: any) {
      setError(err.message);
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <Layers className="w-5 h-5 text-indigo-600" />
            <h3 className="text-base font-bold text-slate-900">Add Campaign Line Item (Level 3)</h3>
          </div>
          <button onClick={onClose} className="p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100">
            <X className="w-4 h-4" />
          </button>
        </div>

        {error && (
          <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-800">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Platform</label>
            <div className="grid grid-cols-3 gap-2">
              {(['meta', 'tiktok', 'google'] as PlatformType[]).map(plat => (
                <button
                  type="button"
                  key={plat}
                  onClick={() => handlePlatformChange(plat)}
                  className={`py-2 px-3 rounded-lg font-bold border capitalize transition-colors ${
                    platform === plat
                      ? 'bg-indigo-50 border-indigo-500 text-indigo-700'
                      : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {plat} Ads
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Line Item Name</label>
            <input
              type="text"
              required
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Meta - Ceylon Tea Brand Awareness"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs outline-none focus:border-indigo-500"
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Objective</label>
              <select
                value={objective}
                onChange={e => setObjective(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs outline-none"
              >
                <option value="Brand Awareness">Brand Awareness</option>
                <option value="Reach">Reach</option>
                <option value="Video Views">Video Views</option>
                <option value="Engagement">Engagement</option>
                <option value="Traffic">Traffic</option>
                <option value="Conversions">Conversions / Sales</option>
              </select>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Currency</label>
              <select
                value={lineItemCurrency}
                onChange={e => setLineItemCurrency(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs outline-none bg-white font-semibold"
              >
                <option value="USD">USD ($)</option>
                <option value="LKR">LKR (Rs.)</option>
              </select>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Allocated Budget
              </label>
              <FormattedNumberInput
                value={budget}
                onChange={val => setBudget(val)}
                prefix={lineItemCurrency === 'USD' ? '$' : 'Rs.'}
                placeholder="350,000"
                allowDecimals={lineItemCurrency === 'USD'}
                required
              />
            </div>
          </div>

          <div className="bg-slate-50/80 p-3.5 rounded-xl border border-slate-200/80 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-700">Platform Linkage</span>
              <span className="text-[10px] text-slate-500 font-medium px-2 py-0.5 rounded-full bg-slate-200/70">Optional</span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Platform Account ID
                </label>
                <input
                  type="text"
                  value={accountId}
                  onChange={e => setAccountId(e.target.value)}
                  placeholder="e.g. act_123456789 (optional)"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs outline-none font-mono bg-white focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Platform Campaign ID
                </label>
                <input
                  type="text"
                  value={platformCampaignId}
                  onChange={e => setPlatformCampaignId(e.target.value)}
                  placeholder="e.g. 23849182741 (optional)"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs outline-none font-mono bg-white focus:border-indigo-500"
                />
              </div>
            </div>

            <p className="text-[11px] text-slate-500 flex items-start gap-1.5 leading-relaxed">
              <span className="text-indigo-600 font-bold shrink-0">ℹ</span>
              <span>
                Not known yet? Leave blank. You can populate and map these IDs automatically later when importing CSV reports or syncing campaigns.
              </span>
            </p>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Start Date *</label>
              <input
                type="date"
                required
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs outline-none"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">End Date *</label>
              <input
                type="date"
                required
                value={endDate}
                onChange={e => setEndDate(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs outline-none"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Status *</label>
              <select
                value={status}
                onChange={e => setStatus(e.target.value as any)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs outline-none bg-white font-semibold"
              >
                <option value="active">Active</option>
                <option value="draft">Draft</option>
                <option value="paused">Paused</option>
                <option value="completed">Completed</option>
              </select>
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 space-y-4">
            {/* Primary Deliverable KPI */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="font-bold text-slate-900 uppercase block tracking-wider text-[11px] flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-indigo-600"></span>
                  Primary Deliverable KPI *
                </span>
                <span className="text-[10px] text-indigo-700 bg-indigo-50 font-semibold px-2 py-0.5 rounded-full border border-indigo-200/60">
                  Affects Campaign Health Rating
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
                    <optgroup label="Volume & Deliverable KPIs (Recommended)">
                      <option value="reach">Unique Reach (Users)</option>
                      <option value="impressions">Total Impressions</option>
                      <option value="video_views">Video Views</option>
                      <option value="clicks">Link Clicks</option>
                      <option value="conversions">Total Conversions</option>
                      <option value="engagements">Total Engagements</option>
                    </optgroup>
                    <optgroup label="Rate & Efficiency KPIs">
                      <option value="cpm">CPM (Cost per 1,000)</option>
                      <option value="cpc">CPC (Cost per Click)</option>
                      <option value="cpa">CPA (Cost per Acquisition)</option>
                      <option value="ctr">CTR (%)</option>
                      <option value="cpe">CPE (Cost per Engagement)</option>
                      <option value="roas">ROAS (Return on Spend)</option>
                    </optgroup>
                  </select>
                </div>

                <div>
                  <label className="block font-medium text-slate-600 mb-1">
                    Primary Target Number *
                  </label>
                  <FormattedNumberInput
                    value={primaryKpiTarget}
                    onChange={val => setPrimaryKpiTarget(val)}
                    placeholder="e.g. 500,000"
                    allowDecimals={!['impressions', 'reach', 'video_views', 'clicks', 'conversions', 'engagements'].includes(primaryKpi)}
                    required
                  />
                </div>
              </div>
            </div>

            {/* Buying KPI (Secondary KPI) */}
            <div className="pt-3 border-t border-slate-200/70">
              <div className="flex items-center justify-between mb-2">
                <span className="font-bold text-slate-900 uppercase block tracking-wider text-[11px] flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                  Secondary Buying KPI
                </span>
                <span className="text-[10px] text-slate-500 bg-slate-200/60 font-medium px-2 py-0.5 rounded-full">
                  Cost Efficiency Target
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-600 mb-1">Buying KPI Metric</label>
                  <select
                    value={buyingKpi}
                    onChange={e => setBuyingKpi(e.target.value as any)}
                    className="w-full px-2.5 py-2 border border-slate-200 rounded-lg text-xs outline-none bg-white font-semibold text-slate-800 focus:border-indigo-500"
                  >
                    <option value="none">-- None (No Buying Cap) --</option>
                    <option value="cpm">CPM (Target Cost per 1,000)</option>
                    <option value="cpc">CPC (Target Cost per Click)</option>
                    <option value="cpv">CPV (Target Cost per Video View)</option>
                    <option value="cpa">CPA (Target Cost per Acquisition)</option>
                    <option value="cpe">CPE (Target Cost per Engagement)</option>
                    <option value="roas">ROAS (Target Return on Ad Spend)</option>
                  </select>
                </div>

                <div>
                  <label className="block font-medium text-slate-600 mb-1">
                    Buying Target Value ({lineItemCurrency})
                  </label>
                  <FormattedNumberInput
                    value={buyingKpiTarget}
                    onChange={val => setBuyingKpiTarget(val)}
                    prefix={lineItemCurrency === 'USD' ? '$' : undefined}
                    placeholder="e.g. 250"
                    allowDecimals={true}
                    disabled={buyingKpi === 'none'}
                  />
                </div>
              </div>
            </div>

            {/* Pacing Tolerance */}
            <div className="pt-3 border-t border-slate-200/70 flex items-center justify-between">
              <div>
                <label className="block font-medium text-slate-700">Flight Pacing Tolerance (±%)</label>
                <span className="text-[11px] text-slate-400">Acceptable drift before flagging health warning</span>
              </div>
              <div className="w-28">
                <FormattedNumberInput
                  value={tolerance}
                  onChange={val => setTolerance(val)}
                  suffix="%"
                  placeholder="10"
                  allowDecimals={false}
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-700 disabled:opacity-50 shadow-xs"
            >
              {isSubmitting ? 'Adding...' : 'Create Line Item'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
