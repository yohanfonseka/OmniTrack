import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Campaign } from '../../types';
import { ApiService } from '../../lib/api';
import { Target, X, Calendar, ArrowRightLeft, RefreshCw, AlertCircle } from 'lucide-react';

interface EditCampaignModalProps {
  campaign: Campaign;
  clientName?: string;
  brandName?: string;
  onClose: () => void;
  onUpdated: (updated: Campaign) => void;
}

export const EditCampaignModal: React.FC<EditCampaignModalProps> = ({
  campaign,
  clientName,
  brandName,
  onClose,
  onUpdated
}) => {
  const { currentAgency } = useAuth();

  const [name, setName] = useState(campaign.name);
  const [description, setDescription] = useState(campaign.description || '');
  const [objective, setObjective] = useState(campaign.objective || 'Brand Awareness & Consideration');
  const [startDate, setStartDate] = useState(campaign.start_date || '2026-09-01');
  const [endDate, setEndDate] = useState(campaign.end_date || '2026-09-30');
  const [status, setStatus] = useState<'draft' | 'active' | 'paused' | 'completed'>(campaign.status || 'active');
  const [currency, setCurrency] = useState(campaign.currency || 'LKR');
  const [usdToLkrRate, setUsdToLkrRate] = useState(campaign.usd_to_lkr_rate || 305);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentAgency) return;
    if (!name.trim()) {
      setError('Campaign name cannot be empty.');
      return;
    }
    if (new Date(endDate) < new Date(startDate)) {
      setError('Flight end date cannot be earlier than flight start date.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const updatedCampaign = await ApiService.updateCampaign(currentAgency.id, campaign.id, {
        name: name.trim(),
        description: description.trim(),
        objective: objective.trim(),
        start_date: startDate,
        end_date: endDate,
        currency,
        usd_to_lkr_rate: Number(usdToLkrRate) || 305,
        status
      });

      window.dispatchEvent(new CustomEvent('refresh-omnitrack'));
      window.dispatchEvent(new CustomEvent('campaigns-updated'));
      onUpdated(updatedCampaign);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to update campaign');
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
      <div className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-2xl border border-slate-200/80 space-y-5 max-h-[90vh] overflow-y-auto">
        {/* Modal Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold">
              <Target className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">Edit Campaign</h3>
              <p className="text-xs text-slate-500">
                {clientName && brandName ? `${clientName} • ${brandName}` : 'Update business campaign settings'}
              </p>
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

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Campaign Name */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              Campaign Name *
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Q4 Brand Lift & Product Launch"
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-slate-900 text-xs focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 font-medium"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              Description / Notes
            </label>
            <textarea
              rows={2}
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Strategic deliverables, target audiences, or brief notes"
              className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-slate-900 text-xs focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>

          {/* Objective & Status */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Primary Objective *
              </label>
              <select
                value={objective}
                onChange={e => setObjective(e.target.value)}
                className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-slate-900 text-xs focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white"
              >
                <option value="Brand Awareness & Consideration">Brand Awareness & Consideration</option>
                <option value="Lead Generation & Sales">Lead Generation & Sales</option>
                <option value="Website Traffic & Acquisition">Website Traffic & Acquisition</option>
                <option value="Video Reach & Viewer Retention">Video Reach & Viewer Retention</option>
                <option value="Engagement & Community Growth">Engagement & Community Growth</option>
                <option value="App Installs & Retention">App Installs & Retention</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Campaign Status
              </label>
              <select
                value={status}
                onChange={e => setStatus(e.target.value as any)}
                className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-slate-900 text-xs focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white"
              >
                <option value="active">Active (Tracking Live)</option>
                <option value="paused">Paused</option>
                <option value="draft">Draft</option>
                <option value="completed">Completed / Archival</option>
              </select>
            </div>
          </div>

          {/* Flight Dates */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                <span>Flight Start Date *</span>
              </label>
              <input
                type="date"
                required
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
                className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-slate-900 text-xs focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                <span>Flight End Date *</span>
              </label>
              <input
                type="date"
                required
                value={endDate}
                onChange={e => setEndDate(e.target.value)}
                className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-slate-900 text-xs focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
          </div>

          {/* Currency & Exchange Rate */}
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-800">
              <ArrowRightLeft className="w-3.5 h-3.5 text-indigo-600" />
              <span>Reporting Currency & Conversions</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                  Base Reporting Currency
                </label>
                <select
                  value={currency}
                  onChange={e => setCurrency(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-lg border border-slate-200 text-slate-800 text-xs bg-white"
                >
                  <option value="LKR">LKR (Sri Lankan Rupee)</option>
                  <option value="USD">USD (US Dollar)</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                  1 USD to LKR Exchange Rate
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="1"
                  value={usdToLkrRate}
                  onChange={e => setUsdToLkrRate(parseFloat(e.target.value) || 305)}
                  className="w-full px-3 py-1.5 rounded-lg border border-slate-200 text-slate-800 text-xs bg-white font-mono"
                />
              </div>
            </div>

            <p className="text-[11px] text-slate-500">
              Note: Campaign total budget is dynamically calculated from the sum of all its line items.
            </p>
          </div>

          {/* Actions */}
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
                  <span>Saving Changes...</span>
                </>
              ) : (
                <span>Save Changes</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
