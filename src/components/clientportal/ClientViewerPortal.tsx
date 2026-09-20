import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { CampaignCalculatedMetrics } from '../../types';
import { ApiService } from '../../lib/api';
import { CampaignOverview } from '../dashboard/CampaignOverview';
import { PlatformBreakdown } from '../dashboard/PlatformBreakdown';
import {
  ExternalLink,
  ShieldCheck,
  Building,
  Target,
  Clock,
  Sparkles,
  Lock
} from 'lucide-react';

export const ClientViewerPortal: React.FC = () => {
  const { currentUser, currentAgency } = useAuth();
  const [campaigns, setCampaigns] = useState<CampaignCalculatedMetrics[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    if (!currentAgency) return;
    setLoading(true);
    // No fallback client: an account with none assigned must see nothing, not
    // somebody else's campaigns. The server pins the scope regardless of what
    // is sent here.
    ApiService.getCampaigns(currentAgency.id, currentUser.client_id)
      .then(list => {
        setCampaigns(list);
        if (list.length > 0) setSelectedCampaignId(list[0].campaign.id);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [currentAgency, currentUser]);

  const activeCampaign = campaigns.find(c => c.campaign.id === selectedCampaignId);

  return (
    <div className="space-y-6 max-w-7xl mx-auto py-2">
      {/* Read-only Client Portal Header */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-slate-900 tracking-tight">Client Campaign Performance Portal</h2>
            <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 font-bold border border-emerald-200 flex items-center gap-1">
              <Lock className="w-3 h-3" />
              <span>Read-Only Stakeholder Access</span>
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs text-slate-500 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200">
          <Clock className="w-3.5 h-3.5 text-slate-400" />
          <span>Delivery and pacing as at the latest imported report</span>
        </div>
      </div>

      {/* Campaign Selector if multiple */}
      {campaigns.length > 1 && (
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          {campaigns.map(c => (
            <button
              key={c.campaign.id}
              onClick={() => setSelectedCampaignId(c.campaign.id)}
              className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-2 border ${
                c.campaign.id === selectedCampaignId
                  ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
              }`}
            >
              <Target className="w-3.5 h-3.5" />
              <span>{c.campaign.name}</span>
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center text-slate-400">
          Loading client dashboard metrics...
        </div>
      ) : activeCampaign ? (
        <div className="space-y-6">
          <CampaignOverview campaignMetrics={activeCampaign} readOnly />
          <PlatformBreakdown
            platforms={activeCampaign.platforms}
            currency={activeCampaign.campaign.currency}
            readOnly
          />
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center text-slate-400">
          {currentUser.client_id
            ? 'No campaigns are running for your account yet.'
            : 'This account is not linked to a client yet. Ask your agency to assign one.'}
        </div>
      )}
    </div>
  );
};
