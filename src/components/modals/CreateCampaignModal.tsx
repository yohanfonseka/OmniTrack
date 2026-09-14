import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Client, Brand } from '../../types';
import { ApiService } from '../../lib/api';
import { Target, X, Calendar, ArrowRightLeft } from 'lucide-react';

interface CreateCampaignModalProps {
  initialClientId?: string;
  initialBrandId?: string;
  onClose: () => void;
  onCreated: (campaignId?: string, clientId?: string, brandId?: string) => void;
}

export const CreateCampaignModal: React.FC<CreateCampaignModalProps> = ({
  initialClientId,
  initialBrandId,
  onClose,
  onCreated
}) => {
  const { currentAgency } = useAuth();

  const [clients, setClients] = useState<Client[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);

  const [clientId, setClientId] = useState(initialClientId || '');
  const [brandId, setBrandId] = useState(initialBrandId || '');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [objective, setObjective] = useState('Brand Awareness & Consideration');
  const [startDate, setStartDate] = useState('2026-09-01');
  const [endDate, setEndDate] = useState('2026-09-30');
  const [status, setStatus] = useState<'draft' | 'active' | 'paused' | 'completed'>('active');
  const [currency, setCurrency] = useState('LKR');
  const [usdToLkrRate, setUsdToLkrRate] = useState(305);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!currentAgency) return;
    const fetchClients = () => {
      ApiService.getClients(currentAgency.id).then(cList => {
        setClients(cList);
        if (cList.length > 0 && !clientId) {
          const selected = initialClientId && cList.some(c => c.id === initialClientId)
            ? initialClientId
            : cList[0].id;
          setClientId(selected);
          const found = cList.find(c => c.id === selected);
          if (found?.currency) setCurrency(found.currency);
        }
      });
    };
    fetchClients();

    window.addEventListener('refresh-omnitrack', fetchClients);
    return () => window.removeEventListener('refresh-omnitrack', fetchClients);
  }, [currentAgency, clientId, initialClientId]);

  useEffect(() => {
    if (!currentAgency || !clientId) return;
    ApiService.getBrands(currentAgency.id, clientId).then(bList => {
      setBrands(bList);
      if (initialBrandId && bList.some(b => b.id === initialBrandId)) {
        setBrandId(initialBrandId);
      } else if (bList.length > 0) {
        setBrandId(bList[0].id);
      } else {
        setBrandId('');
      }
    });
    const c = clients.find(cl => cl.id === clientId);
    if (c && c.currency) setCurrency(c.currency);
  }, [currentAgency, clientId, clients, initialBrandId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentAgency || !clientId || !brandId || !name || !startDate || !endDate || !objective) return;
    setIsSubmitting(true);
    setError(null);

    try {
      const createdCampaign = await ApiService.createCampaign(currentAgency.id, {
        client_id: clientId,
        brand_id: brandId,
        name: name.trim(),
        description: description.trim(),
        objective: objective.trim(),
        start_date: startDate,
        end_date: endDate,
        currency,
        usd_to_lkr_rate: usdToLkrRate,
        status
      });

      window.dispatchEvent(new CustomEvent('refresh-omnitrack'));
      window.dispatchEvent(new CustomEvent('campaigns-updated'));
      onCreated(createdCampaign.id, clientId, brandId);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to create campaign');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <Target className="w-5 h-5 text-indigo-600" />
            <h3 className="text-base font-bold text-slate-900">Create Business Campaign (Level 1)</h3>
          </div>
          <button onClick={onClose} className="p-1 rounded-md text-slate-400 hover:text-slate-600">
            <X className="w-4 h-4" />
          </button>
        </div>

        {error && (
          <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-800">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Client *</label>
              <select
                value={clientId}
                onChange={e => setClientId(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs outline-none"
              >
                {clients.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Brand *</label>
              <select
                value={brandId}
                onChange={e => setBrandId(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs outline-none"
              >
                {brands.map(b => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Campaign Name *</label>
            <input
              type="text"
              required
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Q4 Brand Awareness & Considerations"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs outline-none focus:border-indigo-500"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Campaign Objective *</label>
            <input
              type="text"
              required
              value={objective}
              onChange={e => setObjective(e.target.value)}
              placeholder="e.g. Brand Awareness, consideration, and trial"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs outline-none focus:border-indigo-500"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Description (Optional)</label>
            <textarea
              rows={2}
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Strategic goals, creative angles, audience targets..."
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
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
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Initial Status *</label>
              <select
                value={status}
                onChange={e => setStatus(e.target.value as any)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs outline-none bg-white font-semibold"
              >
                <option value="draft">Draft (Recommended until Line Items added)</option>
                <option value="active">Active</option>
                <option value="paused">Paused</option>
                <option value="completed">Completed</option>
              </select>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Base Reporting Currency</label>
              <select
                value={currency}
                onChange={e => setCurrency(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs outline-none bg-white font-semibold"
              >
                <option value="LKR">LKR - Sri Lankan Rupee (Rs.)</option>
                <option value="USD">USD - United States Dollar ($)</option>
              </select>
            </div>
          </div>

          {/* Dynamic Budget Rule Callout - Explaining Line Items added after creation */}
          <div className="bg-indigo-50/70 border border-indigo-200/80 rounded-xl p-3.5 space-y-1.5">
            <div className="flex items-center gap-1.5 text-indigo-950 font-bold text-xs">
              <ArrowRightLeft className="w-3.5 h-3.5 text-indigo-600" />
              <span>Automated Dynamic Budget & KPI Rollup</span>
            </div>
            <p className="text-[11px] text-slate-600 leading-relaxed">
              In OmniTrack, <strong>there is no manually entered campaign-level budget</strong>. Once this campaign is created, you can add line items for Meta, TikTok, Google Ads, etc., with their individual budgets and Primary KPIs. The campaign metrics will rollup automatically.
            </p>
            <div className="pt-1 flex items-center justify-between text-[11px] text-slate-500">
              <span>Conversion Rate: <strong>1 USD = {usdToLkrRate} LKR</strong></span>
              <span className="font-medium text-indigo-700">Line Items support USD and LKR</span>
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
              className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-700 disabled:opacity-50"
            >
              {isSubmitting ? 'Creating...' : 'Create Campaign'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
