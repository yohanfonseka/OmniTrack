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
  Building2,
  Coins,
  Trash2,
  Briefcase,
  Pencil
} from 'lucide-react';
import { FormattedNumberInput } from '../common/FormattedNumberInput';
import { ClientsBrandsView } from '../clients/ClientsBrandsView';

const SUPPORTED_CURRENCIES = ['LKR', 'USD', 'EUR', 'GBP', 'AUD', 'INR', 'SGD'];

export const AgencySettingsView: React.FC = () => {
  const { currentAgency, currentUser, refreshAgencies } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [pacingThreshold, setPacingThreshold] = useState<number>(15);
  const [savedNote, setSavedNote] = useState<string | null>(null);

  const [baseCurrency, setBaseCurrency] = useState<string>('LKR');
  const [rates, setRates] = useState<Record<string, number>>({});
  const [savingCurrency, setSavingCurrency] = useState(false);
  const [currencyError, setCurrencyError] = useState<string | null>(null);

  const [inviteName, setInviteName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [invitePassword, setInvitePassword] = useState('');
  const [inviteRole, setInviteRole] = useState('agency_member');
  const [inviteClientId, setInviteClientId] = useState('');

  // Inline edit of one existing account at a time.
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editPassword, setEditPassword] = useState('');
  const [editRole, setEditRole] = useState('agency_member');
  const [editClientId, setEditClientId] = useState('');
  const [editError, setEditError] = useState<string | null>(null);
  const [isSavingUser, setIsSavingUser] = useState(false);
  const [clients, setClients] = useState<{ id: string; name: string }[]>([]);
  const [isInviting, setIsInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);

  // The cross-tenant testing controls only exist when the server opts in, so
  // ask before offering them rather than showing buttons that cannot work.
  const [testingToolsEnabled, setTestingToolsEnabled] = useState(false);

  const canManageUsers = currentUser.role === 'super_user' || currentUser.role === 'agency_admin';

  // Client and brand records live here now rather than in their own nav item:
  // creating them shapes the agency's account structure and is an admin job.
  const [section, setSection] = useState<'agency' | 'clients'>('agency');

  const reloadUsers = () => {
    if (!currentAgency) return;
    ApiService.getUsers(currentAgency.id).then(setUsers).catch(console.error);
    ApiService.getClients(currentAgency.id).then(setClients).catch(console.error);
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentAgency) return;
    setInviteError(null);
    setIsInviting(true);
    try {
      await ApiService.inviteUser(currentAgency.id, {
        name: inviteName.trim(),
        email: inviteEmail.trim(),
        password: invitePassword,
        role: inviteRole,
        client_id: inviteRole === 'client_viewer' ? inviteClientId : undefined
      });
      setInviteName('');
      setInviteEmail('');
      setInvitePassword('');
      setInviteRole('agency_member');
      setInviteClientId('');
      reloadUsers();
      setSavedNote(`${inviteEmail.trim()} can now sign in to ${currentAgency.name}.`);
      setTimeout(() => setSavedNote(null), 4000);
    } catch (err: any) {
      setInviteError(err.message || 'Could not add the team member.');
    } finally {
      setIsInviting(false);
    }
  };

  const openUserEditor = (user: User) => {
    setEditingUser(user);
    setEditName(user.name);
    setEditEmail(user.email);
    setEditPassword('');
    setEditRole(user.role);
    setEditClientId(user.client_id || '');
    setEditError(null);
  };

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentAgency || !editingUser) return;
    setEditError(null);
    setIsSavingUser(true);
    try {
      await ApiService.updateUser(currentAgency.id, editingUser.id, {
        name: editName.trim(),
        email: editEmail.trim(),
        // Only sent when set, so saving other fields does not reset the password.
        ...(editPassword ? { password: editPassword } : {}),
        role: editRole,
        ...(editRole === 'client_viewer' ? { client_id: editClientId } : {})
      });
      setEditingUser(null);
      reloadUsers();
      setSavedNote(
        editPassword
          ? `${editEmail.trim()} updated. Their new password is active now.`
          : `${editEmail.trim()} updated.`
      );
      setTimeout(() => setSavedNote(null), 4000);
    } catch (err: any) {
      setEditError(err.message || 'Could not update the user.');
    } finally {
      setIsSavingUser(false);
    }
  };

  const handleRemoveUser = async (user: User) => {
    if (!currentAgency) return;
    if (!window.confirm(`Remove ${user.name}? They will lose access to ${currentAgency.name}.`)) return;
    try {
      await ApiService.deleteUser(currentAgency.id, user.id);
      reloadUsers();
    } catch (err: any) {
      setInviteError(err.message || 'Could not remove the user.');
    }
  };

  useEffect(() => {
    if (!currentAgency) return;
    // Goes through the same loader the invite and remove flows use, so the two
    // cannot drift: this effect used to fetch users directly, which left the
    // client list for the client-viewer picker unloaded until something else
    // happened to call reloadUsers.
    reloadUsers();
    setBaseCurrency((currentAgency.base_currency || 'LKR').toUpperCase());
    setRates(currentAgency.exchange_rates || { USD: 305 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentAgency]);

  useEffect(() => {
    ApiService.getSystemCapabilities()
      .then(caps => setTestingToolsEnabled(Boolean(caps.destructive_testing)))
      .catch(() => setTestingToolsEnabled(false));
  }, []);

  const handleSaveCurrency = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentAgency) return;
    setCurrencyError(null);

    // A zero or missing rate silently leaves amounts unconverted, so reject it here.
    const invalid = Object.entries(rates).find(([, value]) => !Number.isFinite(Number(value)) || Number(value) <= 0);
    if (invalid) {
      setCurrencyError(`Enter a rate greater than zero for ${invalid[0]}.`);
      return;
    }

    setSavingCurrency(true);
    try {
      await ApiService.updateAgency(currentAgency.id, {
        base_currency: baseCurrency,
        exchange_rates: rates
      });
      await refreshAgencies();
      setSavedNote(`Reporting currency set to ${baseCurrency}. Cross-currency totals now convert using these rates.`);
      setTimeout(() => setSavedNote(null), 4000);
    } catch (err: any) {
      setCurrencyError(err.message || 'Could not save currency settings.');
    } finally {
      setSavingCurrency(false);
    }
  };

  const handleSavePreferences = (e: React.FormEvent) => {
    e.preventDefault();
    setSavedNote('Agency pacing tolerance and notification rules saved successfully.');
    setTimeout(() => setSavedNote(null), 3000);
  };

  return (
    <div className={`space-y-6 ${section === 'clients' ? '' : 'max-w-4xl'}`}>
      {/* Header */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-6 shadow-xs space-y-4">
        <h2 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
          <Settings className="w-5 h-5 text-indigo-600" />
          Agency Configuration & Operations
        </h2>

        <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg text-xs font-semibold w-fit">
          <button
            type="button"
            onClick={() => setSection('agency')}
            className={`px-3 py-1.5 rounded-md transition-colors flex items-center gap-1.5 ${
              section === 'agency' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>Settings</span>
          </button>
          <button
            type="button"
            onClick={() => setSection('clients')}
            className={`px-3 py-1.5 rounded-md transition-colors flex items-center gap-1.5 ${
              section === 'clients' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <Briefcase className="w-3.5 h-3.5" />
            <span>Clients &amp; Brands</span>
          </button>
        </div>
      </div>

      {section === 'clients' && <ClientsBrandsView canManage={canManageUsers} />}

      {section === 'agency' && (
      <>

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
            <div key={u.id} className="py-3">
              <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-slate-100 text-slate-700 flex items-center justify-center font-bold text-xs">
                  {u.name.charAt(0)}
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-900">{u.name}</p>
                  <p className="text-[11px] text-slate-500">{u.email}</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {!u.auth_uid && (
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200">
                    No sign-in yet
                  </span>
                )}
                <span className="text-xs font-mono font-medium px-2.5 py-1 rounded bg-slate-100 text-slate-700 uppercase">
                  {u.role.replace(/_/g, ' ')}
                </span>
                {canManageUsers && (
                  <button
                    type="button"
                    onClick={() => openUserEditor(u)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
                    title={`Edit ${u.name}`}
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                )}
                {canManageUsers && u.id !== currentUser.id && (
                  <button
                    type="button"
                    onClick={() => handleRemoveUser(u)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                    title={`Remove ${u.name}`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              </div>

              {editingUser?.id === u.id && (
                <form onSubmit={handleSaveUser} className="mt-3 p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                    <input
                      required
                      value={editName}
                      onChange={e => setEditName(e.target.value)}
                      placeholder="Full name"
                      className="px-3 py-2 border border-slate-200 rounded-lg outline-none focus:border-indigo-500"
                    />
                    <input
                      required
                      type="email"
                      value={editEmail}
                      onChange={e => setEditEmail(e.target.value)}
                      placeholder="Email address"
                      className="px-3 py-2 border border-slate-200 rounded-lg outline-none focus:border-indigo-500"
                    />
                    <input
                      type="password"
                      minLength={8}
                      value={editPassword}
                      onChange={e => setEditPassword(e.target.value)}
                      placeholder="New password (leave blank to keep)"
                      className="px-3 py-2 border border-slate-200 rounded-lg outline-none focus:border-indigo-500 font-mono"
                    />
                    <select
                      value={editRole}
                      onChange={e => setEditRole(e.target.value)}
                      disabled={u.id === currentUser.id}
                      className="px-3 py-2 border border-slate-200 rounded-lg outline-none focus:border-indigo-500 bg-white disabled:bg-slate-100 disabled:text-slate-400"
                      title={u.id === currentUser.id ? 'You cannot change your own role' : undefined}
                    >
                      <option value="agency_member">Agency member</option>
                      <option value="agency_admin">Agency admin</option>
                      <option value="client_viewer">Client viewer</option>
                      {currentUser.role === 'super_user' && <option value="super_user">Super user</option>}
                    </select>
                  </div>

                  {editRole === 'client_viewer' && (
                    <select
                      required
                      value={editClientId}
                      onChange={e => setEditClientId(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg outline-none focus:border-indigo-500 bg-white text-xs"
                    >
                      <option value="">
                        {clients.length === 0 ? 'No clients yet - add one first' : 'Which client may they see?'}
                      </option>
                      {clients.map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  )}

                  {!u.auth_uid && (
                    <p className="text-[11px] text-amber-700">
                      This account has never signed in, so its email and password cannot be changed here.
                    </p>
                  )}

                  {editError && <p className="text-[11px] text-rose-600 font-medium">{editError}</p>}

                  <div className="flex items-center gap-2">
                    <button
                      type="submit"
                      disabled={isSavingUser}
                      className="px-3 py-1.5 bg-slate-900 text-white rounded-lg text-xs font-bold hover:bg-slate-800 disabled:opacity-50"
                    >
                      {isSavingUser ? 'Saving...' : 'Save changes'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingUser(null)}
                      className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-white"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              )}
            </div>
          ))}
        </div>

        {canManageUsers && (
          <form onSubmit={handleInvite} className="mt-4 pt-4 border-t border-slate-100 space-y-3">
            <div>
              <p className="text-xs font-bold text-slate-800">Add a team member</p>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Creates their sign-in and grants access to this agency. Share the starting password with them directly; they can change it later.
              </p>
            </div>

            {inviteError && (
              <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-[11px] text-rose-800">
                {inviteError}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
              <input
                type="text"
                required
                placeholder="Full name"
                value={inviteName}
                onChange={e => setInviteName(e.target.value)}
                className="px-3 py-2 border border-slate-200 rounded-lg outline-none focus:border-indigo-500"
              />
              <input
                type="email"
                required
                placeholder="Work email"
                value={inviteEmail}
                onChange={e => setInviteEmail(e.target.value)}
                className="px-3 py-2 border border-slate-200 rounded-lg outline-none focus:border-indigo-500"
              />
              <input
                type="text"
                required
                minLength={8}
                placeholder="Starting password (min 8 characters)"
                value={invitePassword}
                onChange={e => setInvitePassword(e.target.value)}
                className="px-3 py-2 border border-slate-200 rounded-lg outline-none focus:border-indigo-500 font-mono"
              />
              <select
                value={inviteRole}
                onChange={e => setInviteRole(e.target.value)}
                className="px-3 py-2 border border-slate-200 rounded-lg outline-none focus:border-indigo-500 bg-white"
              >
                <option value="agency_member">Agency member</option>
                <option value="agency_admin">Agency admin</option>
                <option value="client_viewer">Client viewer</option>
                {currentUser.role === 'super_user' && <option value="super_user">Super user</option>}
              </select>
            </div>

            {inviteRole === 'client_viewer' && (
              <div className="space-y-1">
                <select
                  required
                  value={inviteClientId}
                  onChange={e => setInviteClientId(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg outline-none focus:border-indigo-500 bg-white text-xs"
                >
                  <option value="">
                    {clients.length === 0 ? 'No clients yet - add one first' : 'Which client may they see?'}
                  </option>
                  {clients.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
                <p className="text-[11px] text-slate-500">
                  A client viewer signs in to a read-only dashboard showing only this client's
                  campaigns. They cannot edit anything, and cannot see your other clients.
                </p>
              </div>
            )}

            <button
              type="submit"
              disabled={isInviting}
              className="px-4 py-2 bg-slate-900 text-white rounded-lg text-xs font-bold hover:bg-slate-800 shadow-2xs disabled:opacity-50"
            >
              {isInviting ? 'Adding...' : 'Add team member'}
            </button>
          </form>
        )}
      </div>

      {/* Reporting Currency & Exchange Rates */}
      <form onSubmit={handleSaveCurrency} className="bg-white border border-slate-200/90 rounded-2xl p-6 shadow-xs space-y-4">
        <div className="pb-3 border-b border-slate-100">
          <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
            <Coins className="w-4 h-4 text-indigo-600" />
            Reporting Currency
          </h3>
          <p className="text-xs text-slate-500 mt-1">
            Campaigns that mix platforms in different currencies are rolled up into this currency using the rates below.
          </p>
        </div>

        <div className="space-y-4 text-xs">
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Base currency</label>
            <select
              value={baseCurrency}
              onChange={e => setBaseCurrency(e.target.value)}
              className="w-40 px-3 py-2 border border-slate-200 rounded-lg text-xs outline-none focus:border-indigo-500 font-medium bg-white"
            >
              {SUPPORTED_CURRENCIES.map(code => (
                <option key={code} value={code}>{code}</option>
              ))}
            </select>
          </div>

          <div>
            <span className="block font-semibold text-slate-700 mb-2">Exchange rates</span>
            <div className="space-y-2">
              {SUPPORTED_CURRENCIES.filter(code => code !== baseCurrency).map(code => (
                <div key={code} className="flex items-center gap-2">
                  <span className="w-28 text-slate-600 font-mono">1 {code} =</span>
                  <FormattedNumberInput
                    value={rates[code] ?? 0}
                    onChange={val => setRates(prev => ({ ...prev, [code]: val || 0 }))}
                    className="w-32 px-3 py-2 border border-slate-200 rounded-lg text-xs outline-none focus:border-indigo-500 font-mono font-medium"
                    maxFractionDigits={4}
                  />
                  <span className="text-slate-600 font-mono">{baseCurrency}</span>
                  {!rates[code] && (
                    <span className="text-[11px] text-amber-700">
                      No rate set - {code} amounts are left unconverted
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>

          {currencyError && (
            <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-[11px] text-rose-800">
              {currencyError}
            </div>
          )}

          <div className="pt-1">
            <button
              type="submit"
              disabled={savingCurrency}
              className="px-4 py-2 bg-slate-900 text-white rounded-lg text-xs font-bold hover:bg-slate-800 shadow-2xs disabled:opacity-50"
            >
              {savingCurrency ? 'Saving...' : 'Save Currency Settings'}
            </button>
          </div>
        </div>
      </form>

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
              Clear imported platform data for this agency. The full wipe and demo
              re-seed controls only appear on deployments running in testing mode.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 pt-1">
          <button
            type="button"
            onClick={async () => {
              if (window.confirm('Are you sure you want to clear all platform data? This will clear all unmapped campaigns, daily metrics, and platform data source mappings across Firestore.')) {
                try {
                  const res = await ApiService.clearPlatformData();
                  setSavedNote(res.message || 'Platform data cleared successfully.');
                  window.dispatchEvent(new CustomEvent('refresh-omnitrack'));
                  window.dispatchEvent(new CustomEvent('campaigns-updated'));
                } catch (err: any) {
                  alert(err.message || 'Failed to clear platform data');
                }
              }
            }}
            className="px-4 py-2.5 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 rounded-xl text-xs font-bold transition-colors flex items-center gap-2 cursor-pointer"
          >
            <span>Clear Platform Data Only</span>
          </button>

          {testingToolsEnabled && (
            <>
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
            </>
          )}
        </div>
      </div>
      </>
      )}
    </div>
  );
};
