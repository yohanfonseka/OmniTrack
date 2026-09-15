import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { UserRole } from '../../types';
import {
  Activity,
  Building2,
  Bell,
  CheckCircle2,
  ChevronDown,
  LogOut,
  ShieldCheck,
  UserCheck,
  ExternalLink,
  RefreshCw,
  Clock,
  Database
} from 'lucide-react';
import { FirebaseSyncModal } from '../modals/FirebaseSyncModal';
import { OmniTrackLogo } from '../common/OmniTrackLogo';

interface NavbarProps {
  onOpenAlerts: () => void;
  onRefreshData?: () => void;
  isRefreshing?: boolean;
}

export const Navbar: React.FC<NavbarProps> = ({ onOpenAlerts, onRefreshData, isRefreshing = false }) => {
  const {
    currentUser,
    signOut,
    currentAgency,
    agencies,
    setCurrentAgency,
    currentPortal,
    setCurrentPortal,
    switchRole,
    activeAlertCount
  } = useAuth();

  const [agencyMenuOpen, setAgencyMenuOpen] = useState(false);
  const [roleMenuOpen, setRoleMenuOpen] = useState(false);
  const [showFirebaseModal, setShowFirebaseModal] = useState(false);

  const roleLabels: Record<UserRole, { title: string; badgeColor: string }> = {
    super_user: { title: 'Super User', badgeColor: 'bg-purple-100 text-purple-800 border-purple-200' },
    agency_admin: { title: 'Agency Admin', badgeColor: 'bg-indigo-100 text-indigo-800 border-indigo-200' },
    agency_member: { title: 'Agency Member', badgeColor: 'bg-blue-100 text-blue-800 border-blue-200' },
    client_viewer: { title: 'Client Viewer', badgeColor: 'bg-slate-100 text-slate-800 border-slate-200' }
  };

  return (
    <header className="sticky top-0 z-30 bg-white border-b border-slate-200/90 shadow-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
        {/* Left: Brand / Logo & Agency Selector */}
        <div className="flex items-center gap-6">
          {/* Official OmniTrack Brand Logo & Wordmark */}
          <OmniTrackLogo
            variant="full"
            size="md"
            showBadge={true}
            badgeText="v2.0"
            onClick={() => setCurrentPortal('agency')}
            className="hover:opacity-95 transition-opacity"
          />

          {/* Agency Switcher (Only visible to Super User and Agency Roles, hidden from Client Viewer) */}
          {currentPortal !== 'client_viewer' && (
            <div className="relative">
              <button
                id="agency-selector-btn"
                onClick={() => setAgencyMenuOpen(!agencyMenuOpen)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-xs font-medium text-slate-700 transition-colors"
              >
                <Building2 className="w-3.5 h-3.5 text-slate-500" />
                <span className="font-semibold text-slate-900 truncate max-w-[140px]">
                  {currentAgency?.name || 'Select Agency'}
                </span>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
              </button>

              {agencyMenuOpen && (
                <div className="absolute left-0 mt-1.5 w-60 rounded-xl bg-white border border-slate-200 shadow-lg py-1 z-50 animate-in fade-in zoom-in-95">
                  <div className="px-3 py-2 border-b border-slate-100">
                    <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Tenant Scope</p>
                  </div>
                  {agencies.map(agency => (
                    <button
                      key={agency.id}
                      onClick={() => {
                        setCurrentAgency(agency);
                        setAgencyMenuOpen(false);
                      }}
                      className={`w-full text-left px-3 py-2 text-xs flex items-center justify-between hover:bg-slate-50 transition-colors ${
                        currentAgency?.id === agency.id ? 'bg-indigo-50/70 text-indigo-700 font-semibold' : 'text-slate-700'
                      }`}
                    >
                      <span className="truncate">{agency.name}</span>
                      <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">
                        {agency.plan}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right: Data freshness, alerts, role switcher */}
        <div className="flex items-center gap-3">
          {/* Data Freshness Indicator */}
          <div
            className="hidden md:flex items-center gap-2 px-2.5 py-1 rounded-md bg-emerald-50/70 border border-emerald-200/80 text-[11px] font-medium text-emerald-800"
            title="Last normalized data sync timestamp"
          >
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3 text-emerald-600" />
              <span>Data Fresh: Today (Sep 8, 2026)</span>
            </span>
            {onRefreshData && (
              <button
                onClick={onRefreshData}
                disabled={isRefreshing}
                className="ml-1 text-emerald-700 hover:text-emerald-900 transition-transform active:rotate-180"
                title="Trigger freshness recalculation"
              >
                <RefreshCw className={`w-3 h-3 ${isRefreshing ? 'animate-spin' : ''}`} />
              </button>
            )}
          </div>

          {/* Cloud Database (Firebase) Trigger */}
          <button
            id="nav-firebase-button"
            onClick={() => setShowFirebaseModal(true)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-amber-200 bg-amber-50/60 hover:bg-amber-100/70 text-xs font-semibold text-amber-900 transition-colors shadow-2xs"
            title="Firebase Firestore Cloud Persistence"
          >
            <Database className="w-3.5 h-3.5 text-amber-600" />
            <span className="hidden lg:inline text-[11px]">Cloud DB</span>
          </button>

          {/* Alerts Bell */}
          <button
            id="nav-alerts-button"
            onClick={onOpenAlerts}
            className="relative p-2 rounded-lg text-slate-600 hover:bg-slate-100 transition-colors border border-transparent hover:border-slate-200"
            aria-label="Active Alerts"
          >
            <Bell className="w-4 h-4" />
            {activeAlertCount > 0 && (
              <span className="absolute -top-1 -right-1 flex h-4 min-w-4 px-1 items-center justify-center rounded-full bg-rose-600 text-[10px] font-bold text-white shadow-xs">
                {activeAlertCount}
              </span>
            )}
          </button>

          {/* Role & Portal Switcher Dropdown (Allows testing all 4 roles required by PRD) */}
          <div className="relative">
            <button
              id="role-switcher-btn"
              onClick={() => setRoleMenuOpen(!roleMenuOpen)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 transition-colors shadow-2xs"
            >
              <div className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-xs">
                {currentUser.name.charAt(0)}
              </div>
              <div className="text-left hidden sm:block">
                <p className="text-xs font-bold text-slate-900 leading-tight">{currentUser.name}</p>
                <span className={`inline-block text-[10px] font-medium px-1.5 rounded border ${roleLabels[currentUser.role]?.badgeColor}`}>
                  {roleLabels[currentUser.role]?.title}
                </span>
              </div>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
            </button>

            {roleMenuOpen && (
              <div className="absolute right-0 mt-1.5 w-64 rounded-xl bg-white border border-slate-200 shadow-xl py-1 z-50 animate-in fade-in zoom-in-95">
                <div className="px-3 py-2 border-b border-slate-100">
                  <p className="text-xs font-bold text-slate-800">{currentUser.name}</p>
                  <p className="text-[11px] text-slate-500">{currentUser.email}</p>
                </div>

                {currentUser.role === 'super_user' && (
                <div className="px-3 py-2 border-b border-slate-100">
                  <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">View as role</p>
                  <p className="text-[11px] text-slate-500">Super user only</p>
                </div>
                )}

                {currentUser.role === 'super_user' && (<>

                <button
                  onClick={() => {
                    switchRole('agency_admin');
                    setRoleMenuOpen(false);
                  }}
                  className="w-full text-left px-3 py-2 text-xs hover:bg-slate-50 flex items-start gap-2.5 transition-colors"
                >
                  <ShieldCheck className="w-4 h-4 text-indigo-600 mt-0.5" />
                  <div>
                    <p className="font-semibold text-slate-800">Agency Admin (Sarah Jenkins)</p>
                    <p className="text-[11px] text-slate-400">Full agency management, imports, clients, alerts</p>
                  </div>
                </button>

                <button
                  onClick={() => {
                    switchRole('agency_member');
                    setRoleMenuOpen(false);
                  }}
                  className="w-full text-left px-3 py-2 text-xs hover:bg-slate-50 flex items-start gap-2.5 transition-colors"
                >
                  <UserCheck className="w-4 h-4 text-blue-600 mt-0.5" />
                  <div>
                    <p className="font-semibold text-slate-800">Agency Member (David Chen)</p>
                    <p className="text-[11px] text-slate-400">Media buyer view, campaign monitoring & review</p>
                  </div>
                </button>

                <button
                  onClick={() => {
                    switchRole('client_viewer');
                    setRoleMenuOpen(false);
                  }}
                  className="w-full text-left px-3 py-2 text-xs hover:bg-slate-50 flex items-start gap-2.5 transition-colors"
                >
                  <ExternalLink className="w-4 h-4 text-emerald-600 mt-0.5" />
                  <div>
                    <p className="font-semibold text-slate-800">Client Viewer (Nimal Perera)</p>
                    <p className="text-[11px] text-slate-400">Read-only view for external client stakeholder</p>
                  </div>
                </button>

                <div className="border-t border-slate-100 my-1"></div>

                <button
                  onClick={() => {
                    switchRole('super_user');
                    setRoleMenuOpen(false);
                  }}
                  className="w-full text-left px-3 py-2 text-xs hover:bg-purple-50 flex items-start gap-2.5 transition-colors text-purple-900"
                >
                  <ShieldCheck className="w-4 h-4 text-purple-600 mt-0.5" />
                  <div>
                    <p className="font-semibold">Super User Portal</p>
                    <p className="text-[11px] text-purple-600/70">Create agencies, subscription tiers & audit logs</p>
                  </div>
                </button>
                </>)}

                <div className="border-t border-slate-100 my-1"></div>

                <button
                  onClick={() => {
                    setRoleMenuOpen(false);
                    signOut();
                  }}
                  className="w-full text-left px-3 py-2 text-xs hover:bg-slate-50 flex items-center gap-2.5 transition-colors text-slate-700"
                >
                  <LogOut className="w-4 h-4 text-slate-500" />
                  <span className="font-semibold">Sign out</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {showFirebaseModal && (
        <FirebaseSyncModal onClose={() => setShowFirebaseModal(false)} />
      )}
    </header>
  );
};
