import React from 'react';
import { useAuth } from '../../context/AuthContext';
import {
  LayoutDashboard,
  Users,
  Briefcase,
  AlertTriangle,
  UploadCloud,
  Settings,
  Shield,
  CreditCard,
  Sliders,
  History,
  ArrowLeftRight,
  Link2Off
} from 'lucide-react';

interface SidebarProps {
  currentTab: string;
  onSelectTab: (tab: string) => void;
}

interface NavItem {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: number;
}

export const Sidebar: React.FC<SidebarProps> = ({ currentTab, onSelectTab }) => {
  const { currentPortal, setCurrentPortal, activeAlertCount, unmappedCount, currentUser } = useAuth();

  const isSuperUserPortal = currentPortal === 'super_user';

  const agencyNavItems: NavItem[] = [
    { id: 'dashboard', label: 'Command Dashboard', icon: LayoutDashboard },
    { id: 'clients', label: 'Clients & Brands', icon: Briefcase },
    { id: 'campaigns', label: 'Campaigns', icon: Users },
    {
      id: 'unmapped',
      label: 'Unmapped Campaigns',
      icon: Link2Off,
      badge: unmappedCount > 0 ? unmappedCount : undefined
    },
    {
      id: 'alerts',
      label: 'Alerts & Health',
      icon: AlertTriangle,
      badge: activeAlertCount > 0 ? activeAlertCount : undefined
    },
    { id: 'imports', label: 'CSV Ingestion', icon: UploadCloud },
    { id: 'settings', label: 'Agency Settings', icon: Settings }
  ];

  const superUserNavItems: NavItem[] = [
    { id: 'agencies', label: 'Agency Tenants', icon: Briefcase },
    { id: 'super_users', label: 'Users & Roles', icon: Users },
    { id: 'plans', label: 'Plans & Subscriptions', icon: CreditCard },
    { id: 'platform_settings', label: 'Platform Settings', icon: Sliders },
    { id: 'audit_logs', label: 'Global Audit Logs', icon: History }
  ];

  const items = isSuperUserPortal ? superUserNavItems : agencyNavItems;

  return (
    <aside className="w-64 shrink-0 bg-slate-900 text-slate-300 flex flex-col justify-between p-4 border-r border-slate-800 min-h-[calc(100vh-4rem)]">
      <div>
        {/* Portal Context Banner */}
        <div className="mb-6 px-3 py-2.5 rounded-lg bg-slate-800/80 border border-slate-700/60">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              {isSuperUserPortal ? 'Super Admin Portal' : 'Agency Operations'}
            </span>
            <span
              className={`w-2 h-2 rounded-full ${
                isSuperUserPortal ? 'bg-purple-400' : 'bg-emerald-400'
              }`}
            />
          </div>
          <p className="text-xs font-medium text-white mt-0.5 truncate">
            {isSuperUserPortal ? 'Platform Level Access' : 'Multi-Platform Command'}
          </p>
        </div>

        {/* Navigation list */}
        <nav className="space-y-1">
          {items.map(item => {
            const Icon = item.icon;
            const active = currentTab === item.id;
            return (
              <button
                key={item.id}
                id={`sidebar-tab-${item.id}`}
                onClick={() => onSelectTab(item.id)}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-medium transition-colors ${
                  active
                    ? 'bg-indigo-600 text-white shadow-xs font-semibold'
                    : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
                }`}
              >
                <div className="flex items-center gap-3 truncate">
                  <Icon className={`w-4 h-4 ${active ? 'text-white' : 'text-slate-400'}`} />
                  <span className="truncate">{item.label}</span>
                </div>
                {item.badge !== undefined && (
                  <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-500 text-white">
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Footer Switcher */}
      <div className="pt-4 border-t border-slate-800 space-y-2">
        {currentUser.role === 'super_user' && (
          <button
            onClick={() => {
              const nextPortal = isSuperUserPortal ? 'agency' : 'super_user';
              setCurrentPortal(nextPortal);
              onSelectTab(nextPortal === 'super_user' ? 'agencies' : 'dashboard');
            }}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200 transition-colors"
          >
            <ArrowLeftRight className="w-3.5 h-3.5 text-indigo-400" />
            <span>{isSuperUserPortal ? 'Go to Agency Portal' : 'Open Super User Portal'}</span>
          </button>
        )}

        <div className="px-2 text-[11px] text-slate-500">
          <p>Tenant: Scoped by agency_id</p>
          <p className="text-[10px] text-slate-600 mt-0.5">Hierarchy: Client → Brand → Campaign → Line Item</p>
        </div>
      </div>
    </aside>
  );
};
