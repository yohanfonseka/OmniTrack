import fs from 'fs';
import path from 'path';
import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getFirestore,
  doc,
  setDoc,
  deleteDoc,
  collection,
  getDocs,
  writeBatch,
  Firestore
} from 'firebase/firestore';

let firestoreInstance: Firestore | null = null;
let firestoreDatabaseId: string = '';

export function getFirestoreDb(): Firestore | null {
  if (firestoreInstance) return firestoreInstance;
  try {
    const configPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      const app = getApps().length > 0 ? getApp() : initializeApp(config);
      firestoreDatabaseId = config.firestoreDatabaseId || '';
      firestoreInstance = getFirestore(app, firestoreDatabaseId);
      console.log(`[Firestore Server] Connected to Firestore database: ${firestoreDatabaseId}`);
      return firestoreInstance;
    } else {
      console.warn('[Firestore Server] firebase-applet-config.json not found');
    }
  } catch (err) {
    console.error('[Firestore Server] Error initializing Firestore:', err);
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
    const snap = await getDocs(collection(db, collectionName));
    const items: T[] = [];
    snap.forEach(docSnap => {
      const data = docSnap.data();
      items.push({
        id: docSnap.id,
        ...data
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
    
    await setDoc(doc(db, collectionName, docId), cleanData, { merge: true });
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
    await deleteDoc(doc(db, collectionName, docId));
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
      const batch = writeBatch(db);
      for (const item of chunk) {
        const docRef = doc(db, collectionName, item.id);
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
    const snap = await getDocs(collection(db, collectionName));
    const docs = snap.docs;
    if (docs.length === 0) return 0;

    const chunkSize = 400;
    for (let i = 0; i < docs.length; i += chunkSize) {
      const chunk = docs.slice(i, i + chunkSize);
      const batch = writeBatch(db);
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
