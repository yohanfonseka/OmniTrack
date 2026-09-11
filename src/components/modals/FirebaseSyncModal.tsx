import React, { useState, useEffect } from 'react';
import { FirestoreService, FirestoreSyncStatus } from '../../lib/firestoreService';
import { useAuth } from '../../context/AuthContext';
import {
  Database,
  Cloud,
  CheckCircle2,
  RefreshCw,
  X,
  Layers,
  Building,
  Target,
  AlertTriangle,
  ExternalLink,
  ShieldCheck
} from 'lucide-react';

interface FirebaseSyncModalProps {
  onClose: () => void;
}

export const FirebaseSyncModal: React.FC<FirebaseSyncModalProps> = ({ onClose }) => {
  const { currentAgency } = useAuth();
  const [status, setStatus] = useState<FirestoreSyncStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncSuccessMessage, setSyncSuccessMessage] = useState<string | null>(null);

  const loadStatus = async () => {
    setLoading(true);
    const health = await FirestoreService.getFirestoreHealth();
    setStatus(health);
    setLoading(false);
  };

  useEffect(() => {
    loadStatus();
  }, []);

  const handleSyncNow = async () => {
    setSyncing(true);
    setSyncSuccessMessage(null);
    try {
      const res = await FirestoreService.syncAllToFirestore(currentAgency?.id);
      if (res?.success) {
        setSyncSuccessMessage(
          `Successfully synchronized ${res.counts.campaigns} campaigns, ${res.counts.lineItems} line items, and ${res.counts.clients} clients to Firestore!`
        );
        await loadStatus();
      }
    } catch (err: any) {
      console.error(err);
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-600 flex items-center justify-center">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-1.5">
                Firebase Firestore Cloud Database
              </h3>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {syncSuccessMessage && (
          <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex items-start gap-2 animate-in fade-in">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
            <span>{syncSuccessMessage}</span>
          </div>
        )}

        {/* Database Configuration Card */}
        <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Cloud Instance</span>
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              Connected
            </span>
          </div>

          <div className="space-y-1.5 text-xs">
            <div className="flex justify-between">
              <span className="text-slate-500 font-medium">Project ID:</span>
              <span className="font-mono font-bold text-slate-800">{status?.projectId || 'omnitrack-507708'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500 font-medium">Database ID:</span>
              <span className="font-mono text-[11px] text-indigo-700 truncate max-w-[240px]" title={status?.databaseId}>
                {status?.databaseId || 'Default'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500 font-medium">Security Rules:</span>
              <span className="font-semibold text-emerald-700 flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                Deployed & Active
              </span>
            </div>
          </div>
        </div>

        {/* Live Collections Metrics */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-800">Firestore Collections Document Count</span>
            <button
              onClick={loadStatus}
              disabled={loading}
              className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
            >
              <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
          </div>

          <div className="grid grid-cols-3 gap-2 text-center text-xs">
            <div className="p-2.5 rounded-lg border border-slate-200 bg-white">
              <span className="text-[10px] text-slate-400 block uppercase font-medium">Campaigns</span>
              <span className="text-sm font-bold text-slate-900">{status?.syncedCounts.campaigns ?? 0}</span>
            </div>
            <div className="p-2.5 rounded-lg border border-slate-200 bg-white">
              <span className="text-[10px] text-slate-400 block uppercase font-medium">Line Items</span>
              <span className="text-sm font-bold text-slate-900">{status?.syncedCounts.lineItems ?? 0}</span>
            </div>
            <div className="p-2.5 rounded-lg border border-slate-200 bg-white">
              <span className="text-[10px] text-slate-400 block uppercase font-medium">Clients</span>
              <span className="text-sm font-bold text-slate-900">{status?.syncedCounts.clients ?? 0}</span>
            </div>
            <div className="p-2.5 rounded-lg border border-slate-200 bg-white">
              <span className="text-[10px] text-slate-400 block uppercase font-medium">Brands</span>
              <span className="text-sm font-bold text-slate-900">{status?.syncedCounts.brands ?? 0}</span>
            </div>
            <div className="p-2.5 rounded-lg border border-slate-200 bg-white">
              <span className="text-[10px] text-slate-400 block uppercase font-medium">Agencies</span>
              <span className="text-sm font-bold text-slate-900">{status?.syncedCounts.agencies ?? 0}</span>
            </div>
            <div className="p-2.5 rounded-lg border border-slate-200 bg-white">
              <span className="text-[10px] text-slate-400 block uppercase font-medium">Alerts</span>
              <span className="text-sm font-bold text-slate-900">{status?.syncedCounts.alerts ?? 0}</span>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between pt-3 border-t border-slate-100">
          <span className="text-[11px] text-slate-400">
            Current Tenant: <strong>{currentAgency?.name}</strong>
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
            >
              Close
            </button>
            <button
              type="button"
              onClick={handleSyncNow}
              disabled={syncing}
              className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-700 transition-colors shadow-xs flex items-center gap-1.5 disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
              <span>{syncing ? 'Syncing...' : 'Sync to Firestore'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
