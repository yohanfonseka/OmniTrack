import fs from 'fs';
import path from 'path';
import { initializeApp, applicationDefault, getApps, getApp, cert } from 'firebase-admin/app';
import { getFirestore, Firestore } from 'firebase-admin/firestore';

let firestoreInstance: Firestore | null = null;
let firestoreDatabaseId: string = '';

interface AppletConfig {
  projectId?: string;
  firestoreDatabaseId?: string;
}

function loadAppletConfig(): AppletConfig {
  try {
    const configPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
    if (fs.existsSync(configPath)) {
      return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    }
  } catch (err) {
    console.warn('[Firestore Server] Could not read firebase-applet-config.json:', err);
  }
  return {};
}

/**
 * Initializes the Firebase Admin SDK using Application Default Credentials.
 * On GCP (Cloud Run, GCE, App Engine, GKE) this picks up the attached service
 * account automatically. Locally, run `gcloud auth application-default login`
 * or set GOOGLE_APPLICATION_CREDENTIALS to a service account key file.
 */
export function getFirestoreDb(): Firestore | null {
  if (firestoreInstance) return firestoreInstance;
  try {
    const appletConfig = loadAppletConfig();
    const projectId = process.env.FIREBASE_PROJECT_ID || appletConfig.projectId;
    firestoreDatabaseId = process.env.FIRESTORE_DATABASE_ID || appletConfig.firestoreDatabaseId || '';

    const serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    const credential = serviceAccountPath && fs.existsSync(serviceAccountPath)
      ? cert(serviceAccountPath)
      : applicationDefault();

    const app = getApps().length > 0 ? getApp() : initializeApp({ credential, projectId });
    firestoreInstance = firestoreDatabaseId ? getFirestore(app, firestoreDatabaseId) : getFirestore(app);
    console.log(`[Firestore Server] Connected via Admin SDK to project "${projectId}", database "${firestoreDatabaseId || '(default)'}"`);
    return firestoreInstance;
  } catch (err) {
    console.error('[Firestore Server] Error initializing Firestore Admin SDK:', err);
  }
  return null;
}

/**
 * Fetch all documents from a Firestore collection
 */
export async function fetchCollection<T = any>(collectionName: string): Promise<T[]> {
  const db = getFirestoreDb();
  if (!db) return [];
  try {
    const snap = await db.collection(collectionName).get();
    const items: T[] = [];
    snap.forEach(docSnap => {
      items.push({
        id: docSnap.id,
        ...docSnap.data()
      } as unknown as T);
    });
    return items;
  } catch (err) {
    console.error(`[Firestore Server] Error fetching collection "${collectionName}":`, err);
    return [];
  }
}

/**
 * Save or update a document in Firestore
 */
export async function saveDoc(collectionName: string, docId: string, data: Record<string, any>): Promise<boolean> {
  const db = getFirestoreDb();
  if (!db) return false;
  try {
    const cleanData = { ...data };
    delete (cleanData as any).id; // ID is the document key
    cleanData._updated_at_firestore = new Date().toISOString();

    await db.collection(collectionName).doc(docId).set(cleanData, { merge: true });
    return true;
  } catch (err) {
    console.error(`[Firestore Server] Error saving doc "${collectionName}/${docId}":`, err);
    return false;
  }
}

/**
 * Delete a document from Firestore
 */
export async function deleteDocById(collectionName: string, docId: string): Promise<boolean> {
  const db = getFirestoreDb();
  if (!db) return false;
  try {
    await db.collection(collectionName).doc(docId).delete();
    return true;
  } catch (err) {
    console.error(`[Firestore Server] Error deleting doc "${collectionName}/${docId}":`, err);
    return false;
  }
}

/**
 * Batch save multiple documents to Firestore
 */
export async function batchSaveDocs(collectionName: string, items: Array<{ id: string; [key: string]: any }>): Promise<boolean> {
  const db = getFirestoreDb();
  if (!db || !items.length) return false;
  try {
    // Firestore batches are limited to 500 ops
    const chunkSize = 400;
    for (let i = 0; i < items.length; i += chunkSize) {
      const chunk = items.slice(i, i + chunkSize);
      const batch = db.batch();
      for (const item of chunk) {
        const docRef = db.collection(collectionName).doc(item.id);
        const clean = { ...item };
        delete (clean as any).id;
        clean._updated_at_firestore = new Date().toISOString();
        batch.set(docRef, clean, { merge: true });
      }
      await batch.commit();
    }
    return true;
  } catch (err) {
    console.error(`[Firestore Server] Error in batchSaveDocs for "${collectionName}":`, err);
    return false;
  }
}

/**
 * Delete all documents in a Firestore collection
 */
export async function clearCollection(collectionName: string): Promise<number> {
  const db = getFirestoreDb();
  if (!db) return 0;
  try {
    const snap = await db.collection(collectionName).get();
    const docs = snap.docs;
    if (docs.length === 0) return 0;

    const chunkSize = 400;
    for (let i = 0; i < docs.length; i += chunkSize) {
      const chunk = docs.slice(i, i + chunkSize);
      const batch = db.batch();
      for (const d of chunk) {
        batch.delete(d.ref);
      }
      await batch.commit();
    }
    console.log(`[Firestore Server] Cleared ${docs.length} docs from "${collectionName}"`);
    return docs.length;
  } catch (err) {
    console.error(`[Firestore Server] Error clearing collection "${collectionName}":`, err);
    return 0;
  }
}

export function getFirestoreConnectionInfo(): { projectId: string; databaseId: string } {
  const appletConfig = loadAppletConfig();
  return {
    projectId: process.env.FIREBASE_PROJECT_ID || appletConfig.projectId || '',
    databaseId: firestoreDatabaseId || process.env.FIRESTORE_DATABASE_ID || appletConfig.firestoreDatabaseId || ''
  };
}
