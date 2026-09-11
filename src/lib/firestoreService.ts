import {
  collection,
  doc,
  setDoc,
  getDocs,
  getDoc,
  serverTimestamp,
  writeBatch
} from 'firebase/firestore';
import { db, projectId, databaseId, handleFirestoreError, OperationType } from './firebase';
import { ApiService } from './api';

export interface FirestoreSyncStatus {
  connected: boolean;
  projectId: string;
  databaseId: string;
  lastSyncedAt: string | null;
  syncedCounts: {
    agencies: number;
    clients: number;
    brands: number;
    campaigns: number;
    lineItems: number;
    alerts: number;
  };
}

export class FirestoreService {
  /**
   * Synchronize all application data from the API server into Firebase Firestore
   */
  static async syncAllToFirestore(agencyId?: string): Promise<{ success: boolean; counts: any }> {
    try {
      const agencies = await ApiService.getAgencies();
      const targetAgencies = agencyId ? agencies.filter(a => a.id === agencyId) : agencies;

      let clientsCount = 0;
      let brandsCount = 0;
      let campaignsCount = 0;
      let lineItemsCount = 0;
      let alertsCount = 0;

      // 1. Sync Agencies
      for (const agency of targetAgencies) {
        await setDoc(doc(db, 'agencies', agency.id), {
          ...agency,
          _synced_at: new Date().toISOString()
        }, { merge: true });

        // 2. Sync Clients & Brands
        const clients = await ApiService.getClients(agency.id);
        clientsCount += clients.length;
        for (const client of clients) {
          await setDoc(doc(db, 'clients', client.id), {
            ...client,
            agency_id: agency.id,
            _synced_at: new Date().toISOString()
          }, { merge: true });

          const brands = await ApiService.getBrands(agency.id, client.id);
          brandsCount += brands.length;
          for (const brand of brands) {
            await setDoc(doc(db, 'brands', brand.id), {
              ...brand,
              agency_id: agency.id,
              client_id: client.id,
              _synced_at: new Date().toISOString()
            }, { merge: true });
          }
        }

        // 3. Sync Campaigns & Line items
        const campaignsData = await ApiService.getCampaigns(agency.id);
        campaignsCount += campaignsData.length;
        for (const cData of campaignsData) {
          await setDoc(doc(db, 'campaigns', cData.campaign.id), {
            ...cData.campaign,
            agency_id: agency.id,
            _synced_at: new Date().toISOString()
          }, { merge: true });

          // Sync line items under this campaign
          for (const plat of cData.platforms) {
            for (const item of plat.line_items) {
              lineItemsCount++;
              await setDoc(doc(db, 'line_items', item.line_item.id), {
                ...item.line_item,
                agency_id: agency.id,
                _synced_at: new Date().toISOString()
              }, { merge: true });
            }
          }
        }

        // 4. Sync Alerts
        const alerts = await ApiService.getAlerts(agency.id);
        alertsCount += alerts.length;
        for (const alert of alerts) {
          await setDoc(doc(db, 'alerts', alert.id), {
            ...alert,
            agency_id: agency.id,
            _synced_at: new Date().toISOString()
          }, { merge: true });
        }
      }

      const syncResult = {
        agencies: targetAgencies.length,
        clients: clientsCount,
        brands: brandsCount,
        campaigns: campaignsCount,
        lineItems: lineItemsCount,
        alerts: alertsCount
      };

      // Record a sync heartbeat in test collection
      await setDoc(doc(db, 'test', 'sync_heartbeat'), {
        last_sync: new Date().toISOString(),
        summary: syncResult
      });

      return { success: true, counts: syncResult };
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'syncAllToFirestore');
    }
  }

  /**
   * Check connection and count documents in Firestore
   */
  static async getFirestoreHealth(): Promise<FirestoreSyncStatus> {
    try {
      const agenciesSnap = await getDocs(collection(db, 'agencies'));
      const clientsSnap = await getDocs(collection(db, 'clients'));
      const campaignsSnap = await getDocs(collection(db, 'campaigns'));
      const lineItemsSnap = await getDocs(collection(db, 'line_items'));
      const alertsSnap = await getDocs(collection(db, 'alerts'));
      const brandsSnap = await getDocs(collection(db, 'brands'));

      return {
        connected: true,
        projectId,
        databaseId,
        lastSyncedAt: new Date().toLocaleTimeString(),
        syncedCounts: {
          agencies: agenciesSnap.size,
          clients: clientsSnap.size,
          brands: brandsSnap.size,
          campaigns: campaignsSnap.size,
          lineItems: lineItemsSnap.size,
          alerts: alertsSnap.size
        }
      };
    } catch (error) {
      console.warn('[Firestore] getFirestoreHealth error:', error);
      return {
        connected: false,
        projectId,
        databaseId,
        lastSyncedAt: null,
        syncedCounts: {
          agencies: 0,
          clients: 0,
          brands: 0,
          campaigns: 0,
          lineItems: 0,
          alerts: 0
        }
      };
    }
  }
}
