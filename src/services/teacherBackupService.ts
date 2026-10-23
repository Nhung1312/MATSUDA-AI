import { auth } from '../firebase';
import { FirestoreService } from './firestoreService';
import { PendingResultStore } from './pendingResultStore';
import { StorageService } from './storageService';
import { fingerprintResult } from './resultPersistence';
import type { Assignment, Submission } from '../types';

export function assertSameIds(label: string, expected: { id: string }[], actual: { id: string }[]): void {
  const ids = (list: { id: string }[]) => list.map(x => x.id).sort();
  if (new Set(actual.map(x => x.id)).size !== actual.length
    || JSON.stringify(ids(expected)) !== JSON.stringify(ids(actual))) {
    throw new Error(label + ': ID hoặc số lượng không khớp màn hình. Chưa tạo bản sao lưu đầy đủ; tải lại Cloud rồi đối chiếu.');
  }
}
const bytes = (v: unknown) => new TextEncoder().encode(JSON.stringify(v)).length;
export function measureDataGroups(assignments: Assignment[], submissions: Submission[]) {
  const complex = submissions.filter(s => s.submissionSource === 'paper' || s.hasEssayQuestions
    || s.essayImages?.length || s.answers.some(a => a.essayImages?.length || a.studentSolutionText || a.stepAnalysis));
  const complexIds = new Set(complex.map(s => s.id));
  const mcq = submissions.filter(s => !complexIds.has(s.id));
  return {
    assignments: { count: assignments.length, utf8Bytes: bytes(assignments) },
    mcqWithoutEssayEvidence: { count: mcq.length, utf8Bytes: bytes(mcq) },
    essayImageOrAnalysis: { count: complex.length, utf8Bytes: bytes(complex) }
  };
}
export function inspectLegacyStorage(storage: Storage) {
  const sizes: { key: string; utf16EstimateBytes: number }[] = [];
  const preserved: Record<string, string> = {};
  const exact = new Set(['toan_thcs_classes_v4', 'toan_thcs_assignments_v4', 'toan_thcs_submissions_v4',
    'toan_thcs_contests_v4', 'toan_thcs_contest_submissions_v4', 'toan_thcs_deleted_assignment_keys_v4',
    'toan_thcs_has_cleared_demo_v4', 'toan_thcs_initialized_v4']);
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (!key || /api.?key|token|password|auth|secret/i.test(key)) continue;
    const value = storage.getItem(key);
    if (value === null) continue;
    sizes.push({ key, utf16EstimateBytes: 2 * (key.length + value.length) });
    if (exact.has(key) || /^(toan_thcs_.*draft|contest_draft|exam_draft)/.test(key)) preserved[key] = value;
  }
  return { sizes, preserved };
}

/** Export fails closed. Never substitute demo records or overwrite legacy browser data. */
export async function buildTeacherBackup() {
  const user = auth.currentUser;
  if (!user) throw new Error('Đăng nhập Google giáo viên để sao lưu dữ liệu thật. Không dùng dữ liệu mẫu thay thế.');
  const expectedClasses = StorageService.getClasses();
  const expectedAssignments = StorageService.getAssignments();
  const expectedSubmissions = StorageService.getSubmissions();
  const source = await FirestoreService.readTeacherBackupSource(user.uid, user.email);
  assertSameIds('Lớp', expectedClasses, source.classes);
  assertSameIds('Đề', expectedAssignments, source.assignments);
  assertSameIds('Lượt nộp', expectedSubmissions, source.submissions);
  const legacy = inspectLegacyStorage(localStorage);
  const pendingSaves = await PendingResultStore.list(user.uid, true);
  const sha256 = await fingerprintResult(source);
  // Detect edits or incomplete query snapshots during the export.
  const verify = await FirestoreService.readTeacherBackupSource(user.uid, user.email);
  assertSameIds('Đề đọc lại', source.assignments, verify.assignments);
  assertSameIds('Lượt nộp đọc lại', source.submissions, verify.submissions);
  if (sha256 !== await fingerprintResult(verify)) throw new Error('Dữ liệu thay đổi trong lúc sao lưu. Thử xuất lại; chưa xác nhận bản đầy đủ.');
  if (auth.currentUser?.uid !== user.uid) throw new Error('Tài khoản đã thay đổi. Chưa tạo bản sao lưu.');
  const externalAttachments = new Set<string>();
  const scan = (value: unknown) => {
    if (typeof value === 'string' && /^(https?:|blob:)/.test(value)) externalAttachments.add(value);
    else if (Array.isArray(value)) value.forEach(scan);
    else if (value && typeof value === 'object') Object.values(value).forEach(scan);
  };
  scan(source);
  return {
    ...source, exportedAt: new Date().toISOString(), schemaVersion: 2,
    manifest: { ownerUid: user.uid, sha256, recordsVerified: true, attachmentsComplete: externalAttachments.size === 0,
      assignmentIds: source.assignments.map(a => a.id).sort(), submissionIds: source.submissions.map(s => s.id).sort(),
      externalAttachments: [...externalAttachments],
      note: 'Đã đối chiếu ID và nội dung hai lượt đọc máy chủ. URL ngoài chưa được đóng gói; bản dữ liệu trình duyệt giữ riêng, chưa tự hòa trộn hoặc phục hồi.' },
    measurements: { ...measureDataGroups(source.assignments, source.submissions), otherBrowserCaches: legacy.sizes },
    legacyBrowserData: legacy.preserved, pendingSaves
  };
}
