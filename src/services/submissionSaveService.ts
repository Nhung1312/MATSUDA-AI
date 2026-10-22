import type { Submission, ContestSubmission } from '../types';
import { auth } from '../firebase';
import { StorageService } from './storageService';
import { FirestoreService } from './firestoreService';
import { PendingResultStore, type PendingResult } from './pendingResultStore';
import { newSaveOperationId, ResultConflictError, type ResultRecord, type ResultWriteOptions } from './resultPersistence';

export interface SubmissionSaveResult<T extends ResultRecord = Submission> {
  localSaved: boolean; cloudSaved: boolean; submission?: T; pendingSubmission?: T;
  error?: string; conflict?: boolean;
}
const cloudQueues = new Map<string, Promise<SubmissionSaveResult<any>>>();
export const resultSaveScope = () => auth.currentUser?.uid || 'student';

export async function listPendingResultSaves(): Promise<PendingResult[]> {
  return PendingResultStore.list(resultSaveScope());
}
export function saveSubmissionConfirmed(submission: Submission, options: ResultWriteOptions = {}): Promise<SubmissionSaveResult> {
  return saveConfirmed('result', submission, options);
}
export function saveContestSubmissionConfirmed(submission: ContestSubmission, options: ResultWriteOptions = {}): Promise<SubmissionSaveResult<ContestSubmission>> {
  return saveConfirmed('contest', submission, options);
}

/** Keep one immutable attempt, independently of the large legacy localStorage cache. */
async function saveConfirmed<T extends ResultRecord>(kind: PendingResult['kind'], submission: T, options: ResultWriteOptions): Promise<SubmissionSaveResult<T>> {
  const snapshot: T = JSON.parse(JSON.stringify(submission));
  const operationId = options.operationId || snapshot.saveAttemptId || newSaveOperationId();
  snapshot.saveAttemptId = operationId;
  const scope = resultSaveScope();
  const intent = options.intent || (auth.currentUser ? 'teacher' : 'student');
  const pending: PendingResult = { operationId, scope, kind, intent, submission: snapshot, savedAt: new Date().toISOString(), status: 'pending' };
  let localSaved = false;
  try { await PendingResultStore.put(pending); localSaved = true; }
  catch (error) { console.warn('[SubmissionSave] Không lưu được bản chờ trên máy:', error); }

  const key = kind + ':' + snapshot.id;
  const previous = cloudQueues.get(key);
  const task = (previous || Promise.resolve()).then(async (): Promise<SubmissionSaveResult<T>> => {
    try {
      if (scope !== resultSaveScope()) throw new Error('Tài khoản đã thay đổi. Bản chờ vẫn được giữ; đăng nhập đúng tài khoản để thử lại.');
      const confirmed = (kind === 'result'
        ? await FirestoreService.saveResult(snapshot as Submission, { intent, operationId })
        : await FirestoreService.saveContestSubmission(snapshot as ContestSubmission, { intent, operationId })) as T;
      if (!confirmed?.saveBaseFingerprint) throw new Error('Firebase chưa xác nhận kết quả.');
      try { await PendingResultStore.put({ ...pending, status: 'confirmed' }); } catch { /* Keep the pending copy; retries are idempotent. */ }
      if (scope === resultSaveScope()) {
        try {
          if (kind === 'result') StorageService.saveSubmission(confirmed as Submission, { syncCloud: false });
          else StorageService.saveContestSubmission(confirmed as ContestSubmission, { syncCloud: false });
        } catch (error) { console.warn('[SubmissionSave] Cache đầy; kết quả đã xác nhận trên Firebase:', error); }
        if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('submissions-confirmed', {
          detail: { scope, kind, submission: confirmed }
        }));
      }
      return { localSaved, cloudSaved: true, submission: confirmed };
    } catch (error) {
      return { localSaved, cloudSaved: false, pendingSubmission: snapshot,
        conflict: error instanceof ResultConflictError || (error as { code?: string })?.code === 'RESULT_CONFLICT',
        error: error instanceof Error ? error.message : 'Firebase chưa xác nhận lưu kết quả.' };
    }
  });
  // A UI timeout never releases the queue while an earlier write is still running.
  cloudQueues.set(key, task);
  void task.finally(() => { if (cloudQueues.get(key) === task) cloudQueues.delete(key); });
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([task, new Promise<SubmissionSaveResult<T>>(resolve => {
      timer = setTimeout(() => resolve({ localSaved, cloudSaved: false, pendingSubmission: snapshot,
        error: 'Firebase chưa xác nhận sau 15 giây. Bản gửi giữ nguyên ID; có thể bấm Lưu lại, không cần chấm AI lại.' }), 15000);
    })]);
  } finally { if (timer !== undefined) clearTimeout(timer); }
}
