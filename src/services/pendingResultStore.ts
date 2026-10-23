import type { ResultRecord, ResultWriteOptions } from './resultPersistence';
export interface PendingResult {
  operationId: string; scope: string; kind: 'result' | 'contest';
  intent: NonNullable<ResultWriteOptions['intent']>;
  submission: ResultRecord; savedAt: string; status: 'pending' | 'confirmed';
  requestFingerprint?: string;
}
async function run<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest, readResult?: () => T): Promise<T> {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open('matsuda_result_saves_v1', 1);
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; reject(new Error('Mở bản dự phòng quá thời gian chờ; vẫn thử lưu Firebase.')); }, 2000);
    req.onupgradeneeded = () => req.result.createObjectStore('operations', { keyPath: 'operationId' });
    req.onsuccess = () => { clearTimeout(timer); if (timedOut) req.result.close(); else resolve(req.result); };
    req.onerror = () => { clearTimeout(timer); reject(req.error || new Error('Không mở được bản lưu chờ.')); };
  });
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction('operations', mode);
      const timer = setTimeout(() => { try { tx.abort(); } catch { /* Transaction may already have completed. */ } reject(new Error('Bản dự phòng chưa hoàn tất; vẫn thử lưu Firebase.')); }, 2000);
      let req: IDBRequest;
      try { req = action(tx.objectStore('operations')); }
      catch (error) { clearTimeout(timer); tx.abort(); reject(error); return; }
      let value: T;
      if (!readResult) req.onsuccess = () => { value = req.result; };
      req.onerror = () => { clearTimeout(timer); reject(req.error); };
      tx.oncomplete = () => { clearTimeout(timer); resolve(readResult ? readResult() : value); };
      tx.onabort = tx.onerror = () => { clearTimeout(timer); reject(tx.error || new Error('Không ghi được bản lưu chờ.')); };
    });
  } finally { db.close(); }
}
export const PendingResultStore = {
  async put(record: PendingResult) { await run('readwrite', store => store.put(record)); },
  async get(operationId: string): Promise<PendingResult | undefined> { return run('readonly', store => store.get(operationId)); },
  async list(scope: string, includeConfirmed = false): Promise<PendingResult[]> {
    // Scan the existing v1 store without accumulating every owner's confirmed image payloads.
    // No database upgrade, rewrite, or removal of historical/pending records.
    const records: PendingResult[] = [];
    return run('readonly', store => {
      const request = store.openCursor();
      request.addEventListener('success', () => {
        const cursor = request.result;
        if (!cursor) return;
        const record = cursor.value as PendingResult;
        if (record.scope === scope && (includeConfirmed || record.status === 'pending')) records.push(record);
        cursor.continue();
      });
      return request;
    }, () => records);
  }
};
