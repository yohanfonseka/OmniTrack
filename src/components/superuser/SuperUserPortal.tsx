import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Agency, User } from '../../types';
import { ApiService } from '../../lib/api';
import {
  Shield,
  Building2,
  Users,
  CreditCard,
  History,
  Sliders,
  PlusCircle,
  CheckCircle2,
  AlertTriangle,
  Lock,
  ExternalLink,
  Search
} from 'lucide-react';
import { FormattedNumberInput } from '../common/FormattedNumberInput';

export const SuperUserPortal: React.FC = () => {
  const { agencies, refreshAgencies, setCurrentAgency, setCurrentPortal } = useAuth();

  const [activeSubTab, setActiveSubTab] = useState<'agencies' | 'plans' | 'audit_logs'>('agencies');
  const [stats, setStats] = useState<any>(null);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [showNewAgencyModal, setShowNewAgencyModal] = useState(false);

  // New Agency Form
  const [agencyName, setAgencyName] = useState('');
  const [agencyPlan, setAgencyPlan] = useState<'boutique' | 'growth' | 'enterprise'>('boutique');
  const [agencyEmail, setAgencyEmail] = useState('');
  const [maxClients, setMaxClients] = useState(10);
  const [maxCampaigns, setMaxCampaigns] = useState(30);

  useEffect(() => {
    ApiService.getSuperUserStats().then(setStats).catch(console.error);
    ApiService.getAuditLogs().then(setAuditLogs).catch(console.error);
  }, []);

  const handleCreateAgency = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await ApiService.createAgency({
        name: agencyName,
        plan: agencyPlan,
        contact_email: agencyEmail,
        max_clients: maxClients,
        max_campaigns: maxCampaigns,
        status: 'active'
      });
      await refreshAgencies();
      setShowNewAgencyModal(false);
      setAgencyName('');
      setAgencyEmail('');
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleEnterAgencyAsAdmin = (agency: Agency) => {
    setCurrentAgency(agency);
    setCurrentPortal('agency');
  };

  return (
    <div className="space-y-6">
      {/* Super User Header */}
      <div className="bg-slate-900 text-white rounded-2xl p-6 shadow-md">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-800">
          <div>
            <div className="flex items-center gap-2">
              <Shield className="w-6 h-6 text-purple-400" />
              <h2 className="text-xl font-bold tracking-tight">Super User Command Center</h2>
              <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 font-bold border border-purple-500/30">
                Platform Root Access
              </span>
            </div>
          </div>

          <button
            onClick={() => setShowNewAgencyModal(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-xs font-bold shadow-xs transition-colors self-start sm:self-center"
          >
            <PlusCircle className="w-4 h-4" />
            <span>Provision New Agency</span>
          </button>
        </div>

        {/* Global Statistics Strip */}
        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-5">
            <div className="p-3 rounded-xl bg-slate-800/80 border border-slate-700/60">
              <span className="text-[10px] text-slate-400 uppercase font-medium block">Total Tenant Agencies</span>
              <span className="text-xl font-bold text-white">{stats.total_agencies}</span>
            </div>
            <div className="p-3 rounded-xl bg-slate-800/80 border border-slate-700/60">
              <span className="text-[10px] text-slate-400 uppercase font-medium block">Active Platform Users</span>
              <span className="text-xl font-bold text-white">{stats.total_users}</span>
            </div>
            <div className="p-3 rounded-xl bg-slate-800/80 border border-slate-700/60">
              <span className="text-[10px] text-slate-400 uppercase font-medium block">Managed Campaigns</span>
              <span className="text-xl font-bold text-white">{stats.total_campaigns}</span>
            </div>
            <div className="p-3 rounded-xl bg-slate-800/80 border border-slate-700/60">
              <span className="text-[10px] text-slate-400 uppercase font-medium block">Active Health Alerts</span>
              <span className="text-xl font-bold text-amber-400">{stats.active_alerts}</span>
            </div>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200">
        <button
          onClick={() => setActiveSubTab('agencies')}
          className={`px-4 py-2.5 text-xs font-bold border-b-2 transition-colors flex items-center gap-1.5 ${
            activeSubTab === 'agencies'
              ? 'border-purple-600 text-purple-700'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Building2 className="w-4 h-4" />
          <span>Agency Tenants ({agencies.length})</span>
        </button>

        <button
          onClick={() => setActiveSubTab('plans')}
          className={`px-4 py-2.5 text-xs font-bold border-b-2 transition-colors flex items-center gap-1.5 ${
            activeSubTab === 'plans'
              ? 'border-purple-600 text-purple-700'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <CreditCard className="w-4 h-4" />
          <span>Subscription Plans</span>
        </button>

        <button
          onClick={() => setActiveSubTab('audit_logs')}
          className={`px-4 py-2.5 text-xs font-bold border-b-2 transition-colors flex items-center gap-1.5 ${
            activeSubTab === 'audit_logs'
              ? 'border-purple-600 text-purple-700'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <History className="w-4 h-4" />
          <span>Platform Audit Logs</span>
        </button>
      </div>

      {/* TAB 1: Agency Tenants List */}
      {activeSubTab === 'agencies' && (
        <div className="bg-white border border-slate-200/90 rounded-2xl p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
              Configured Agency Tenants
            </h3>
            <span className="text-xs text-slate-500">Manual provisioning only (Security Hardened)</span>
          </div>

          <div className="divide-y divide-slate-100">
            {agencies.map(agency => (
              <div
                key={agency.id}
                className="py-4 flex flex-col md:flex-row md:items-center justify-between gap-4"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-900 text-sm">{agency.name}</span>
                    <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-purple-50 text-purple-700 font-bold">
                      {agency.plan}
                    </span>
                    <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 font-bold">
                      {agency.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-slate-500">
                    <span>Contact: {agency.contact_email}</span>
                    <span>•</span>
                    <span>Max Clients: {agency.max_clients}</span>
                    <span>•</span>
                    <span>Max Campaigns: {agency.max_campaigns}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleEnterAgencyAsAdmin(agency)}
                    className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-purple-50 text-purple-700 text-xs font-semibold flex items-center gap-1 transition-colors"
                  >
                    <span>Inspect Portal</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 2: Subscription Plans */}
      {activeSubTab === 'plans' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Tier 1</span>
              <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 text-[10px] font-bold">STANDARD</span>
            </div>
            <h3 className="text-xl font-bold text-slate-900">Boutique Agency</h3>
            <div className="text-2xl font-bold text-slate-900">$299 <span className="text-xs text-slate-400 font-normal">/ month</span></div>
            <ul className="space-y-2 text-xs text-slate-600 pt-2 border-t border-slate-100">
              <li className="flex items-center gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Up to 10 Clients</li>
              <li className="flex items-center gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Up to 30 Campaigns</li>
              <li className="flex items-center gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Meta & TikTok CSV Ingestion</li>
              <li className="flex items-center gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Automated Health & Alerts Engine</li>
            </ul>
          </div>

          <div className="bg-white border-2 border-purple-600 rounded-2xl p-6 shadow-xs space-y-4 relative">
            <span className="absolute -top-3 right-4 px-2.5 py-0.5 rounded-full bg-purple-600 text-white text-[10px] font-bold uppercase tracking-wider">
              Most Popular
            </span>
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-purple-600">Tier 2</span>
            </div>
            <h3 className="text-xl font-bold text-slate-900">Growth Agency</h3>
            <div className="text-2xl font-bold text-slate-900">$599 <span className="text-xs text-slate-400 font-normal">/ month</span></div>
            <ul className="space-y-2 text-xs text-slate-600 pt-2 border-t border-slate-100">
              <li className="flex items-center gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Up to 25 Clients</li>
              <li className="flex items-center gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Up to 100 Campaigns</li>
              <li className="flex items-center gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Client Viewer Portal Links</li>
              <li className="flex items-center gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Priority Deduplication Processing</li>
            </ul>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Tier 3</span>
            </div>
            <h3 className="text-xl font-bold text-slate-900">Enterprise</h3>
            <div className="text-2xl font-bold text-slate-900">Custom <span className="text-xs text-slate-400 font-normal">/ annual</span></div>
            <ul className="space-y-2 text-xs text-slate-600 pt-2 border-t border-slate-100">
              <li className="flex items-center gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Unlimited Clients & Campaigns</li>
              <li className="flex items-center gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Dedicated Direct API Ingestion</li>
              <li className="flex items-center gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> White-Label Client Dashboards</li>
              <li className="flex items-center gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> 99.9% SLA & Custom Deduplication</li>
            </ul>
          </div>
        </div>
      )}

      {/* TAB 3: Global Audit Logs */}
      {activeSubTab === 'audit_logs' && (
        <div className="bg-white border border-slate-200/90 rounded-2xl p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">Platform Security & Audit Log</h3>
            <span className="text-xs text-slate-500">Immutable operations record</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-400 uppercase text-[10px] font-semibold">
                <tr>
                  <th className="py-2.5 px-3">Timestamp</th>
                  <th className="py-2.5 px-3">User</th>
                  <th className="py-2.5 px-3">Action</th>
                  <th className="py-2.5 px-3">Entity Type</th>
                  <th className="py-2.5 px-3">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {auditLogs.map(log => (
                  <tr key={log.id} className="hover:bg-slate-50/70">
                    <td className="py-2.5 px-3 font-mono text-[11px] text-slate-500">
                      {new Date(log.created_at).toLocaleString()}
                    </td>
                    <td className="py-2.5 px-3 font-semibold text-slate-800">{log.user_name}</td>
                    <td className="py-2.5 px-3 font-bold text-indigo-700">{log.action}</td>
                    <td className="py-2.5 px-3 uppercase text-[10px] text-slate-500">{log.entity_type}</td>
                    <td className="py-2.5 px-3 text-slate-600 max-w-xs truncate">{log.details}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Provision Agency Modal */}
      {showNewAgencyModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <h3 className="text-base font-bold text-slate-900">Provision New Agency Tenant</h3>

            <form onSubmit={handleCreateAgency} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Agency Brand Name</label>
                <input
                  type="text"
                  required
                  value={agencyName}
                  onChange={e => setAgencyName(e.target.value)}
                  placeholder="e.g. Zenith Media Labs"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs outline-none focus:border-purple-600"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Plan Tier</label>
                  <select
                    value={agencyPlan}
                    onChange={e => setAgencyPlan(e.target.value as any)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs outline-none"
                  >
                    <option value="boutique">Boutique ($299/mo)</option>
                    <option value="growth">Growth ($599/mo)</option>
                    <option value="enterprise">Enterprise</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Max Clients</label>
                  <FormattedNumberInput
                    value={maxClients}
                    onChange={val => setMaxClients(val || 0)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs outline-none font-mono"
                    maxFractionDigits={0}
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Primary Agency Contact Email</label>
                <input
                  type="email"
                  required
                  value={agencyEmail}
                  onChange={e => setAgencyEmail(e.target.value)}
                  placeholder="lead@zenithmedialabs.com"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs outline-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowNewAgencyModal(false)}
                  className="px-4 py-2 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold"
                >
                  Confirm Provisioning
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
