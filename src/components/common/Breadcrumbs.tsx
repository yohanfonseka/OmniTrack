import React from 'react';
import { ChevronRight, Home, Building2, Briefcase, Tag, Target, Layers, Radio } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

interface BreadcrumbsProps {
  clientName?: string;
  brandName?: string;
  campaignName?: string;
  platform?: string;
  lineItemName?: string;
  onNavigate?: (level: 'agency' | 'client' | 'brand' | 'campaign' | 'platform') => void;
}

export const Breadcrumbs: React.FC<BreadcrumbsProps> = ({
  clientName,
  brandName,
  campaignName,
  platform,
  lineItemName,
  onNavigate
}) => {
  const { currentAgency, clearDrillDown, setDrillDown } = useAuth();

  const handleNavigate = (level: 'agency' | 'client' | 'brand' | 'campaign' | 'platform') => {
    if (onNavigate) {
      onNavigate(level);
      return;
    }

    if (level === 'agency') {
      clearDrillDown();
    } else if (level === 'client') {
      setDrillDown(prev => ({ clientId: prev.clientId }));
    } else if (level === 'brand') {
      setDrillDown(prev => ({ clientId: prev.clientId, brandId: prev.brandId }));
    } else if (level === 'campaign') {
      setDrillDown(prev => ({ clientId: prev.clientId, brandId: prev.brandId, campaignId: prev.campaignId }));
    } else if (level === 'platform') {
      setDrillDown(prev => ({ ...prev, lineItemId: undefined }));
    }
  };

  return (
    <nav aria-label="Hierarchy Breadcrumb" className="flex items-center flex-wrap gap-1.5 text-xs text-slate-500 py-2">
      {/* Agency */}
      <button
        id="crumb-agency"
        onClick={() => handleNavigate('agency')}
        className="inline-flex items-center gap-1 font-semibold text-slate-700 hover:text-indigo-600 px-1.5 py-0.5 rounded hover:bg-slate-100 transition-colors"
      >
        <Building2 className="w-3.5 h-3.5 text-slate-400" />
        <span>{currentAgency?.name || 'OmniDigital'}</span>
      </button>

      {/* Client */}
      {clientName && (
        <>
          <ChevronRight className="w-3.5 h-3.5 text-slate-300 shrink-0" />
          <button
            id="crumb-client"
            onClick={() => handleNavigate('client')}
            className="inline-flex items-center gap-1 font-medium text-slate-600 hover:text-indigo-600 px-1.5 py-0.5 rounded hover:bg-slate-100 transition-colors"
          >
            <Briefcase className="w-3 h-3 text-slate-400" />
            <span>{clientName}</span>
          </button>
        </>
      )}

      {/* Brand */}
      {brandName && (
        <>
          <ChevronRight className="w-3.5 h-3.5 text-slate-300 shrink-0" />
          <button
            id="crumb-brand"
            onClick={() => handleNavigate('brand')}
            className="inline-flex items-center gap-1 font-medium text-slate-600 hover:text-indigo-600 px-1.5 py-0.5 rounded hover:bg-slate-100 transition-colors"
          >
            <Tag className="w-3 h-3 text-slate-400" />
            <span>{brandName}</span>
          </button>
        </>
      )}

      {/* Campaign */}
      {campaignName && (
        <>
          <ChevronRight className="w-3.5 h-3.5 text-slate-300 shrink-0" />
          <button
            id="crumb-campaign"
            onClick={() => handleNavigate('campaign')}
            className="inline-flex items-center gap-1 font-medium text-slate-800 hover:text-indigo-600 px-1.5 py-0.5 rounded hover:bg-slate-100 transition-colors"
          >
            <Target className="w-3 h-3 text-indigo-500" />
            <span className="font-semibold text-indigo-900">{campaignName}</span>
          </button>
        </>
      )}

      {/* Platform */}
      {platform && (
        <>
          <ChevronRight className="w-3.5 h-3.5 text-slate-300 shrink-0" />
          <button
            id="crumb-platform"
            onClick={() => handleNavigate('platform')}
            className="inline-flex items-center gap-1 font-medium text-slate-700 hover:text-indigo-600 px-1.5 py-0.5 rounded hover:bg-slate-100 transition-colors capitalize"
          >
            <Layers className="w-3 h-3 text-slate-400" />
            <span>{platform}</span>
          </button>
        </>
      )}

      {/* Line Item */}
      {lineItemName && (
        <>
          <ChevronRight className="w-3.5 h-3.5 text-slate-300 shrink-0" />
          <span className="inline-flex items-center gap-1 font-bold text-slate-900 px-1.5 py-0.5 bg-slate-100 rounded">
            <Radio className="w-3 h-3 text-emerald-600" />
            <span>{lineItemName}</span>
          </span>
        </>
      )}
    </nav>
  );
};
