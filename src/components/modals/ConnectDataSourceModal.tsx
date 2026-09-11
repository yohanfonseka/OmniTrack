import React, { useState, useEffect } from 'react';
import { CampaignLineItem, PlatformAccount, LineItemDataSource } from '../../types';
import { ApiService } from '../../lib/api';
import {
  Link2,
  X,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Search,
  RefreshCw,
  Target,
  ArrowRight,
  ShieldCheck,
  Building2,
  Info
} from 'lucide-react';

interface AvailablePlatformCampaign {
  campaign_id: string;
  campaign_name: string;
  platform: string;
  platform_account_id: string;
  platform_account_name: string;
  status: string;
  start_date: string;
  end_date: string;
  objective: string;
  total_spend: number;
  currency: string;
  is_recommended: boolean;
  match_score: number;
  match_reasons: string[];
  stars: number;
}

interface ConnectDataSourceModalProps {
  agencyId: string;
  lineItem: CampaignLineItem;
  onClose: () => void;
  onConnected: () => void;
}

export const ConnectDataSourceModal: React.FC<ConnectDataSourceModalProps> = ({
  agencyId,
  lineItem,
  onClose,
  onConnected
}) => {
  const [accounts, setAccounts] = useState<PlatformAccount[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const [availableCampaigns, setAvailableCampaigns] = useState<AvailablePlatformCampaign[]>([]);
  const [existingDataSources, setExistingDataSources] = useState<LineItemDataSource[]>([]);
  
  const [loadingAccounts, setLoadingAccounts] = useState<boolean>(true);
  const [loadingCampaigns, setLoadingCampaigns] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Selected candidate
  const [selectedCampaignId, setSelectedCampaignId] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [customMode, setCustomMode] = useState<boolean>(false);
  const [customCampaignId, setCustomCampaignId] = useState<string>('');
  const [customCampaignName, setCustomCampaignName] = useState<string>('');

  // 1. Fetch Ad Accounts for this line item's platform
  useEffect(() => {
    let isMounted = true;
    const loadAccountsAndSources = async () => {
      setLoadingAccounts(true);
      setError(null);
      try {
        const [accList, currentSources] = await Promise.all([
          ApiService.getPlatformAccounts(agencyId, lineItem.platform),
          ApiService.getLineItemDataSources(agencyId, lineItem.id)
        ]);

        if (!isMounted) return;
        setAccounts(accList);
        setExistingDataSources(currentSources);

        // Preselect account: use lineItem.platform_account_id if valid and in list, else first account
        const matched = accList.find(a => a.account_id === lineItem.platform_account_id);
        if (matched) {
          setSelectedAccountId(matched.account_id);
        } else if (accList.length > 0) {
          setSelectedAccountId(accList[0].account_id);
        }
      } catch (err: any) {
        if (isMounted) {
          setError(err.message || 'Failed to load platform accounts');
        }
      } finally {
        if (isMounted) setLoadingAccounts(false);
      }
    };

    loadAccountsAndSources();
    return () => {
      isMounted = false;
    };
  }, [agencyId, lineItem.id, lineItem.platform, lineItem.platform_account_id]);

  // 2. Fetch available platform campaigns when selectedAccountId changes
  useEffect(() => {
    if (!selectedAccountId) return;
    let isMounted = true;

    const loadCampaigns = async () => {
      setLoadingCampaigns(true);
      setError(null);
      try {
        const candidates = await ApiService.getAvailablePlatformCampaigns(
          agencyId,
          lineItem.id,
          selectedAccountId
        );
        if (!isMounted) return;
        setAvailableCampaigns(candidates);

        // Auto-select the top recommended candidate if available
        if (candidates.length > 0) {
          const topRec = candidates.find(c => c.is_recommended) || candidates[0];
          setSelectedCampaignId(topRec.campaign_id);
        } else {
          setSelectedCampaignId('');
        }
      } catch (err: any) {
        if (isMounted) {
          setError(err.message || 'Failed to load available platform campaigns');
        }
      } finally {
        if (isMounted) setLoadingCampaigns(false);
      }
    };

    loadCampaigns();
    return () => {
      isMounted = false;
    };
  }, [agencyId, lineItem.id, selectedAccountId]);

  const selectedCandidate = availableCampaigns.find(c => c.campaign_id === selectedCampaignId);
  const selectedAccount = accounts.find(a => a.account_id === selectedAccountId);

  // Filter candidates by search query
  const filteredCandidates = availableCampaigns.filter(c => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      c.campaign_name.toLowerCase().includes(q) ||
      c.campaign_id.toLowerCase().includes(q) ||
      c.objective.toLowerCase().includes(q)
    );
  });

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    let campaignIdToLink = selectedCampaignId;
    let campaignNameToLink = selectedCandidate?.campaign_name || '';

    if (customMode) {
      if (!customCampaignId.trim() || !customCampaignName.trim()) {
        setError('Please provide both Platform Campaign ID and Campaign Name.');
        return;
      }
      campaignIdToLink = customCampaignId.trim();
      campaignNameToLink = customCampaignName.trim();
    }

    if (!selectedAccountId) {
      setError('Please select a connected ad account.');
      return;
    }

    if (!campaignIdToLink) {
      setError('Please select or specify a platform campaign to link.');
      return;
    }

    setIsSubmitting(true);
    try {
      await ApiService.connectLineItemDataSource(agencyId, lineItem.id, {
        platform: lineItem.platform,
        platform_account_id: selectedAccountId,
        platform_campaign_id: campaignIdToLink,
        platform_campaign_name: campaignNameToLink,
        connection_id: selectedAccount?.connection_id
      });

      // Dispatch refresh events
      window.dispatchEvent(new CustomEvent('refresh-omnitrack'));
      window.dispatchEvent(new CustomEvent('campaigns-updated'));

      onConnected();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to connect data source');
      setIsSubmitting(false);
    }
  };

  const getPlatformBadgeColor = (plat: string) => {
    switch (plat) {
      case 'meta':
        return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'tiktok':
        return 'bg-slate-900 text-white border-slate-800';
      case 'google':
        return 'bg-amber-50 text-amber-800 border-amber-200';
      default:
        return 'bg-indigo-50 text-indigo-700 border-indigo-200';
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl space-y-5 max-h-[92vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-start justify-between pb-4 border-b border-slate-100">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-indigo-50 text-indigo-600 border border-indigo-100">
                <Link2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Connect Platform Data Source</h3>
                <p className="text-xs text-slate-500">
                  Map live advertising delivery metrics into this campaign line item
                </p>
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Target Line Item Context Card */}
        <div className="bg-slate-50 border border-slate-200/90 rounded-xl p-4 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-slate-500 uppercase tracking-wider text-[10px]">
              Target Campaign Line Item (Level 3)
            </span>
            <span
              className={`text-[11px] font-bold px-2 py-0.5 rounded border uppercase ${getPlatformBadgeColor(
                lineItem.platform
              )}`}
            >
              {lineItem.platform} Ads
            </span>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <div className="text-sm font-bold text-slate-900">{lineItem.name}</div>
              <div className="text-xs text-slate-500 flex items-center gap-2 mt-0.5">
                <span>Objective: <strong>{lineItem.objective}</strong></span>
                <span>•</span>
                <span>Flight: {lineItem.start_date} to {lineItem.end_date}</span>
              </div>
            </div>
            <div className="text-right sm:self-center shrink-0">
              <div className="text-xs font-bold text-slate-900">
                {lineItem.currency || 'LKR'} {Number(lineItem.budget).toLocaleString()}
              </div>
              <div className="text-[10px] text-slate-400">Target Budget</div>
            </div>
          </div>
        </div>

        {/* Existing mappings if any */}
        {existingDataSources.length > 0 && (
          <div className="bg-indigo-50/70 border border-indigo-200/80 rounded-xl p-3 text-xs space-y-2">
            <div className="flex items-center justify-between font-semibold text-indigo-950">
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-indigo-600" />
                <span>Currently Connected Data Sources ({existingDataSources.length})</span>
              </span>
              <span className="text-[10px] text-indigo-700">Multi-source linkage supported</span>
            </div>
            <div className="divide-y divide-indigo-100 bg-white/80 rounded-lg p-2 border border-indigo-100/60">
              {existingDataSources.map(ds => (
                <div key={ds.id} className="py-1.5 flex items-center justify-between text-[11px]">
                  <div className="truncate pr-2">
                    <span className="font-bold text-slate-900">{ds.platform_campaign_name}</span>
                    <span className="text-slate-500 font-mono ml-2">({ds.platform_campaign_id})</span>
                  </div>
                  <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 font-bold border border-emerald-200">
                    {ds.status.toUpperCase()}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {error && (
          <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
            <div className="flex-1">{error}</div>
          </div>
        )}

        <form onSubmit={handleConnect} className="space-y-4">
          {/* Step 1: Select Platform Ad Account */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider">
              Step 1: Select Connected {lineItem.platform.toUpperCase()} Ad Account
            </label>
            {loadingAccounts ? (
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-500 flex items-center gap-2">
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-indigo-600" />
                <span>Loading registered ad accounts...</span>
              </div>
            ) : accounts.length === 0 ? (
              <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-800">
                No active ad accounts found for {lineItem.platform}. Please connect an ad account in Settings or Superuser.
              </div>
            ) : (
              <select
                id="select-ad-account"
                value={selectedAccountId}
                onChange={e => setSelectedAccountId(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs outline-none bg-white font-medium text-slate-800 focus:border-indigo-500"
              >
                {accounts.map(acc => (
                  <option key={acc.account_id} value={acc.account_id}>
                    {acc.account_name} ({acc.account_id}) — {acc.currency}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Step 2: Select Platform Campaign */}
          <div className="space-y-2 pt-2 border-t border-slate-100">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider">
                Step 2: Match Platform Campaign
              </label>
              <button
                type="button"
                onClick={() => setCustomMode(!customMode)}
                className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-800"
              >
                {customMode ? '← Pick from discovered campaigns' : 'Enter manual Campaign ID'}
              </button>
            </div>

            {customMode ? (
              /* Manual Input Form */
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-3 text-xs">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Platform Campaign ID (e.g. Meta / TikTok numeric ID)
                  </label>
                  <input
                    type="text"
                    required
                    value={customCampaignId}
                    onChange={e => setCustomCampaignId(e.target.value)}
                    placeholder="e.g. 23849102401"
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs outline-none font-mono bg-white focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Platform Campaign Name
                  </label>
                  <input
                    type="text"
                    required
                    value={customCampaignName}
                    onChange={e => setCustomCampaignName(e.target.value)}
                    placeholder="e.g. Summer Awareness Campaign"
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs outline-none bg-white focus:border-indigo-500"
                  />
                </div>
              </div>
            ) : (
              /* Discovered / Candidate Campaigns */
              <div className="space-y-2.5">
                {/* Search candidate filter */}
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder="Search candidate platform campaigns by name or ID..."
                    className="w-full pl-8 pr-3 py-1.5 border border-slate-200 rounded-lg text-xs outline-none bg-white focus:border-indigo-500"
                  />
                </div>

                {loadingCampaigns ? (
                  <div className="p-6 rounded-xl bg-slate-50 border border-slate-200 text-center text-xs text-slate-500 space-y-2">
                    <RefreshCw className="w-5 h-5 animate-spin mx-auto text-indigo-600" />
                    <p>Fetching platform campaigns and calculating match recommendations...</p>
                  </div>
                ) : filteredCandidates.length === 0 ? (
                  <div className="p-6 rounded-xl bg-slate-50 border border-slate-200 text-center text-xs text-slate-500 space-y-2">
                    <p className="font-semibold text-slate-700">No unmapped platform campaigns found</p>
                    <p className="text-[11px]">
                      All existing campaigns on this ad account may already be linked, or try entering the ID manually.
                    </p>
                    <button
                      type="button"
                      onClick={() => setCustomMode(true)}
                      className="mt-2 inline-flex items-center gap-1 px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      Enter Manual ID
                    </button>
                  </div>
                ) : (
                  <div className="max-h-60 overflow-y-auto space-y-2 pr-1 divide-y divide-slate-100">
                    {filteredCandidates.map(candidate => {
                      const isSelected = candidate.campaign_id === selectedCampaignId;
                      return (
                        <div
                          key={candidate.campaign_id}
                          id={`candidate-${candidate.campaign_id}`}
                          onClick={() => setSelectedCampaignId(candidate.campaign_id)}
                          className={`p-3 rounded-xl border transition-all cursor-pointer ${
                            isSelected
                              ? 'bg-indigo-50/80 border-indigo-500 ring-1 ring-indigo-500/30'
                              : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="space-y-1 flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-bold text-slate-900 text-xs">
                                  {candidate.campaign_name}
                                </span>
                                {candidate.is_recommended && (
                                  <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300">
                                    <Sparkles className="w-3 h-3 text-emerald-600" />
                                    <span>Top Recommendation ({candidate.match_score}%)</span>
                                  </span>
                                )}
                              </div>

                              <div className="text-[11px] text-slate-500 flex items-center gap-3 font-mono">
                                <span>ID: {candidate.campaign_id}</span>
                                <span>•</span>
                                <span>Spend: {candidate.currency} {candidate.total_spend.toLocaleString()}</span>
                                <span>•</span>
                                <span className="font-sans font-medium text-slate-600">
                                  {candidate.objective}
                                </span>
                              </div>

                              {/* Match explanations */}
                              {candidate.match_reasons.length > 0 && (
                                <div className="text-[10px] text-indigo-700 pt-0.5 flex items-center gap-1">
                                  <span className="font-semibold">Match Factors:</span>
                                  <span>{candidate.match_reasons.join(' • ')}</span>
                                </div>
                              )}
                            </div>

                            {/* Radio check indicator */}
                            <div className="shrink-0 pt-0.5">
                              <div
                                className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                                  isSelected
                                    ? 'border-indigo-600 bg-indigo-600 text-white'
                                    : 'border-slate-300 bg-white'
                                }`}
                              >
                                {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Mapping Confirmation Box */}
          <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200/90 text-xs text-slate-600 flex items-start gap-2.5">
            <ShieldCheck className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
            <div className="leading-relaxed text-[11px]">
              <strong>Data Isolation & Integrity:</strong> Once mapped, performance metrics from this platform campaign will be attributed directly to Line Item <strong>"{lineItem.name}"</strong> and recalculated into the Business Campaign totals. Duplicate platform campaign mappings are strictly prevented.
            </div>
          </div>

          {/* Modal Actions */}
          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              id="btn-confirm-connect-data-source"
              disabled={isSubmitting || (!customMode && !selectedCampaignId)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-700 disabled:opacity-50 transition-colors shadow-xs"
            >
              <Link2 className="w-3.5 h-3.5" />
              <span>{isSubmitting ? 'Linking Data Source...' : 'Link Platform Campaign'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
