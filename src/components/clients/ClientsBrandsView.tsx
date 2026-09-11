import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Client, Brand } from '../../types';
import { ApiService } from '../../lib/api';
import { CreateCampaignModal } from '../modals/CreateCampaignModal';
import {
  Briefcase,
  Tag,
  PlusCircle,
  Mail,
  Coins,
  Target,
  ChevronRight,
  Trash2,
  Pencil,
  AlertCircle,
  AlertTriangle,
  X,
  CheckCircle2,
  Layers,
  Search
} from 'lucide-react';

interface ClientsBrandsViewProps {
  onSelectCampaign?: (campaignId: string, clientId?: string, brandId?: string) => void;
}

export const ClientsBrandsView: React.FC<ClientsBrandsViewProps> = ({ onSelectCampaign }) => {
  const { currentAgency } = useAuth();

  const [clients, setClients] = useState<Client[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [selectedClientId, setSelectedClientId] = useState<string>('');
  const [clientSearch, setClientSearch] = useState<string>('');

  // Modals visibility
  const [showNewClientModal, setShowNewClientModal] = useState(false);
  const [showEditClientModal, setShowEditClientModal] = useState(false);
  const [showDeleteClientModal, setShowDeleteClientModal] = useState(false);

  const [showNewBrandModal, setShowNewBrandModal] = useState(false);
  const [editingBrand, setEditingBrand] = useState<Brand | null>(null);
  const [brandToDelete, setBrandToDelete] = useState<Brand | null>(null);
  const [createCampaignTarget, setCreateCampaignTarget] = useState<{ clientId: string; brandId: string } | null>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successToast, setSuccessToast] = useState<string | null>(null);

  // New Client form state
  const [newClientName, setNewClientName] = useState('');
  const [newClientIndustry, setNewClientIndustry] = useState('Retail & E-commerce');
  const [newClientCurrency, setNewClientCurrency] = useState('LKR');
  const [newClientContact, setNewClientContact] = useState('');
  const [newClientEmail, setNewClientEmail] = useState('');
  const [newClientError, setNewClientError] = useState<string | null>(null);

  // Edit Client form state
  const [editClientName, setEditClientName] = useState('');
  const [editClientIndustry, setEditClientIndustry] = useState('');
  const [editClientCurrency, setEditClientCurrency] = useState('LKR');
  const [editClientContact, setEditClientContact] = useState('');
  const [editClientEmail, setEditClientEmail] = useState('');
  const [editClientError, setEditClientError] = useState<string | null>(null);

  // New Brand form state
  const [newBrandName, setNewBrandName] = useState('');
  const [newBrandDesc, setNewBrandDesc] = useState('');
  const [newBrandCurrency, setNewBrandCurrency] = useState('LKR');
  const [newBrandError, setNewBrandError] = useState<string | null>(null);

  // Edit Brand form state
  const [editBrandName, setEditBrandName] = useState('');
  const [editBrandDesc, setEditBrandDesc] = useState('');
  const [editBrandCurrency, setEditBrandCurrency] = useState('LKR');
  const [editBrandError, setEditBrandError] = useState<string | null>(null);

  const notifyChange = () => {
    window.dispatchEvent(new CustomEvent('refresh-omnitrack'));
    window.dispatchEvent(new CustomEvent('campaigns-updated'));
  };

  const showToast = (msg: string) => {
    setSuccessToast(msg);
    setTimeout(() => {
      setSuccessToast(null);
    }, 4000);
  };

  const loadAll = async () => {
    if (!currentAgency) return;
    try {
      const [cList, bList, campList] = await Promise.all([
        ApiService.getClients(currentAgency.id),
        ApiService.getBrands(currentAgency.id),
        ApiService.getCampaigns(currentAgency.id)
      ]);
      setClients(cList);
      setBrands(bList);
      setCampaigns(campList);

      if (cList.length > 0) {
        setSelectedClientId(prev => {
          if (prev && cList.some(c => c.id === prev)) return prev;
          return cList[0].id;
        });
      } else {
        setSelectedClientId('');
      }
    } catch (err) {
      console.error('Failed to load hierarchy', err);
    }
  };

  useEffect(() => {
    loadAll();

    const handleRefresh = () => {
      loadAll();
    };
    window.addEventListener('refresh-omnitrack', handleRefresh);
    window.addEventListener('campaigns-updated', handleRefresh);
    return () => {
      window.removeEventListener('refresh-omnitrack', handleRefresh);
      window.removeEventListener('campaigns-updated', handleRefresh);
    };
  }, [currentAgency]);

  const activeClient = clients.find(c => c.id === selectedClientId);
  const clientBrands = brands.filter(b => b.client_id === selectedClientId);

  // ==================== REAL-TIME DUPLICATE CHECKS ====================
  // Check if a client name already exists (case-insensitive & trimmed)
  const isDuplicateClientName = (name: string, excludeId?: string): boolean => {
    const trimmed = name.trim().toLowerCase();
    if (!trimmed) return false;
    return clients.some(c => c.id !== excludeId && c.name.trim().toLowerCase() === trimmed);
  };

  // Check if a brand name already exists under the active client
  const isDuplicateBrandName = (name: string, clientId: string, excludeId?: string): boolean => {
    const trimmed = name.trim().toLowerCase();
    if (!trimmed || !clientId) return false;
    return brands.some(
      b => b.client_id === clientId && b.id !== excludeId && b.name.trim().toLowerCase() === trimmed
    );
  };

  // ==================== CLIENT HANDLERS ====================
  const handleOpenNewClientModal = () => {
    setNewClientName('');
    setNewClientIndustry('Retail & E-commerce');
    setNewClientCurrency('LKR');
    setNewClientContact('');
    setNewClientEmail('');
    setNewClientError(null);
    setShowNewClientModal(true);
  };

  const handleCreateClient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentAgency) return;

    const trimmed = newClientName.trim();
    if (!trimmed) {
      setNewClientError('Client company name is required.');
      return;
    }

    if (isDuplicateClientName(trimmed)) {
      setNewClientError(`A client named "${trimmed}" already exists in this agency.`);
      return;
    }

    setIsSubmitting(true);
    setNewClientError(null);

    try {
      const created = await ApiService.createClient(currentAgency.id, {
        name: trimmed,
        industry: newClientIndustry.trim() || 'General',
        currency: newClientCurrency,
        contact_person: newClientContact.trim(),
        contact_email: newClientEmail.trim()
      });

      setClients(prev => [...prev, created]);
      setSelectedClientId(created.id);
      setShowNewClientModal(false);
      showToast(`Client "${created.name}" created successfully.`);
      notifyChange();
    } catch (err: any) {
      setNewClientError(err.message || 'Failed to create client.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenEditClientModal = () => {
    if (!activeClient) return;
    setEditClientName(activeClient.name);
    setEditClientIndustry(activeClient.industry || '');
    setEditClientCurrency(activeClient.currency || 'LKR');
    setEditClientContact(activeClient.contact_person || '');
    setEditClientEmail(activeClient.contact_email || '');
    setEditClientError(null);
    setShowEditClientModal(true);
  };

  const handleUpdateClient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentAgency || !activeClient) return;

    const trimmed = editClientName.trim();
    if (!trimmed) {
      setEditClientError('Client company name cannot be empty.');
      return;
    }

    if (isDuplicateClientName(trimmed, activeClient.id)) {
      setEditClientError(`A client named "${trimmed}" already exists in this agency.`);
      return;
    }

    setIsSubmitting(true);
    setEditClientError(null);

    try {
      const updated = await ApiService.updateClient(currentAgency.id, activeClient.id, {
        name: trimmed,
        industry: editClientIndustry.trim(),
        currency: editClientCurrency,
        contact_person: editClientContact.trim(),
        contact_email: editClientEmail.trim()
      });

      setClients(prev => prev.map(c => (c.id === updated.id ? updated : c)));
      setShowEditClientModal(false);
      showToast(`Client "${updated.name}" updated successfully.`);
      notifyChange();
    } catch (err: any) {
      setEditClientError(err.message || 'Failed to update client.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteClient = async () => {
    if (!currentAgency || !activeClient) return;
    setIsSubmitting(true);

    try {
      await ApiService.deleteClient(currentAgency.id, activeClient.id);
      const remaining = clients.filter(c => c.id !== activeClient.id);
      setClients(remaining);
      setBrands(prev => prev.filter(b => b.client_id !== activeClient.id));
      setCampaigns(prev => prev.filter(c => c.campaign.client_id !== activeClient.id));

      if (remaining.length > 0) {
        setSelectedClientId(remaining[0].id);
      } else {
        setSelectedClientId('');
      }

      setShowDeleteClientModal(false);
      showToast(`Client "${activeClient.name}" and associated records deleted.`);
      notifyChange();
    } catch (err: any) {
      alert(`Error deleting client: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  // ==================== BRAND HANDLERS ====================
  const handleOpenNewBrandModal = () => {
    if (!activeClient) return;
    setNewBrandName('');
    setNewBrandDesc('');
    setNewBrandCurrency(activeClient.currency || 'LKR');
    setNewBrandError(null);
    setShowNewBrandModal(true);
  };

  const handleCreateBrand = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentAgency || !selectedClientId) return;

    const trimmed = newBrandName.trim();
    if (!trimmed) {
      setNewBrandError('Brand name is required.');
      return;
    }

    if (isDuplicateBrandName(trimmed, selectedClientId)) {
      setNewBrandError(`A brand named "${trimmed}" already exists under this client.`);
      return;
    }

    setIsSubmitting(true);
    setNewBrandError(null);

    try {
      const created = await ApiService.createBrand(currentAgency.id, {
        client_id: selectedClientId,
        name: trimmed,
        description: newBrandDesc.trim(),
        default_currency: newBrandCurrency
      });

      setBrands(prev => [...prev, created]);
      setShowNewBrandModal(false);
      showToast(`Brand "${created.name}" created successfully.`);
      notifyChange();
    } catch (err: any) {
      setNewBrandError(err.message || 'Failed to create brand.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenEditBrandModal = (brand: Brand) => {
    setEditingBrand(brand);
    setEditBrandName(brand.name);
    setEditBrandDesc(brand.description || '');
    setEditBrandCurrency(brand.default_currency || activeClient?.currency || 'LKR');
    setEditBrandError(null);
  };

  const handleUpdateBrand = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentAgency || !editingBrand) return;

    const trimmed = editBrandName.trim();
    if (!trimmed) {
      setEditBrandError('Brand name cannot be empty.');
      return;
    }

    if (isDuplicateBrandName(trimmed, editingBrand.client_id, editingBrand.id)) {
      setEditBrandError(`A brand named "${trimmed}" already exists under this client.`);
      return;
    }

    setIsSubmitting(true);
    setEditBrandError(null);

    try {
      const updated = await ApiService.updateBrand(currentAgency.id, editingBrand.id, {
        name: trimmed,
        description: editBrandDesc.trim(),
        default_currency: editBrandCurrency
      });

      setBrands(prev => prev.map(b => (b.id === updated.id ? updated : b)));
      setEditingBrand(null);
      showToast(`Brand "${updated.name}" updated successfully.`);
      notifyChange();
    } catch (err: any) {
      setEditBrandError(err.message || 'Failed to update brand.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteBrand = async () => {
    if (!currentAgency || !brandToDelete) return;
    setIsSubmitting(true);

    try {
      await ApiService.deleteBrand(currentAgency.id, brandToDelete.id);
      setBrands(prev => prev.filter(b => b.id !== brandToDelete.id));
      setCampaigns(prev => prev.filter(c => c.campaign.brand_id !== brandToDelete.id));
      setBrandToDelete(null);
      showToast(`Brand "${brandToDelete.name}" and associated campaigns deleted.`);
      notifyChange();
    } catch (err: any) {
      alert(`Error deleting brand: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Filter clients by search
  const filteredClients = clients.filter(c =>
    c.name.toLowerCase().includes(clientSearch.toLowerCase()) ||
    c.industry.toLowerCase().includes(clientSearch.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Success Notification Toast */}
      {successToast && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900 text-white px-4 py-3 rounded-xl shadow-xl flex items-center gap-2.5 text-xs font-medium animate-fade-in border border-slate-700">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{successToast}</span>
          <button onClick={() => setSuccessToast(null)} className="ml-2 text-slate-400 hover:text-white">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Header */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-6 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <Briefcase className="w-5 h-5 text-indigo-600" />
            Clients & Brand Portfolios
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Manage company accounts, multi-tier brand portfolios, and currency reporting standards.
          </p>
        </div>

        <button
          id="btn-add-new-client"
          onClick={handleOpenNewClientModal}
          className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white rounded-lg text-xs font-semibold hover:bg-indigo-700 shadow-xs transition-colors self-start sm:self-center"
        >
          <PlusCircle className="w-4 h-4" />
          <span>New Client</span>
        </button>
      </div>

      {/* 2-Column Split: Client Picker & Brand Details */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Left Col: Client List */}
        <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-xs space-y-3">
          <div className="flex items-center justify-between px-2">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
              Agency Clients ({clients.length})
            </span>
          </div>

          {/* Client Search Filter */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={clientSearch}
              onChange={e => setClientSearch(e.target.value)}
              placeholder="Search clients..."
              className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 placeholder:text-slate-400 outline-none focus:border-indigo-500 focus:bg-white"
            />
          </div>

          <div className="space-y-1 max-h-[600px] overflow-y-auto pr-1">
            {filteredClients.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-400">
                {clientSearch ? 'No clients match search.' : 'No clients added yet.'}
              </div>
            ) : (
              filteredClients.map(c => {
                const brandCount = brands.filter(b => b.client_id === c.id).length;
                const isSelected = c.id === selectedClientId;
                return (
                  <div
                    key={c.id}
                    id={`client-card-${c.id}`}
                    onClick={() => setSelectedClientId(c.id)}
                    className={`p-3 rounded-xl cursor-pointer transition-all border ${
                      isSelected
                        ? 'bg-indigo-50/80 border-indigo-200 shadow-2xs text-slate-900 ring-1 ring-indigo-500/20'
                        : 'hover:bg-slate-50 border-transparent text-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-xs text-slate-900">{c.name}</span>
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 font-semibold">
                        {c.currency}
                      </span>
                    </div>
                    <div className="flex items-center justify-between mt-1 text-[11px] text-slate-500">
                      <span className="truncate max-w-[120px]">{c.industry}</span>
                      <span className="font-medium text-slate-400">
                        {brandCount} {brandCount === 1 ? 'brand' : 'brands'}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Col: Selected Client Details & Brand Hierarchy */}
        <div className="md:col-span-2 space-y-6">
          {activeClient ? (
            <div className="bg-white border border-slate-200/90 rounded-2xl p-6 shadow-xs space-y-6">
              {/* Client Info Banner with Edit & Delete Controls */}
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 pb-5 border-b border-slate-100">
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-xl font-bold text-slate-900">{activeClient.name}</h3>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 font-semibold border border-indigo-100">
                      {activeClient.industry}
                    </span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 font-bold border border-slate-200">
                      {activeClient.currency}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500 pt-1">
                    {activeClient.contact_person && (
                      <span className="flex items-center gap-1.5">
                        <span className="font-semibold text-slate-700">Contact:</span>
                        <span>{activeClient.contact_person}</span>
                      </span>
                    )}
                    {activeClient.contact_email && (
                      <span className="flex items-center gap-1.5">
                        <Mail className="w-3.5 h-3.5 text-slate-400" />
                        <span className="text-slate-600">{activeClient.contact_email}</span>
                      </span>
                    )}
                    <span className="flex items-center gap-1.5">
                      <Coins className="w-3.5 h-3.5 text-slate-400" />
                      <span>Currency: <strong className="text-slate-800">{activeClient.currency}</strong></span>
                    </span>
                  </div>
                </div>

                {/* Client Action Buttons: Edit Client, Delete Client, Add Brand */}
                <div className="flex items-center gap-2 shrink-0 self-start sm:self-center">
                  <button
                    id="btn-edit-active-client"
                    onClick={handleOpenEditClientModal}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 text-slate-700 rounded-lg text-xs font-semibold hover:bg-slate-50 hover:border-slate-300 transition-colors shadow-2xs"
                    title="Edit Client Information"
                  >
                    <Pencil className="w-3.5 h-3.5 text-slate-500" />
                    <span>Edit Client</span>
                  </button>

                  <button
                    id="btn-delete-active-client"
                    onClick={() => setShowDeleteClientModal(true)}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-white border border-rose-200 text-rose-600 rounded-lg text-xs font-semibold hover:bg-rose-50 transition-colors shadow-2xs"
                    title="Delete Client"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-rose-500" />
                  </button>

                  <button
                    id="btn-add-new-brand"
                    onClick={handleOpenNewBrandModal}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-slate-900 text-white rounded-lg text-xs font-semibold hover:bg-slate-800 shadow-2xs transition-colors"
                  >
                    <PlusCircle className="w-3.5 h-3.5" />
                    <span>Add Brand</span>
                  </button>
                </div>
              </div>

              {/* Brands Grid */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-900 uppercase tracking-wider block">
                    Brands & Campaigns ({clientBrands.length})
                  </span>
                  <span className="text-xs text-slate-400">
                    Each brand has its own campaign portfolio and reporting metrics
                  </span>
                </div>

                {clientBrands.length === 0 ? (
                  <div className="p-8 border border-dashed border-slate-200 rounded-xl text-center text-slate-400 text-xs bg-slate-50/50">
                    <p className="font-medium text-slate-600">No brands created for {activeClient.name} yet.</p>
                    <p className="mt-1">Click "Add Brand" above to register the first product line or brand entity.</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {clientBrands.map(brand => {
                      const brandCampaigns = campaigns.filter(c => c.campaign.brand_id === brand.id);
                      return (
                        <div
                          key={brand.id}
                          id={`brand-card-${brand.id}`}
                          className="border border-slate-200 rounded-xl p-4 bg-slate-50/60 space-y-3 transition-shadow hover:shadow-xs"
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div className="space-y-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <Tag className="w-4 h-4 text-indigo-600 shrink-0" />
                                <h4 className="font-bold text-sm text-slate-900">{brand.name}</h4>
                                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white border border-slate-200 text-slate-600 font-semibold">
                                  {brand.default_currency || activeClient.currency}
                                </span>
                              </div>
                              {brand.description && (
                                <p className="text-xs text-slate-600 leading-relaxed">{brand.description}</p>
                              )}
                            </div>

                            {/* Brand Actions: Edit & Delete */}
                            <div className="flex items-center gap-1.5 shrink-0">
                              <button
                                id={`btn-edit-brand-${brand.id}`}
                                onClick={() => handleOpenEditBrandModal(brand)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 bg-white border border-slate-200 text-slate-600 rounded-md text-[11px] font-medium hover:bg-slate-50 hover:text-slate-900 transition-colors shadow-2xs"
                                title="Edit Brand"
                              >
                                <Pencil className="w-3 h-3 text-slate-400" />
                                <span>Edit</span>
                              </button>

                              <button
                                id={`btn-delete-brand-${brand.id}`}
                                onClick={() => setBrandToDelete(brand)}
                                className="inline-flex items-center p-1 bg-white border border-rose-200 text-rose-500 rounded-md text-[11px] hover:bg-rose-50 hover:text-rose-700 transition-colors shadow-2xs"
                                title="Delete Brand"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          </div>

                          {/* Campaigns under brand */}
                          <div className="space-y-2 pt-2 border-t border-slate-200/70">
                            <div className="flex items-center justify-between text-[11px] text-slate-500 font-medium">
                              <span>Campaigns ({brandCampaigns.length})</span>
                              <div className="flex items-center gap-2">
                                <button
                                  id={`btn-create-campaign-brand-${brand.id}`}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setCreateCampaignTarget({ clientId: activeClient.id, brandId: brand.id });
                                  }}
                                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 px-2 py-0.5 rounded transition-colors"
                                >
                                  <PlusCircle className="w-3 h-3" />
                                  <span>Create Campaign</span>
                                </button>
                                {brandCampaigns.length > 0 && (
                                  <span className="text-[10px] text-slate-400 hidden sm:inline">• Click to drill-down</span>
                                )}
                              </div>
                            </div>

                            {brandCampaigns.length === 0 ? (
                              <div className="text-center py-3 text-slate-400 text-xs italic bg-white/60 rounded-lg border border-slate-100">
                                No active campaigns configured under this brand yet.
                              </div>
                            ) : (
                              brandCampaigns.map(cm => (
                                <div
                                  key={cm.campaign.id}
                                  id={`brand-campaign-${cm.campaign.id}`}
                                  onClick={() => onSelectCampaign && onSelectCampaign(cm.campaign.id, activeClient.id, brand.id)}
                                  className="p-2.5 rounded-lg bg-white border border-slate-200/90 hover:border-indigo-300 hover:shadow-xs transition-all cursor-pointer flex items-center justify-between"
                                >
                                  <div className="flex items-center gap-2.5">
                                    <Target className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                                    <span className="text-xs font-semibold text-slate-800">{cm.campaign.name}</span>
                                    <span className="text-[10px] text-slate-400">
                                      Budget: {activeClient.currency} {cm.total_budget.toLocaleString()}
                                    </span>
                                  </div>

                                  <div className="flex items-center gap-3">
                                    <span className="text-xs font-bold text-slate-700">
                                      {cm.budget_used_percentage.toFixed(0)}% spent
                                    </span>
                                    <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                                  </div>
                                </div>
                              ))
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center text-slate-400">
              Select a client on the left or create a new client to inspect and manage brands.
            </div>
          )}
        </div>
      </div>

      {/* ==================== CREATE CLIENT MODAL ==================== */}
      {showNewClientModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Briefcase className="w-4 h-4 text-indigo-600" />
                <span>Add New Client Account</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowNewClientModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {newClientError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                <span>{newClientError}</span>
              </div>
            )}

            <form onSubmit={handleCreateClient} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Company / Client Name *</label>
                <input
                  type="text"
                  required
                  value={newClientName}
                  onChange={e => {
                    setNewClientName(e.target.value);
                    if (newClientError) setNewClientError(null);
                  }}
                  placeholder="e.g. Apex Global Corp"
                  className={`w-full px-3 py-2 border rounded-lg text-xs outline-none transition-colors ${
                    isDuplicateClientName(newClientName)
                      ? 'border-rose-400 bg-rose-50/30 focus:border-rose-500'
                      : 'border-slate-200 focus:border-indigo-500'
                  }`}
                />
                {isDuplicateClientName(newClientName) && (
                  <p className="text-[11px] text-rose-600 mt-1 flex items-center gap-1 font-medium">
                    <AlertTriangle className="w-3 h-3 text-rose-500" />
                    A client with this name already exists in this agency.
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Industry</label>
                  <input
                    type="text"
                    value={newClientIndustry}
                    onChange={e => setNewClientIndustry(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Reporting Currency</label>
                  <select
                    value={newClientCurrency}
                    onChange={e => setNewClientCurrency(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs outline-none focus:border-indigo-500"
                  >
                    <option value="LKR">LKR (Sri Lankan Rupee)</option>
                    <option value="USD">USD ($)</option>
                    <option value="GBP">GBP (£)</option>
                    <option value="EUR">EUR (€)</option>
                    <option value="AUD">AUD ($)</option>
                    <option value="AED">AED (Dirham)</option>
                    <option value="SGD">SGD ($)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Primary Contact Name</label>
                <input
                  type="text"
                  value={newClientContact}
                  onChange={e => setNewClientContact(e.target.value)}
                  placeholder="e.g. Rachel Adams"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Contact Email</label>
                <input
                  type="email"
                  value={newClientEmail}
                  onChange={e => setNewClientEmail(e.target.value)}
                  placeholder="rachel@apexglobal.com"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs outline-none focus:border-indigo-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowNewClientModal(false)}
                  className="px-4 py-2 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || isDuplicateClientName(newClientName) || !newClientName.trim()}
                  className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-xs"
                >
                  {isSubmitting ? 'Creating...' : 'Create Client'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==================== EDIT CLIENT MODAL ==================== */}
      {showEditClientModal && activeClient && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Pencil className="w-4 h-4 text-indigo-600" />
                <span>Edit Client Account</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowEditClientModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {editClientError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                <span>{editClientError}</span>
              </div>
            )}

            <form onSubmit={handleUpdateClient} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Company / Client Name *</label>
                <input
                  type="text"
                  required
                  value={editClientName}
                  onChange={e => {
                    setEditClientName(e.target.value);
                    if (editClientError) setEditClientError(null);
                  }}
                  className={`w-full px-3 py-2 border rounded-lg text-xs outline-none transition-colors ${
                    isDuplicateClientName(editClientName, activeClient.id)
                      ? 'border-rose-400 bg-rose-50/30 focus:border-rose-500'
                      : 'border-slate-200 focus:border-indigo-500'
                  }`}
                />
                {isDuplicateClientName(editClientName, activeClient.id) && (
                  <p className="text-[11px] text-rose-600 mt-1 flex items-center gap-1 font-medium">
                    <AlertTriangle className="w-3 h-3 text-rose-500" />
                    Another client with this name already exists in this agency.
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Industry</label>
                  <input
                    type="text"
                    value={editClientIndustry}
                    onChange={e => setEditClientIndustry(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Reporting Currency</label>
                  <select
                    value={editClientCurrency}
                    onChange={e => setEditClientCurrency(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs outline-none focus:border-indigo-500"
                  >
                    <option value="LKR">LKR (Sri Lankan Rupee)</option>
                    <option value="USD">USD ($)</option>
                    <option value="GBP">GBP (£)</option>
                    <option value="EUR">EUR (€)</option>
                    <option value="AUD">AUD ($)</option>
                    <option value="AED">AED (Dirham)</option>
                    <option value="SGD">SGD ($)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Primary Contact Name</label>
                <input
                  type="text"
                  value={editClientContact}
                  onChange={e => setEditClientContact(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Contact Email</label>
                <input
                  type="email"
                  value={editClientEmail}
                  onChange={e => setEditClientEmail(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs outline-none focus:border-indigo-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowEditClientModal(false)}
                  className="px-4 py-2 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || isDuplicateClientName(editClientName, activeClient.id) || !editClientName.trim()}
                  className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-xs"
                >
                  {isSubmitting ? 'Saving Changes...' : 'Save Client Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==================== DELETE CLIENT CONFIRMATION MODAL ==================== */}
      {showDeleteClientModal && activeClient && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="w-12 h-12 rounded-full bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-600 mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </div>

            <div className="text-center space-y-2">
              <h3 className="text-base font-bold text-slate-900">Delete Client Account?</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Are you sure you want to permanently delete <strong className="text-slate-900">{activeClient.name}</strong>?
              </p>
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-[11px] text-amber-800 text-left space-y-1">
                <p className="font-semibold">⚠️ Warning - Cascade Deletion:</p>
                <p>
                  This action will permanently delete all {clientBrands.length} associated brand(s) and any campaigns or line items linked to this client.
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowDeleteClientModal(false)}
                className="px-4 py-2 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={handleDeleteClient}
                className="px-4 py-2 rounded-lg bg-rose-600 text-white text-xs font-bold hover:bg-rose-700 disabled:opacity-50 shadow-xs"
              >
                {isSubmitting ? 'Deleting...' : 'Yes, Delete Client'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================== CREATE BRAND MODAL ==================== */}
      {showNewBrandModal && activeClient && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Tag className="w-4 h-4 text-indigo-600" />
                <span>Add Brand for {activeClient.name}</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowNewBrandModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {newBrandError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                <span>{newBrandError}</span>
              </div>
            )}

            <form onSubmit={handleCreateBrand} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Brand Name *</label>
                <input
                  type="text"
                  required
                  value={newBrandName}
                  onChange={e => {
                    setNewBrandName(e.target.value);
                    if (newBrandError) setNewBrandError(null);
                  }}
                  placeholder="e.g. Apex Health Nutrition"
                  className={`w-full px-3 py-2 border rounded-lg text-xs outline-none transition-colors ${
                    isDuplicateBrandName(newBrandName, activeClient.id)
                      ? 'border-rose-400 bg-rose-50/30 focus:border-rose-500'
                      : 'border-slate-200 focus:border-indigo-500'
                  }`}
                />
                {isDuplicateBrandName(newBrandName, activeClient.id) && (
                  <p className="text-[11px] text-rose-600 mt-1 flex items-center gap-1 font-medium">
                    <AlertTriangle className="w-3 h-3 text-rose-500" />
                    A brand with this name already exists for {activeClient.name}.
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Brand Description</label>
                <textarea
                  rows={3}
                  value={newBrandDesc}
                  onChange={e => setNewBrandDesc(e.target.value)}
                  placeholder="Describe the product line, target demographic, or focus area..."
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Default Reporting Currency</label>
                <select
                  value={newBrandCurrency}
                  onChange={e => setNewBrandCurrency(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs outline-none focus:border-indigo-500"
                >
                  <option value={activeClient.currency}>Same as Client ({activeClient.currency})</option>
                  <option value="LKR">LKR (Sri Lankan Rupee)</option>
                  <option value="USD">USD ($)</option>
                  <option value="GBP">GBP (£)</option>
                  <option value="EUR">EUR (€)</option>
                  <option value="AUD">AUD ($)</option>
                  <option value="AED">AED (Dirham)</option>
                  <option value="SGD">SGD ($)</option>
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowNewBrandModal(false)}
                  className="px-4 py-2 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || isDuplicateBrandName(newBrandName, activeClient.id) || !newBrandName.trim()}
                  className="px-4 py-2 rounded-lg bg-slate-900 text-white text-xs font-bold hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed shadow-xs"
                >
                  {isSubmitting ? 'Saving...' : 'Save Brand'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==================== EDIT BRAND MODAL ==================== */}
      {editingBrand && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Pencil className="w-4 h-4 text-indigo-600" />
                <span>Edit Brand Portfolio</span>
              </h3>
              <button
                type="button"
                onClick={() => setEditingBrand(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {editBrandError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                <span>{editBrandError}</span>
              </div>
            )}

            <form onSubmit={handleUpdateBrand} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Brand Name *</label>
                <input
                  type="text"
                  required
                  value={editBrandName}
                  onChange={e => {
                    setEditBrandName(e.target.value);
                    if (editBrandError) setEditBrandError(null);
                  }}
                  className={`w-full px-3 py-2 border rounded-lg text-xs outline-none transition-colors ${
                    isDuplicateBrandName(editBrandName, editingBrand.client_id, editingBrand.id)
                      ? 'border-rose-400 bg-rose-50/30 focus:border-rose-500'
                      : 'border-slate-200 focus:border-indigo-500'
                  }`}
                />
                {isDuplicateBrandName(editBrandName, editingBrand.client_id, editingBrand.id) && (
                  <p className="text-[11px] text-rose-600 mt-1 flex items-center gap-1 font-medium">
                    <AlertTriangle className="w-3 h-3 text-rose-500" />
                    Another brand with this name already exists for this client.
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Brand Description</label>
                <textarea
                  rows={3}
                  value={editBrandDesc}
                  onChange={e => setNewBrandDesc(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Default Reporting Currency</label>
                <select
                  value={editBrandCurrency}
                  onChange={e => setEditBrandCurrency(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs outline-none focus:border-indigo-500"
                >
                  <option value="LKR">LKR (Sri Lankan Rupee)</option>
                  <option value="USD">USD ($)</option>
                  <option value="GBP">GBP (£)</option>
                  <option value="EUR">EUR (€)</option>
                  <option value="AUD">AUD ($)</option>
                  <option value="AED">AED (Dirham)</option>
                  <option value="SGD">SGD ($)</option>
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingBrand(null)}
                  className="px-4 py-2 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={
                    isSubmitting ||
                    isDuplicateBrandName(editBrandName, editingBrand.client_id, editingBrand.id) ||
                    !editBrandName.trim()
                  }
                  className="px-4 py-2 rounded-lg bg-slate-900 text-white text-xs font-bold hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed shadow-xs"
                >
                  {isSubmitting ? 'Saving Changes...' : 'Save Brand Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==================== DELETE BRAND CONFIRMATION MODAL ==================== */}
      {brandToDelete && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="w-12 h-12 rounded-full bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-600 mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </div>

            <div className="text-center space-y-2">
              <h3 className="text-base font-bold text-slate-900">Delete Brand Portfolio?</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Are you sure you want to permanently delete the brand <strong className="text-slate-900">{brandToDelete.name}</strong>?
              </p>
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-[11px] text-amber-800 text-left">
                <p className="font-semibold">⚠️ Warning:</p>
                <p>
                  Any campaigns and line items specifically under this brand will also be permanently deleted from OmniTrack.
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setBrandToDelete(null)}
                className="px-4 py-2 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={handleDeleteBrand}
                className="px-4 py-2 rounded-lg bg-rose-600 text-white text-xs font-bold hover:bg-rose-700 disabled:opacity-50 shadow-xs"
              >
                {isSubmitting ? 'Deleting...' : 'Yes, Delete Brand'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Campaign Modal triggered from Brand */}
      {createCampaignTarget && (
        <CreateCampaignModal
          initialClientId={createCampaignTarget.clientId}
          initialBrandId={createCampaignTarget.brandId}
          onClose={() => setCreateCampaignTarget(null)}
          onCreated={() => {
            setCreateCampaignTarget(null);
            loadAll();
            notifyChange();
            showToast('Business Campaign created successfully under brand.');
          }}
        />
      )}
    </div>
  );
};
