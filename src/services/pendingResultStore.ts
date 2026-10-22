import type { ResultRecord, ResultWriteOptions } from './resultPersistence';
export interface PendingResult {
  operationId: string; scope: string; kind: 'result' | 'contest';
  intent: NonNullable<ResultWriteOptions['intent']>;
  submission: ResultRecord; savedAt: string; status: 'pending' | 'confirmed';
}
async function run<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open('matsuda_result_saves_v1', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('operations', { keyPath: 'operationId' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('Không mở được bản lưu chờ.'));
  });
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction('operations', mode);
      const req = action(tx.objectStore('operations'));
      let value: T;
      req.onsuccess = () => { value = req.result; };
      req.onerror = () => reject(req.error);
      tx.oncomplete = () => resolve(value);
      tx.onabort = tx.onerror = () => reject(tx.error || new Error('Không ghi được bản lưu chờ.'));
    });
  } finally { db.close(); }
}
export const PendingResultStore = {
  async put(record: PendingResult) { await run('readwrite', store => store.put(record)); },
  async list(scope: string, includeConfirmed = false): Promise<PendingResult[]> {
    const records = await run<PendingResult[]>('readonly', store => store.getAll());
    return records.filter(r => r.scope === scope && (includeConfirmed || r.status === 'pending'));
  }
};
