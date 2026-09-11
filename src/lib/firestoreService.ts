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

interface FirestoreSyncResult {
  success: boolean;
  counts: FirestoreSyncStatus['syncedCounts'];
}

/**
 * Firestore is only ever written to by the server (via the Firebase Admin
 * SDK) - the browser has no direct database access. These calls go through
 * the app's own API, which reports on / triggers that server-side sync.
 */
export class FirestoreService {
  static async syncAllToFirestore(agencyId?: string): Promise<FirestoreSyncResult> {
    const res = await fetch('/api/system/firestore-sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agency_id: agencyId })
    });
    if (!res.ok) {
      throw new Error(`Firestore sync failed: ${res.status} ${res.statusText}`);
    }
    return res.json();
  }

  static async getFirestoreHealth(agencyId?: string): Promise<FirestoreSyncStatus> {
    try {
      const path = agencyId ? `/api/system/firestore-status?agency_id=${encodeURIComponent(agencyId)}` : '/api/system/firestore-status';
      const res = await fetch(path);
      if (!res.ok) throw new Error(`Firestore status failed: ${res.status} ${res.statusText}`);
      const status: Omit<FirestoreSyncStatus, 'lastSyncedAt'> = await res.json();
      return { ...status, lastSyncedAt: new Date().toLocaleTimeString() };
    } catch (error) {
      console.warn('[Firestore] getFirestoreHealth error:', error);
      return {
        connected: false,
        projectId: '',
        databaseId: '',
        lastSyncedAt: null,
        syncedCounts: { agencies: 0, clients: 0, brands: 0, campaigns: 0, lineItems: 0, alerts: 0 }
      };
    }
  }
}
