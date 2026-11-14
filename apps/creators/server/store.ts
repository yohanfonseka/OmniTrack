import { initializeApp, applicationDefault, getApps, getApp } from 'firebase-admin/app';
import { getFirestore, Firestore } from 'firebase-admin/firestore';
import { config } from './config.js';

export type Filter = [field: string, op: '==' | 'array-contains', value: unknown];

/**
 * The small set of document operations the app needs. Queries are limited to
 * equality / array-contains filters so Firestore never needs composite indexes.
 */
export interface Store {
  get<T>(col: string, id: string): Promise<T | null>;
  getMany<T>(col: string, ids: string[]): Promise<(T | null)[]>;
  set<T extends object>(col: string, id: string, doc: T): Promise<void>;
  patch(col: string, id: string, partial: Record<string, unknown>): Promise<void>;
  delete(col: string, id: string): Promise<void>;
  find<T>(col: string, filters: Filter[], limit?: number): Promise<T[]>;
  all<T>(col: string): Promise<T[]>;
  /** Read-modify-write atomically. Return null from fn to delete the document. */
  mutate<T>(col: string, id: string, fn: (current: T | null) => T | null): Promise<T | null>;
}

function clone<T>(v: T): T {
  return v === undefined ? v : JSON.parse(JSON.stringify(v));
}

function matches(doc: any, filters: Filter[]) {
  return filters.every(([field, op, value]) => {
    const v = doc[field];
    return op === '==' ? v === value : Array.isArray(v) && v.includes(value);
  });
}

/** In-process store for development and tests. Data is lost on restart. */
export class MemoryStore implements Store {
  private cols = new Map<string, Map<string, any>>();
  private col(name: string) {
    let c = this.cols.get(name);
    if (!c) this.cols.set(name, (c = new Map()));
    return c;
  }
  async get<T>(col: string, id: string) {
    const v = this.col(col).get(id);
    return v === undefined ? null : (clone(v) as T);
  }
  async getMany<T>(col: string, ids: string[]) {
    return Promise.all(ids.map((id) => this.get<T>(col, id)));
  }
  async set<T extends object>(col: string, id: string, doc: T) {
    this.col(col).set(id, clone(doc));
  }
  async patch(col: string, id: string, partial: Record<string, unknown>) {
    const cur = this.col(col).get(id);
    if (!cur) throw new Error(`patch: ${col}/${id} does not exist`);
    this.col(col).set(id, clone({ ...cur, ...partial }));
  }
  async delete(col: string, id: string) {
    this.col(col).delete(id);
  }
  async find<T>(col: string, filters: Filter[], limit?: number) {
    const out = [...this.col(col).values()].filter((d) => matches(d, filters)).map((d) => clone(d) as T);
    return limit ? out.slice(0, limit) : out;
  }
  async all<T>(col: string) {
    return [...this.col(col).values()].map((d) => clone(d) as T);
  }
  async mutate<T>(col: string, id: string, fn: (current: T | null) => T | null) {
    const next = fn(await this.get<T>(col, id));
    if (next === null) this.col(col).delete(id);
    else this.col(col).set(id, clone(next));
    return next;
  }
}

export class FirestoreStore implements Store {
  constructor(private db: Firestore) {}

  static connect(): FirestoreStore {
    const app = getApps().length
      ? getApp()
      : initializeApp({ credential: applicationDefault(), projectId: config.firestore.projectId || undefined });
    const db = getFirestore(app, config.firestore.databaseId);
    db.settings({ ignoreUndefinedProperties: true });
    console.log(`[store] Firestore database "${config.firestore.databaseId}"`);
    return new FirestoreStore(db);
  }

  async get<T>(col: string, id: string) {
    const snap = await this.db.collection(col).doc(id).get();
    return snap.exists ? (snap.data() as T) : null;
  }
  async getMany<T>(col: string, ids: string[]) {
    if (!ids.length) return [];
    const snaps = await this.db.getAll(...ids.map((id) => this.db.collection(col).doc(id)));
    return snaps.map((s) => (s.exists ? (s.data() as T) : null));
  }
  async set<T extends object>(col: string, id: string, doc: T) {
    await this.db.collection(col).doc(id).set(doc as any);
  }
  async patch(col: string, id: string, partial: Record<string, unknown>) {
    await this.db.collection(col).doc(id).update(partial);
  }
  async delete(col: string, id: string) {
    await this.db.collection(col).doc(id).delete();
  }
  async find<T>(col: string, filters: Filter[], limit?: number) {
    let q: FirebaseFirestore.Query = this.db.collection(col);
    for (const [f, op, v] of filters) q = q.where(f, op, v);
    if (limit) q = q.limit(limit);
    return (await q.get()).docs.map((d) => d.data() as T);
  }
  async all<T>(col: string) {
    return (await this.db.collection(col).get()).docs.map((d) => d.data() as T);
  }
  async mutate<T>(col: string, id: string, fn: (current: T | null) => T | null) {
    const ref = this.db.collection(col).doc(id);
    return this.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const next = fn(snap.exists ? (snap.data() as T) : null);
      if (next === null) tx.delete(ref);
      else tx.set(ref, next as any);
      return next;
    });
  }
}

export function createStore(): Store {
  if (config.store === 'firestore') return FirestoreStore.connect();
  console.warn('[store] Using in-memory store: data is lost on restart. Set FIRESTORE_DATABASE_ID for Firestore.');
  return new MemoryStore();
}
