import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Alert, HealthStatus } from '../../types';
import { ApiService } from '../../lib/api';
import { HealthBadge } from '../common/HealthBadge';
import {
  AlertTriangle,
  AlertOctagon,
  CheckCircle2,
  Filter,
  Check,
  RotateCcw,
  Clock,
  Layers,
  ArrowRight
} from 'lucide-react';

interface AlertsViewProps {
  onSelectCampaign?: (campaignId: string) => void;
}

export const AlertsView: React.FC<AlertsViewProps> = ({ onSelectCampaign }) => {
  const { currentAgency, setActiveAlertCount } = useAuth();
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>('active');
  const [severityFilter, setSeverityFilter] = useState<string>('all');
  const [loading, setLoading] = useState<boolean>(true);

  const loadAlerts = async () => {
    if (!currentAgency) return;
    setLoading(true);
    try {
      const list = await ApiService.getAlerts(currentAgency.id, statusFilter === 'all' ? undefined : statusFilter);
      setAlerts(list);

      // update active count badge
      const activeCount = list.filter(a => a.status === 'active').length;
      setActiveAlertCount(activeCount);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAlerts();
  }, [currentAgency, statusFilter]);

  const handleUpdateStatus = async (alertId: string, nextStatus: 'active' | 'acknowledged' | 'resolved') => {
    if (!currentAgency) return;
    try {
      await ApiService.updateAlertStatus(currentAgency.id, alertId, nextStatus);
      setAlerts(prev =>
        prev.map(a => (a.id === alertId ? { ...a, status: nextStatus } : a))
      );
    } catch (err) {
      console.error('Failed to update alert', err);
    }
  };

  const filteredAlerts = alerts.filter(a => {
    if (severityFilter !== 'all' && a.severity !== severityFilter) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Alerts Header & Filter Bar */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-6 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-500" />
            Alerts & Health Engine Exceptions
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          {/* Status Filter */}
          <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg font-medium">
            <button
              onClick={() => setStatusFilter('active')}
              className={`px-3 py-1.5 rounded-md transition-colors ${
                statusFilter === 'active' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Active Alerts
            </button>
            <button
              onClick={() => setStatusFilter('all')}
              className={`px-3 py-1.5 rounded-md transition-colors ${
                statusFilter === 'all' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              All Alerts
            </button>
          </div>

          {/* Severity Filter */}
          <select
            value={severityFilter}
            onChange={e => setSeverityFilter(e.target.value)}
            className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-700 bg-white outline-none"
          >
            <option value="all">All Severities</option>
            <option value="red">Critical Risk (Red)</option>
            <option value="amber">Attention Needed (Amber)</option>
            <option value="green">Informational (Green)</option>
          </select>
        </div>
      </div>

      {/* Alerts List */}
      {loading ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center text-slate-400">
          Loading active health warnings...
        </div>
      ) : filteredAlerts.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center space-y-2">
          <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto" />
          <h4 className="text-sm font-bold text-slate-800">No Outstanding Alerts</h4>
          <p className="text-xs text-slate-500">All campaign delivery and KPIs are performing within configured tolerances.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredAlerts.map(alert => {
            const isRed = alert.severity === 'red';
            return (
              <div
                key={alert.id}
                id={`alert-card-${alert.id}`}
                className={`p-4 rounded-xl border transition-all flex flex-col md:flex-row md:items-center justify-between gap-4 ${
                  alert.status === 'resolved'
                    ? 'bg-slate-50/50 border-slate-200 opacity-60'
                    : isRed
                    ? 'bg-rose-50/40 border-rose-200 hover:border-rose-300'
                    : 'bg-amber-50/40 border-amber-200 hover:border-amber-300'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div
                    className={`p-2 rounded-lg shrink-0 mt-0.5 ${
                      isRed ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'
                    }`}
                  >
                    {isRed ? <AlertOctagon className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-slate-900 text-xs">{alert.title}</span>
                      <HealthBadge status={alert.severity} size="sm" />
                      <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                        {alert.alert_type.replace(/_/g, ' ')}
                      </span>
                      {alert.platform && (
                        <span className="text-[10px] uppercase font-bold text-slate-500">
                          [{alert.platform}]
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-600 max-w-2xl">{alert.message}</p>
                    <div className="flex items-center gap-3 text-[11px] text-slate-400 pt-0.5">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        <span>Triggered: {new Date(alert.created_at).toLocaleDateString()}</span>
                      </span>
                      <span>•</span>
                      <span>Status: <strong className="uppercase font-semibold text-slate-600">{alert.status}</strong></span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 self-end md:self-center shrink-0">
                  {alert.campaign_id && onSelectCampaign && (
                    <button
                      onClick={() => onSelectCampaign(alert.campaign_id!)}
                      className="px-2.5 py-1.5 rounded-lg border border-slate-300 hover:bg-white text-xs font-semibold text-slate-700 flex items-center gap-1 transition-colors"
                    >
                      <span>Drill Down</span>
                      <ArrowRight className="w-3 h-3" />
                    </button>
                  )}

                  {alert.status === 'active' && (
                    <button
                      onClick={() => handleUpdateStatus(alert.id, 'acknowledged')}
                      className="px-2.5 py-1.5 rounded-lg bg-white border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-50 shadow-2xs"
                    >
                      Acknowledge
                    </button>
                  )}

                  {alert.status !== 'resolved' ? (
                    <button
                      onClick={() => handleUpdateStatus(alert.id, 'resolved')}
                      className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 flex items-center gap-1 shadow-2xs"
                    >
                      <Check className="w-3 h-3" />
                      <span>Resolve</span>
                    </button>
                  ) : (
                    <button
                      onClick={() => handleUpdateStatus(alert.id, 'active')}
                      className="px-2.5 py-1 rounded border border-slate-300 text-xs font-medium text-slate-600 hover:bg-slate-100"
                    >
                      Reopen
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
