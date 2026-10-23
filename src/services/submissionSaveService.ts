import type { Submission, ContestSubmission } from '../types';
import { auth } from '../firebase';
import { StorageService } from './storageService';
import { FirestoreService } from './firestoreService';
import { PendingResultStore, type PendingResult } from './pendingResultStore';
import { fingerprintResult, newSaveOperationId, ResultConflictError, type ResultRecord, type ResultWriteOptions } from './resultPersistence';

export interface SubmissionSaveResult<T extends ResultRecord = Submission> {
  localSaved: boolean; cloudSaved: boolean; submission?: T; pendingSubmission?: T;
  error?: string; conflict?: boolean;
}
const cloudQueues = new Map<string, Promise<SubmissionSaveResult<any>>>();
const studentQueueInputs = new Map<string, string>();
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
  const scope = resultSaveScope();
  const intent = options.intent || (auth.currentUser ? 'teacher' : 'student');
  const operationId = options.operationId || snapshot.saveAttemptId || (intent === 'student' ? `student:${scope}:${kind}:${snapshot.id}` : newSaveOperationId());
  snapshot.saveAttemptId = operationId;
  let pending: PendingResult = { operationId, scope, kind, intent, submission: snapshot, savedAt: new Date().toISOString(), status: 'pending' };
  let localSaved = false;
  const key = scope + ':' + kind + ':' + snapshot.id;
  const previous = cloudQueues.get(key);
  const requestText = JSON.stringify({ ...snapshot, saveAttemptId: undefined });
  if (intent === 'student' && previous && studentQueueInputs.get(key) !== requestText) {
    return { localSaved: false, cloudSaved: false, pendingSubmission: snapshot,
      error: 'Lượt nộp này đang gửi nội dung khác. Giữ nguyên bản gửi đầu tiên, không ghi đè.' };
  }
  const task = intent === 'student' && previous ? previous : (previous || Promise.resolve()).then(async (): Promise<SubmissionSaveResult<T>> => {
    try {
      if (scope !== resultSaveScope()) throw new Error('Tài khoản đã thay đổi. Bản chờ vẫn được giữ; đăng nhập đúng tài khoản để thử lại.');
      if (intent === 'student') {
        pending.requestFingerprint = await fingerprintResult(snapshot);
        let earlier: PendingResult | undefined;
        try {
          const candidate = await PendingResultStore.get(operationId);
          if (candidate?.scope === scope && candidate.kind === kind && candidate.intent === 'student' && candidate.submission.id === snapshot.id) earlier = candidate;
        }
        catch { /* An unavailable local database must not block the Cloud attempt. */ }
        if (earlier) {
          const priorFingerprint = earlier.requestFingerprint || await fingerprintResult(earlier.submission);
          if (priorFingerprint !== pending.requestFingerprint) throw new Error('Lượt nộp này đã có bản gửi khác. Giữ nguyên ID và bản gốc; không ghi đè bằng nội dung mới.');
          localSaved = true;
          if (earlier.status === 'confirmed') return { localSaved, cloudSaved: true, submission: earlier.submission as T };
          pending = earlier;
          snapshot.saveAttemptId = earlier.operationId;
        }
      }
      try { await PendingResultStore.put(pending); localSaved = true; }
      catch (error) { console.warn('[SubmissionSave] Không lưu được bản chờ trên máy:', error); }
      if (scope !== resultSaveScope()) throw new Error('Tài khoản đã thay đổi trong lúc gửi. Giữ bản chờ để đối chiếu.');
      const confirmed = (kind === 'result'
        ? await FirestoreService.saveResult(snapshot as Submission, { intent, operationId: pending.operationId })
        : await FirestoreService.saveContestSubmission(snapshot as ContestSubmission, { intent, operationId: pending.operationId })) as T;
      if (!confirmed?.saveBaseFingerprint) throw new Error('Firebase chưa xác nhận kết quả.');
      try { await PendingResultStore.put({ ...pending, submission: confirmed, status: 'confirmed' }); } catch { /* The original pending copy remains for reconciliation. */ }
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
      const deniedStudentReplay = intent === 'student' && (error as { code?: string })?.code === 'permission-denied';
      return { localSaved, cloudSaved: false, pendingSubmission: snapshot,
        conflict: error instanceof ResultConflictError || (error as { code?: string })?.code === 'RESULT_CONFLICT',
        error: deniedStudentReplay
          ? 'Firebase từ chối lần gửi này. Nếu lần trước mất phản hồi, bài có thể đã tồn tại; chưa đủ căn cứ xác nhận. Giữ nguyên ID và bản gửi, nhờ giáo viên kiểm tra; không tạo lượt mới.'
          : error instanceof Error ? error.message : 'Firebase chưa xác nhận lưu kết quả.' };
    }
  });
  // A UI timeout never releases the queue while an earlier write is still running.
  cloudQueues.set(key, task);
  if (intent === 'student') studentQueueInputs.set(key, requestText);
  void task.finally(() => { if (cloudQueues.get(key) === task) { cloudQueues.delete(key); studentQueueInputs.delete(key); } });
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([task, new Promise<SubmissionSaveResult<T>>(resolve => {
      timer = setTimeout(() => resolve({ localSaved, cloudSaved: false, pendingSubmission: snapshot,
        error: 'Firebase chưa xác nhận sau 15 giây. Bản gửi giữ nguyên ID; bấm gửi lại đúng bản này, không tạo lượt mới.' }), 15000);
    })]);
  } finally { if (timer !== undefined) clearTimeout(timer); }
}
