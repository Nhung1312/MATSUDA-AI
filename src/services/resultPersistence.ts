import type { Submission, ContestSubmission } from '../types';

export type ResultRecord = Submission | ContestSubmission;
export interface ResultWriteOptions { intent?: 'student' | 'teacher'; operationId?: string }
export class ResultConflictError extends Error {
  readonly code = 'RESULT_CONFLICT';
  constructor(message = 'Bài đã thay đổi trên Firebase. Điểm đã lưu được giữ nguyên. Tải bản mới trước khi duyệt tiếp.') { super(message); this.name = 'ResultConflictError'; }
}

export async function fingerprintResult(value: unknown): Promise<string> {
  const canonical = (v: any): any => {
    if (Array.isArray(v)) return v.map(canonical);
    if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v).sort()
      .filter(k => !['saveBaseFingerprint', 'saveAttemptId'].includes(k) && v[k] !== undefined)
      .map(k => [k, canonical(v[k])]));
    return v;
  };
  const bytes = new TextEncoder().encode(JSON.stringify(canonical(value)));
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join('');
}
export async function versionResult<T extends ResultRecord>(value: T): Promise<T> {
  return { ...value, saveBaseFingerprint: await fingerprintResult(value) };
}
export function newSaveOperationId(): string { return crypto.randomUUID(); }

/** Never recalculate grades here. Reject stale snapshots instead of merging answer arrays. */
export async function prepareResultWrite<T extends ResultRecord>(
  latest: T | null, requested: T, options: Required<ResultWriteOptions>
): Promise<{ record: T; changed: boolean }> {
  const copy: T = JSON.parse(JSON.stringify(requested));
  delete copy.saveBaseFingerprint;
  delete copy.saveAttemptId;
  if (!latest) {
    if (requested.saveRevision || requested.saveBaseFingerprint) throw new ResultConflictError('Không tìm thấy bản gốc trên Firebase. Không tạo lại hoặc ghi đè kết quả.');
    return { record: { ...copy, saveRevision: 1, saveOperationId: options.operationId }, changed: true };
  }
  if (latest.id !== requested.id) throw new ResultConflictError();
  if (latest.saveOperationId === options.operationId) return { record: latest, changed: false };
  if ((latest.saveRevision || 0) !== (requested.saveRevision || 0)
    || !requested.saveBaseFingerprint
    || requested.saveBaseFingerprint !== await fingerprintResult(latest)) throw new ResultConflictError();
  if (options.intent === 'student' && latest.answers.some(a => a.teacherReviewed
    || (a.teacherScore !== undefined && !/^\[(Gemini|Matsuda) AI\]/i.test(a.teacherFeedback || '')))) {
    throw new ResultConflictError('Bài đã được giáo viên duyệt. Trang học sinh cũ không được ghi lại điểm hoặc nhận xét.');
  }
  const relation = (v: ResultRecord) => 'assignmentId' in v ? v.assignmentId : v.contestId;
  if (relation(latest) !== relation(requested)) throw new ResultConflictError();
  return { record: { ...latest, ...copy, saveRevision: (latest.saveRevision || 0) + 1, saveOperationId: options.operationId }, changed: true };
}
