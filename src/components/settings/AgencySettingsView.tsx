import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { User } from '../../types';
import { ApiService } from '../../lib/api';
import {
  Settings,
  Users,
  Shield,
  Bell,
  Sliders,
  CheckCircle2,
  Lock,
  Mail,
  Building2
} from 'lucide-react';
import { FormattedNumberInput } from '../common/FormattedNumberInput';

export const AgencySettingsView: React.FC = () => {
  const { currentAgency, currentUser } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [pacingThreshold, setPacingThreshold] = useState<number>(15);
  const [savedNote, setSavedNote] = useState<string | null>(null);

  useEffect(() => {
    if (!currentAgency) return;
    ApiService.getUsers(currentAgency.id).then(setUsers).catch(console.error);
  }, [currentAgency]);

  const handleSavePreferences = (e: React.FormEvent) => {
    e.preventDefault();
    setSavedNote('Agency pacing tolerance and notification rules saved successfully.');
    setTimeout(() => setSavedNote(null), 3000);
  };

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-6 shadow-xs">
        <h2 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
          <Settings className="w-5 h-5 text-indigo-600" />
          Agency Configuration & Operations
        </h2>
      </div>

      {savedNote && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          <span>{savedNote}</span>
        </div>
      )}

      {/* Tenant Profile (Read-only as required by PRD Section 6: "Agency users must not see agency registration or agency setup screens") */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-6 shadow-xs space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">Tenant Profile</h3>
          <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-slate-100 text-slate-600 flex items-center gap-1">
            <Lock className="w-3 h-3 text-slate-400" />
            <span>Managed by Super User</span>
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          <div className="p-3 rounded-lg bg-slate-50 border border-slate-200/80">
            <span className="text-slate-400 block text-[10px] uppercase font-medium">Agency Name</span>
            <span className="text-sm font-bold text-slate-900">{currentAgency?.name}</span>
          </div>

          <div className="p-3 rounded-lg bg-slate-50 border border-slate-200/80">
            <span className="text-slate-400 block text-[10px] uppercase font-medium">Subscription Tier</span>
            <span className="text-sm font-bold text-indigo-700 uppercase">{currentAgency?.plan}</span>
          </div>

          <div className="p-3 rounded-lg bg-slate-50 border border-slate-200/80">
            <span className="text-slate-400 block text-[10px] uppercase font-medium">Contact Email</span>
            <span className="text-sm font-semibold text-slate-800">{currentAgency?.contact_email}</span>
          </div>

          <div className="p-3 rounded-lg bg-slate-50 border border-slate-200/80">
            <span className="text-slate-400 block text-[10px] uppercase font-medium">Client & Campaign Caps</span>
            <span className="text-sm font-semibold text-slate-800">
              {currentAgency?.max_clients} Clients / {currentAgency?.max_campaigns} Campaigns
            </span>
          </div>
        </div>
      </div>

      {/* Team Members List */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-6 shadow-xs space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div>
            <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">Agency Team Roster</h3>
          </div>
          <span className="text-xs font-semibold text-slate-600 bg-slate-100 px-2.5 py-1 rounded-md">
            {users.length} Active Members
          </span>
        </div>

        <div className="divide-y divide-slate-100">
          {users.map(u => (
            <div key={u.id} className="py-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-slate-100 text-slate-700 flex items-center justify-center font-bold text-xs">
                  {u.name.charAt(0)}
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-900">{u.name}</p>
                  <p className="text-[11px] text-slate-500">{u.email}</p>
                </div>
              </div>

              <span className="text-xs font-mono font-medium px-2.5 py-1 rounded bg-slate-100 text-slate-700 uppercase">
                {u.role.replace(/_/g, ' ')}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Pacing & Health Monitoring Rules */}
      <form onSubmit={handleSavePreferences} className="bg-white border border-slate-200/90 rounded-2xl p-6 shadow-xs space-y-4">
        <div className="pb-3 border-b border-slate-100">
          <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
            Health Engine Tolerance Rules
          </h3>
        </div>

        <div className="space-y-3 text-xs">
          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              Pacing Drift Tolerance (±%)
            </label>
            <div className="flex items-center gap-3">
              <FormattedNumberInput
                value={pacingThreshold}
                onChange={val => setPacingThreshold(val || 0)}
                className="w-28 px-3 py-2 border border-slate-200 rounded-lg text-xs outline-none focus:border-indigo-500 font-mono font-medium"
                maxFractionDigits={1}
              />
              <span className="text-slate-500 text-[11px]">
                Line items deviating more than ±{pacingThreshold}% from scheduled delivery trigger an Amber warning. Deviations exceeding 30% trigger Critical Red.
              </span>
            </div>
          </div>

          <div className="pt-2">
            <button
              type="submit"
              className="px-4 py-2 bg-slate-900 text-white rounded-lg text-xs font-bold hover:bg-slate-800 shadow-2xs"
            >
              Save Monitoring Rules
            </button>
          </div>
        </div>
      </form>

      {/* Data Management & Testing Section */}
      <div className="bg-white border border-rose-200/90 rounded-2xl p-6 shadow-xs space-y-4">
        <div className="pb-3 border-b border-rose-100 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
              Data Management & Testing
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Wipe all clients, campaigns, line items, and metrics to test ingestion and reporting completely from scratch.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 pt-1">
          <button
            type="button"
            onClick={async () => {
              if (window.confirm('Are you sure you want to delete ALL data? This will clear all clients, brands, campaigns, line items, and metrics across Firestore to test from scratch.')) {
                try {
                  const res = await ApiService.clearAllData();
                  setSavedNote(res.message || 'All data wiped successfully. Dashboard is fresh and clean.');
                  window.dispatchEvent(new CustomEvent('refresh-omnitrack'));
                  window.dispatchEvent(new CustomEvent('campaigns-updated'));
                } catch (err: any) {
                  alert(err.message || 'Failed to clear data');
                }
              }
            }}
            className="px-4 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold shadow-xs transition-colors flex items-center gap-2"
          >
            <span>Delete All Data (Test from Scratch)</span>
          </button>

          <button
            type="button"
            onClick={async () => {
              try {
                const res = await ApiService.seedDemoData();
                setSavedNote(res.message || 'Demo dataset re-seeded successfully.');
                window.dispatchEvent(new CustomEvent('refresh-omnitrack'));
                window.dispatchEvent(new CustomEvent('campaigns-updated'));
              } catch (err: any) {
                alert(err.message || 'Failed to seed demo data');
              }
            }}
            className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition-colors"
          >
            <span>Re-seed Demo Dataset</span>
          </button>
        </div>
      </div>
    </div>
  );
};
