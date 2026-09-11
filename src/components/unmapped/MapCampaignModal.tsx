import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { ApiService } from '../../lib/api';
import {
  UnmappedCampaign,
  Client,
  Brand,
  Campaign,
  CampaignLineItem,
  KpiMetricType
} from '../../types';
import {
  X,
  Link2,
  PlusCircle,
  AlertCircle,
  CheckCircle2,
  Calendar,
  DollarSign,
  TrendingUp,
  Layers,
  Sparkles,
  ArrowRight
} from 'lucide-react';
import { FormattedNumberInput } from '../common/FormattedNumberInput';
import { formatMoney, formatNumber } from '../../lib/formatters';

interface MapCampaignModalProps {
  unmappedCampaign: UnmappedCampaign | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export const MapCampaignModal: React.FC<MapCampaignModalProps> = ({
  unmappedCampaign,
  isOpen,
  onClose,
  onSuccess
}) => {
  const { currentAgency, refreshUnmappedCount } = useAuth();

  const [mode, setMode] = useState<'existing' | 'new'>('existing');
  const [clients, setClients] = useState<Client[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [lineItems, setLineItems] = useState<CampaignLineItem[]>([]);
  const [loadingData, setLoadingData] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Form State - Existing Campaign Mode
  const [selectedClientId, setSelectedClientId] = useState<string>('');
  const [selectedBrandId, setSelectedBrandId] = useState<string>('');
  const [selectedCampaignId, setSelectedCampaignId] = useState<string>('');
  const [lineItemMode, setLineItemMode] = useState<'existing' | 'create_new'>('create_new');
  const [selectedLineItemId, setSelectedLineItemId] = useState<string>('');

  // Form State - New Line Item options
  const [newLineItemName, setNewLineItemName] = useState<string>('');
  const [newLineItemBudget, setNewLineItemBudget] = useState<number>(250000);
  const [newLineItemKpi, setNewLineItemKpi] = useState<KpiMetricType>('cpa');
  const [newLineItemKpiTarget, setNewLineItemKpiTarget] = useState<number>(2500);

  // Form State - New Campaign Mode
  const [newCampaignName, setNewCampaignName] = useState<string>('');
  const [newCampaignObjective, setNewCampaignObjective] = useState<string>('Conversions');
  const [newCampaignBudget, setNewCampaignBudget] = useState<number>(350000);
  const [newCampaignStartDate, setNewCampaignStartDate] = useState<string>('2026-09-01');
  const [newCampaignEndDate, setNewCampaignEndDate] = useState<string>('2026-09-30');

  useEffect(() => {
    if (!isOpen || !currentAgency) return;

    const loadData = async () => {
      setLoadingData(true);
      setErrorMsg(null);
      try {
        const [cList, bList, campList, lList] = await Promise.all([
          ApiService.getClients(currentAgency.id),
          ApiService.getBrands(currentAgency.id),
          ApiService.getCampaigns(currentAgency.id),
          ApiService.getLineItems(currentAgency.id)
        ]);

        setClients(cList);
        setBrands(bList);
        setCampaigns(campList);
        setLineItems(lList);

        // Pre-fill smart defaults based on unmapped campaign
        if (unmappedCampaign) {
          // Detect client/brand if present
          let matchedClient = cList.find(c => c.id === unmappedCampaign.client_id);
          if (!matchedClient && cList.length > 0) {
            // Check if name has hints
            matchedClient = cList.find(c =>
              unmappedCampaign.platform_campaign_name.toLowerCase().includes(c.name.toLowerCase()) ||
              (unmappedCampaign.platform_account_name && unmappedCampaign.platform_account_name.toLowerCase().includes(c.name.toLowerCase()))
            ) || cList[0];
          }

          if (matchedClient) {
            setSelectedClientId(matchedClient.id);
            const clientBrands = bList.filter(b => b.client_id === matchedClient!.id);
            const initialBrand = clientBrands[0] || bList[0];
            if (initialBrand) {
              setSelectedBrandId(initialBrand.id);
            }
          }

          // Default new campaign values
          setNewCampaignName(unmappedCampaign.platform_campaign_name);
          setNewCampaignObjective(unmappedCampaign.objective || 'Conversions');
          const suggestedBudget = Math.max(Math.round(unmappedCampaign.total_spend * 1.3), 200000);
          setNewCampaignBudget(suggestedBudget);
          setNewLineItemBudget(Math.round(unmappedCampaign.total_spend * 1.2) || 200000);
          setNewLineItemName(`${unmappedCampaign.platform.toUpperCase()} - ${unmappedCampaign.platform_campaign_name}`);
          if (unmappedCampaign.first_report_date) {
            setNewCampaignStartDate(unmappedCampaign.first_report_date);
          }
          if (unmappedCampaign.last_report_date) {
            setNewCampaignEndDate(unmappedCampaign.last_report_date);
          }
        }
      } catch (err: any) {
        setErrorMsg(`Failed to load system entities: ${err.message}`);
      } finally {
        setLoadingData(false);
      }
    };

    loadData();
  }, [isOpen, currentAgency, unmappedCampaign]);

  // When client changes, filter brands & campaigns
  const availableBrands = brands.filter(b => !selectedClientId || b.client_id === selectedClientId);
  const availableCampaigns = campaigns.filter(c => {
    if (selectedClientId && c.client_id !== selectedClientId) return false;
    if (selectedBrandId && c.brand_id !== selectedBrandId) return false;
    return true;
  });

  // Auto-select first campaign when availableCampaigns changes
  useEffect(() => {
    if (availableCampaigns.length > 0) {
      if (!selectedCampaignId || !availableCampaigns.some(c => c.id === selectedCampaignId)) {
        setSelectedCampaignId(availableCampaigns[0].id);
      }
    } else {
      setSelectedCampaignId('');
    }
  }, [selectedClientId, selectedBrandId, availableCampaigns]);

  // Line items for the selected campaign
  const availableLines = lineItems.filter(l => l.campaign_id === selectedCampaignId);
  const matchingPlatformLines = availableLines.filter(
    l => unmappedCampaign && l.platform.toLowerCase() === unmappedCampaign.platform.toLowerCase()
  );

  useEffect(() => {
    if (matchingPlatformLines.length > 0) {
      setSelectedLineItemId(matchingPlatformLines[0].id);
      setLineItemMode('existing');
    } else {
      setLineItemMode('create_new');
    }
  }, [selectedCampaignId, unmappedCampaign]);

  if (!isOpen || !unmappedCampaign) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentAgency) return;

    setSubmitting(true);
    setErrorMsg(null);

    try {
      if (mode === 'existing') {
        if (!selectedCampaignId) {
          throw new Error('Please select a target campaign to link this ad data to.');
        }

        const payload: any = {
          target_campaign_id: selectedCampaignId
        };

        if (lineItemMode === 'existing' && selectedLineItemId) {
          payload.target_line_item_id = selectedLineItemId;
        } else {
          payload.new_line_item = {
            name: newLineItemName || `${unmappedCampaign.platform.toUpperCase()} - ${unmappedCampaign.platform_campaign_name}`,
            budget: Number(newLineItemBudget) || 200000,
            primary_kpi: newLineItemKpi,
            primary_kpi_target: Number(newLineItemKpiTarget) || 2500
          };
        }

        await ApiService.mapUnmappedCampaign(currentAgency.id, unmappedCampaign.id, payload);
      } else {
        // Create new campaign mode
        if (!selectedClientId) {
          throw new Error('Please select a Client for the new campaign.');
        }
        if (!newCampaignName.trim()) {
          throw new Error('Please enter a Campaign Name.');
        }

        const payload = {
          new_campaign: {
            client_id: selectedClientId,
            brand_id: selectedBrandId || availableBrands[0]?.id || '',
            name: newCampaignName.trim(),
            objective: newCampaignObjective,
            total_budget: Number(newCampaignBudget) || 350000,
            start_date: newCampaignStartDate,
            end_date: newCampaignEndDate,
            currency: unmappedCampaign.currency || 'LKR'
          },
          new_line_item: {
            name: newLineItemName || `${unmappedCampaign.platform.toUpperCase()} - ${unmappedCampaign.platform_campaign_name}`,
            budget: Number(newLineItemBudget) || Math.round(newCampaignBudget * 0.8),
            primary_kpi: newLineItemKpi,
            primary_kpi_target: Number(newLineItemKpiTarget) || 2500
          }
        };

        await ApiService.mapUnmappedCampaign(currentAgency.id, unmappedCampaign.id, payload);
      }

      // Trigger global event updates
      window.dispatchEvent(new CustomEvent('refresh-omnitrack'));
      window.dispatchEvent(new CustomEvent('campaigns-updated'));
      await refreshUnmappedCount();

      if (onSuccess) onSuccess();
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to map campaign');
    } finally {
      setSubmitting(false);
    }
  };

  const platformBadgeStyle = (platform: string) => {
    switch (platform.toLowerCase()) {
      case 'meta':
        return 'bg-blue-600 text-white';
      case 'tiktok':
        return 'bg-slate-900 text-white';
      case 'google':
        return 'bg-emerald-600 text-white';
      default:
        return 'bg-indigo-600 text-white';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl overflow-hidden my-8">
        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-100 flex items-start justify-between bg-slate-50/70">
          <div>
            <div className="flex items-center gap-2">
              <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider ${platformBadgeStyle(unmappedCampaign.platform)}`}>
                {unmappedCampaign.platform}
              </span>
              <span className="text-xs text-slate-500 font-mono">
                ID: {unmappedCampaign.platform_campaign_id}
              </span>
            </div>
            <h2 className="text-lg font-bold text-slate-900 mt-1.5 leading-snug">
              Add Unmapped Campaign to System
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Connect this advertising campaign's metrics to an active campaign.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200/50 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Campaign Metrics Snapshot Card */}
        <div className="px-6 py-4 bg-indigo-50/50 border-b border-indigo-100/60 flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0 flex-1">
            <span className="text-[11px] font-bold text-indigo-700 uppercase tracking-wide">
              Platform Campaign Name
            </span>
            <p className="font-bold text-slate-900 text-sm truncate">
              {unmappedCampaign.platform_campaign_name}
            </p>
            {unmappedCampaign.platform_account_name && (
              <p className="text-[11px] text-slate-500 truncate">
                Ad Account: {unmappedCampaign.platform_account_name} ({unmappedCampaign.platform_account_id})
              </p>
            )}
          </div>
          <div className="flex items-center gap-4 text-right">
            <div>
              <span className="text-[10px] text-slate-500 uppercase block font-semibold">
                Ingested Spend
              </span>
              <span className="text-sm font-extrabold text-slate-900">
                {formatMoney(unmappedCampaign.total_spend, unmappedCampaign.currency)}
              </span>
            </div>
            <div className="border-l border-indigo-200 pl-4">
              <span className="text-[10px] text-slate-500 uppercase block font-semibold">
                Activity
              </span>
              <span className="text-xs font-bold text-slate-700">
                {formatNumber(unmappedCampaign.total_impressions)} imp · {formatNumber(unmappedCampaign.total_clicks)} clk
              </span>
            </div>
          </div>
        </div>

        {/* Mode Selector Tabs */}
        <div className="px-6 pt-4 border-b border-slate-200 flex gap-2">
          <button
            type="button"
            onClick={() => setMode('existing')}
            className={`pb-3 px-3 text-xs font-bold transition-all border-b-2 flex items-center gap-1.5 ${
              mode === 'existing'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Link2 className="w-3.5 h-3.5" />
            Add to Existing Campaign
          </button>
          <button
            type="button"
            onClick={() => setMode('new')}
            className={`pb-3 px-3 text-xs font-bold transition-all border-b-2 flex items-center gap-1.5 ${
              mode === 'new'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <PlusCircle className="w-3.5 h-3.5" />
            Create New Campaign & Map
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {errorMsg && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-center gap-2 text-rose-700 text-xs">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Client & Brand Selection */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Client Organization *
              </label>
              <select
                value={selectedClientId}
                onChange={e => {
                  setSelectedClientId(e.target.value);
                  const relatedBrands = brands.filter(b => b.client_id === e.target.value);
                  if (relatedBrands.length > 0) setSelectedBrandId(relatedBrands[0].id);
                }}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs font-medium text-slate-900 bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                required
              >
                <option value="">— Select Client —</option>
                {clients.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.currency})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Brand / Vertical
              </label>
              <select
                value={selectedBrandId}
                onChange={e => setSelectedBrandId(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs font-medium text-slate-900 bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              >
                <option value="">— All Brands —</option>
                {availableBrands.map(b => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {mode === 'existing' ? (
            /* Mode 1: Map to Existing Campaign */
            <div className="space-y-4 pt-2">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Target Campaign *
                  </label>
                  <span className="text-[11px] text-slate-500">
                    {availableCampaigns.length} campaigns available
                  </span>
                </div>
                {availableCampaigns.length === 0 ? (
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-xs flex items-center justify-between">
                    <span>No campaigns found for this client/brand.</span>
                    <button
                      type="button"
                      onClick={() => setMode('new')}
                      className="font-bold underline text-amber-900 ml-2"
                    >
                      Create one now
                    </button>
                  </div>
                ) : (
                  <select
                    value={selectedCampaignId}
                    onChange={e => setSelectedCampaignId(e.target.value)}
                    className="w-full px-3 py-2.5 border border-slate-300 rounded-xl text-xs font-medium text-slate-900 bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    required
                  >
                    {availableCampaigns.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.name} (Budget: {c.currency} {c.total_budget.toLocaleString()} · {c.status.toUpperCase()})
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* Target Line Item options */}
              {selectedCampaignId && (
                <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
                  <span className="block text-xs font-bold text-slate-800 uppercase tracking-wide">
                    Platform Line Item Configuration
                  </span>

                  <div className="flex gap-4">
                    <label className="flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
                      <input
                        type="radio"
                        name="lineItemMode"
                        checked={lineItemMode === 'create_new'}
                        onChange={() => setLineItemMode('create_new')}
                        className="text-indigo-600 focus:ring-indigo-500"
                      />
                      <span>Create New {unmappedCampaign.platform.toUpperCase()} Line Item</span>
                    </label>
                    {availableLines.length > 0 && (
                      <label className="flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
                        <input
                          type="radio"
                          name="lineItemMode"
                          checked={lineItemMode === 'existing'}
                          onChange={() => setLineItemMode('existing')}
                          className="text-indigo-600 focus:ring-indigo-500"
                        />
                        <span>Attach to Existing Line Item ({availableLines.length})</span>
                      </label>
                    )}
                  </div>

                  {lineItemMode === 'existing' ? (
                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
                        Select Line Item
                      </label>
                      <select
                        value={selectedLineItemId}
                        onChange={e => setSelectedLineItemId(e.target.value)}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-medium text-slate-900 bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                      >
                        {availableLines.map(l => {
                          const isPending = !l.platform_campaign_id || l.platform_campaign_id.startsWith('cid_');
                          return (
                            <option key={l.id} value={l.id}>
                              {l.name} ({l.platform.toUpperCase()} · Budget: {l.currency} {l.budget.toLocaleString()}{isPending ? ' — Ready for mapping' : ''})
                            </option>
                          );
                        })}
                      </select>
                      <p className="text-[11px] text-slate-500 mt-1.5 flex items-center gap-1.5">
                        <span className="text-emerald-600 font-bold">✓</span>
                        <span>Will automatically populate Platform Campaign ID <code className="font-mono text-slate-700 bg-white px-1 py-0.5 rounded border border-slate-200">{unmappedCampaign.platform_campaign_id}</code> onto this line item.</span>
                      </p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                      <div className="sm:col-span-2">
                        <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
                          Line Item Name
                        </label>
                        <input
                          type="text"
                          value={newLineItemName}
                          onChange={e => setNewLineItemName(e.target.value)}
                          placeholder="e.g. META - Retargeting Catalog"
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs text-slate-900 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
                          Line Item Budget ({unmappedCampaign.currency})
                        </label>
                        <FormattedNumberInput
                          value={newLineItemBudget}
                          onChange={val => setNewLineItemBudget(val)}
                          prefix={unmappedCampaign.currency === 'USD' ? '$' : 'Rs.'}
                          placeholder="250,000"
                          allowDecimals={unmappedCampaign.currency === 'USD'}
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
                          Primary KPI
                        </label>
                        <select
                          value={newLineItemKpi}
                          onChange={e => setNewLineItemKpi(e.target.value as KpiMetricType)}
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs text-slate-900 bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                        >
                          <option value="cpa">CPA (Cost per Acquisition)</option>
                          <option value="cpc">CPC (Cost per Click)</option>
                          <option value="cpm">CPM (Cost per Mille)</option>
                          <option value="ctr">CTR (Click-through Rate)</option>
                          <option value="roas">ROAS (Return on Ad Spend)</option>
                        </select>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            /* Mode 2: Create Brand New Campaign */
            <div className="space-y-4 pt-2">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  New Campaign Name *
                </label>
                <input
                  type="text"
                  value={newCampaignName}
                  onChange={e => setNewCampaignName(e.target.value)}
                  placeholder="e.g. Summer Clearance Campaign 2026"
                  className="w-full px-3 py-2.5 border border-slate-300 rounded-xl text-xs font-medium text-slate-900 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  required
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Marketing Objective
                  </label>
                  <select
                    value={newCampaignObjective}
                    onChange={e => setNewCampaignObjective(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs text-slate-900 bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  >
                    <option value="Conversions">Conversions / Sales</option>
                    <option value="Traffic">Traffic & Consideration</option>
                    <option value="Brand Awareness">Brand Awareness</option>
                    <option value="Lead Generation">Lead Generation</option>
                    <option value="Video Views">Video Views</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Total Campaign Budget ({unmappedCampaign.currency}) *
                  </label>
                  <FormattedNumberInput
                    value={newCampaignBudget}
                    onChange={val => setNewCampaignBudget(val)}
                    prefix={unmappedCampaign.currency === 'USD' ? '$' : 'Rs.'}
                    placeholder="350,000"
                    allowDecimals={unmappedCampaign.currency === 'USD'}
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Start Date
                  </label>
                  <input
                    type="date"
                    value={newCampaignStartDate}
                    onChange={e => setNewCampaignStartDate(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs text-slate-900 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    End Date
                  </label>
                  <input
                    type="date"
                    value={newCampaignEndDate}
                    onChange={e => setNewCampaignEndDate(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs text-slate-900 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Transfer Notice Banner */}
          <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs flex items-start gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold">Instant Metrics Attribution:</span> All {unmappedCampaign.row_count || 1} reporting dates representing{' '}
              <span className="font-bold">{unmappedCampaign.currency} {unmappedCampaign.total_spend.toLocaleString()}</span> in ad spend will be transferred. Pacing and dashboard charts will update immediately.
            </div>
          </div>

          {/* Modal Footer */}
          <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || (mode === 'existing' && !selectedCampaignId)}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-md hover:shadow-lg disabled:opacity-50 transition-all cursor-pointer"
            >
              {submitting ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Transferring & Mapping...</span>
                </>
              ) : (
                <>
                  <Link2 className="w-4 h-4" />
                  <span>Confirm Mapping & Transfer Data</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
