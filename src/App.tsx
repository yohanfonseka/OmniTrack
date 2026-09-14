import React, { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Navbar } from './components/layout/Navbar';
import { Sidebar } from './components/layout/Sidebar';
import { DrillDownContainer } from './components/dashboard/DrillDownContainer';
import { CampaignsListView } from './components/campaigns/CampaignsListView';
import { ClientsBrandsView } from './components/clients/ClientsBrandsView';
import { AlertsView } from './components/alerts/AlertsView';
import { UnmappedCampaignsView } from './components/unmapped/UnmappedCampaignsView';
import { CsvImportWizard } from './components/imports/CsvImportWizard';
import { AgencySettingsView } from './components/settings/AgencySettingsView';
import { SuperUserPortal } from './components/superuser/SuperUserPortal';
import { ClientViewerPortal } from './components/clientportal/ClientViewerPortal';
import { CreateLineItemModal } from './components/modals/CreateLineItemModal';
import { CreateCampaignModal } from './components/modals/CreateCampaignModal';

const AppContent: React.FC = () => {
  const { currentPortal, selectCampaign, drillDown, currentAgency } = useAuth();
  const [activeTab, setActiveTab] = useState<string>('dashboard');

  // Modals
  const [createLineItemCampaignId, setCreateLineItemCampaignId] = useState<string | null>(null);
  const [showCreateCampaignModal, setShowCreateCampaignModal] = useState<boolean>(false);

  // Quick jump from alerts or campaigns list into drilldown
  const handleSelectCampaignDrillDown = (campaignId: string, clientId?: string, brandId?: string) => {
    selectCampaign(campaignId, clientId, brandId);
    setActiveTab('dashboard');
  };

  return (
    <div className="min-h-screen bg-slate-100/70 font-sans text-slate-800 flex flex-col antialiased">
      {/* Top Navbar */}
      <Navbar
        onOpenAlerts={() => setActiveTab('alerts')}
        onRefreshData={() => {
          // Re-trigger active view
          window.dispatchEvent(new CustomEvent('refresh-omnitrack'));
        }}
      />

      {/* Main Body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar (Only shown in Agency and Super User modes, hidden in Client Viewer) */}
        {currentPortal !== 'client_viewer' && (
          <Sidebar currentTab={activeTab} onSelectTab={setActiveTab} />
        )}

        {/* Content Viewport */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
          {/* Super User Portal */}
          {currentPortal === 'super_user' ? (
            <SuperUserPortal />
          ) : currentPortal === 'client_viewer' ? (
            /* Client Viewer Portal */
            <ClientViewerPortal />
          ) : (
            /* Agency Operations Portal */
            <>
              {activeTab === 'dashboard' && (
                <DrillDownContainer
                  onOpenCreateLineItem={campId => setCreateLineItemCampaignId(campId)}
                  onOpenCreateCampaign={() => setShowCreateCampaignModal(true)}
                />
              )}

              {activeTab === 'campaigns' && (
                <CampaignsListView
                  onSelectCampaign={handleSelectCampaignDrillDown}
                  onOpenCreateCampaign={() => setShowCreateCampaignModal(true)}
                />
              )}

              {activeTab === 'unmapped' && (
                <UnmappedCampaignsView
                  onNavigateToImports={() => setActiveTab('imports')}
                  onNavigateToCampaigns={() => setActiveTab('campaigns')}
                />
              )}

              {activeTab === 'clients' && (
                <ClientsBrandsView onSelectCampaign={handleSelectCampaignDrillDown} />
              )}

              {activeTab === 'alerts' && (
                <AlertsView onSelectCampaign={handleSelectCampaignDrillDown} />
              )}

              {activeTab === 'imports' && (
                <CsvImportWizard
                  onImportComplete={() => setActiveTab('dashboard')}
                  onNavigateToUnmapped={() => setActiveTab('unmapped')}
                />
              )}

              {activeTab === 'settings' && <AgencySettingsView />}
            </>
          )}
        </main>
      </div>

      {/* Line Item Creation Modal */}
      {createLineItemCampaignId && (
        <CreateLineItemModal
          campaignId={createLineItemCampaignId}
          clientId={drillDown.clientId || ''}
          brandId={drillDown.brandId || ''}
          currency="LKR"
          onClose={() => setCreateLineItemCampaignId(null)}
          onCreated={() => {
            setCreateLineItemCampaignId(null);
            window.dispatchEvent(new CustomEvent('refresh-omnitrack'));
            window.dispatchEvent(new CustomEvent('campaigns-updated'));
            setActiveTab('dashboard');
          }}
        />
      )}

      {/* Campaign Creation Modal */}
      {showCreateCampaignModal && (
        <CreateCampaignModal
          initialClientId={drillDown.clientId}
          initialBrandId={drillDown.brandId}
          onClose={() => setShowCreateCampaignModal(false)}
          onCreated={(newCampaignId, clientId, brandId) => {
            setShowCreateCampaignModal(false);
            if (newCampaignId) {
              selectCampaign(newCampaignId, clientId, brandId);
            }
            setActiveTab('dashboard');
            window.dispatchEvent(new CustomEvent('refresh-omnitrack'));
            window.dispatchEvent(new CustomEvent('campaigns-updated'));
          }}
        />
      )}
    </div>
  );
};

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
