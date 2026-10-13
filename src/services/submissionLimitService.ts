import { collection, doc, getDocFromServer, getDocsFromServer, query, where, runTransaction } from 'firebase/firestore';
import { db } from '../firebase';
import type { Assignment, Submission } from '../types';
import { EXAMS_COLLECTION, RESULTS_COLLECTION, normalizeAssignmentDoc, sanitizeForFirestore } from './firestoreService';
import { fingerprintAIInput } from '../utils/aiResultCache';

export interface SubmissionParticipant { studentName: string; classId: string; className: string }
export function getMaxSubmissions(assignment: Pick<Assignment, 'maxSubmissions'>): number {
  const limit = assignment.maxSubmissions;
  return typeof limit === 'number' && Number.isInteger(limit) && limit > 0 ? Math.min(limit, 10) : 0;
}
const normalizedName = (value: string) => String(value || '').normalize('NFC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('vi');
const normalizedClass = (value: string) => normalizedName(value).replace(/^(?:lớp|lop|class)\s*/i, '').replace(/\s+/g, '');
const identity = (assignment: Assignment, participant: SubmissionParticipant) => [assignment.id,
  normalizedName(participant.studentName), assignment.classId && assignment.classId !== 'all'
    ? assignment.classId : normalizedClass(participant.className)];
const sameParticipant = (assignment: Assignment, participant: SubmissionParticipant, submission: Submission) =>
  submission.assignmentId === assignment.id && submission.submissionSource !== 'paper'
  && normalizedName(submission.studentName) === normalizedName(participant.studentName)
  && (Boolean(assignment.classId && assignment.classId !== 'all') || normalizedClass(submission.className) === normalizedClass(participant.className));

export class SubmissionLimitError extends Error {
  constructor(public used: number, public limit: number) {
    super(`Em đã nộp ${used}/${limit} lần cho bài này. Không thể nộp thêm; hãy liên hệ giáo viên nếu cần làm lại.`);
    this.name = 'SubmissionLimitError';
  }
}
interface LimitTransaction {
  getAssignment(): Promise<Assignment | null>;
  getResult(id: string): Promise<Submission | null>;
  writeResult(submission: Submission): void;
}
export interface SubmissionLimitRepository {
  getAssignment(id: string): Promise<Assignment | null>;
  getResults(id: string): Promise<Submission[]>;
  transaction(id: string, work: (transaction: LimitTransaction) => Promise<Submission>): Promise<Submission>;
  getKnownLimit?(id: string): number;
  rememberLimit?(id: string, limit: number): void;
}
const slotId = (key: string, slot: number) => `attempt_${key}_${slot}`;

// This guards the app's submission workflow using entered name/class, not an
// authenticated student identity or a replacement for Firestore security rules.
export function createSubmissionLimitService(repository: SubmissionLimitRepository) {
  const check = async (assignment: Assignment, participant: SubmissionParticipant) => {
    let current = assignment;
    const knownLimit = getMaxSubmissions(assignment) || repository.getKnownLimit?.(assignment.id) || 0;
    try {
      const cloud = await repository.getAssignment(assignment.id);
      if (cloud) {
        current = cloud;
        repository.rememberLimit?.(assignment.id, getMaxSubmissions(cloud));
      } else if (knownLimit) throw Error('Chưa tìm thấy bài giao trên cloud. Hãy thử lại khi bài đã được đồng bộ.');
    } catch (error) {
      // Preserve existing offline/unlimited assignments. Known limited exams must be checked online.
      if (knownLimit) throw error;
    }
    const limit = getMaxSubmissions(current);
    if (!limit) return { assignment: current, limit: 0, used: 0, remaining: null, legacyCount: 0, participantKey: '' };
    if (!normalizedName(participant.studentName)) throw Error('Cần nhập họ tên trước khi kiểm tra lượt nộp.');
    if (current.classId === 'all' && !normalizedClass(participant.className)) throw Error('Cần nhập lớp trước khi kiểm tra lượt nộp.');
    const key = await fingerprintAIInput(identity(current, participant));
    if (!key) throw Error('Chưa xác định được lượt nộp an toàn. Hãy mở bài bằng trình duyệt và kết nối HTTPS.');
    const previous = (await repository.getResults(current.id)).filter(s => sameParticipant(current, participant, s));
    const currentSlots = new Set(Array.from({ length: limit }, (_, index) => slotId(key, index + 1)));
    return { assignment: current, limit, used: previous.length, remaining: Math.max(0, limit - previous.length),
      legacyCount: previous.filter(s => s.submissionParticipantKey !== key || !currentSlots.has(s.id)).length, participantKey: key };
  };

  const commit = async (assignment: Assignment, participant: SubmissionParticipant, submission: Submission) => {
    if (!sameParticipant(assignment, participant, submission)) throw Error('Thông tin bài nộp không khớp với học sinh và bài giao đang chọn.');
    const state = await check(assignment, participant);
    if (state.limit && state.remaining === 0) throw new SubmissionLimitError(state.used, state.limit);
    // Read all slots before writing. A concurrent device causes Firestore to retry
    // against the occupied slot, so it can never replace an accepted attempt.
    return repository.transaction(assignment.id, async transaction => {
      const current = await transaction.getAssignment();
      if (!current) throw Error('Chưa tìm thấy bài giao trên cloud. Bài làm vẫn được giữ để nộp lại.');
      const limit = getMaxSubmissions(current);
      if (!limit) { transaction.writeResult(submission); return submission; }
      if (limit !== state.limit) throw Error('Giới hạn nộp bài vừa thay đổi. Bài làm vẫn được giữ; hãy bấm Nộp bài để kiểm tra lại.');
      const key = await fingerprintAIInput(identity(current, participant));
      if (!key || key !== state.participantKey) throw Error('Thiết lập bài giao vừa thay đổi. Hãy kiểm tra lại mã bài trước khi nộp.');
      const slots = await Promise.all(Array.from({ length: limit }, (_, index) => transaction.getResult(slotId(key, index + 1))));
      const used = state.legacyCount + slots.filter(Boolean).length;
      const free = slots.findIndex(slot => !slot);
      if (used >= limit || free < 0) throw new SubmissionLimitError(used, limit);
      const accepted: Submission = { ...submission, id: slotId(key, free + 1), submissionSource: 'online', submissionParticipantKey: key, attemptNumber: used + 1 };
      transaction.writeResult(accepted);
      return accepted;
    });
  };
  return { check, commit };
}

const repository: SubmissionLimitRepository = {
  getKnownLimit(id) {
    try { return getMaxSubmissions({ maxSubmissions: Number(localStorage.getItem(`toan_thcs_submission_limit_${id}`)) }); }
    catch { return 0; }
  },
  rememberLimit(id, limit) {
    // Remember an observed limit even when the later results query fails. Reloading
    // an older unlimited exam cache while offline must not bypass that known limit.
    try { localStorage.setItem(`toan_thcs_submission_limit_${id}`, String(limit)); }
    catch { /* The current online check still enforces the teacher's limit. */ }
  },
  async getAssignment(id) {
    const snapshot = await getDocFromServer(doc(db, EXAMS_COLLECTION, id));
    return snapshot.exists() ? normalizeAssignmentDoc(snapshot.data(), snapshot.id) : null;
  },
  async getResults(id) {
    const snapshot = await getDocsFromServer(query(collection(db, RESULTS_COLLECTION), where('assignmentId', '==', id)));
    return snapshot.docs.map(item => ({ ...item.data(), id: item.id } as Submission));
  },
  transaction(id, work) {
    return runTransaction(db, async transaction => work({
      async getAssignment() {
        const snapshot = await transaction.get(doc(db, EXAMS_COLLECTION, id));
        return snapshot.exists() ? normalizeAssignmentDoc(snapshot.data(), snapshot.id) : null;
      },
      async getResult(resultId) {
        const snapshot = await transaction.get(doc(db, RESULTS_COLLECTION, resultId));
        return snapshot.exists() ? { ...snapshot.data(), id: snapshot.id } as Submission : null;
      },
      writeResult(submission) {
        transaction.set(doc(db, RESULTS_COLLECTION, submission.id), sanitizeForFirestore(submission));
      }
    }));
  }
};
export const submissionLimitService = createSubmissionLimitService(repository);
