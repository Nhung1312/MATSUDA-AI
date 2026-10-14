import type { Assignment, Submission } from '../types';

export const MAX_DELETE_SUBMISSIONS_AT_ONCE = 25;

// This is a client-side preflight only. Firestore rules must also verify ownership.
export function assertTeacherCanDeleteSubmission(
  teacherUid: string | null | undefined,
  cloudAssignment: Pick<Assignment, 'id'> & { teacherId?: string },
  currentResult: Pick<Submission, 'id' | 'assignmentId' | 'studentName' | 'className' | 'submittedAt'>,
  expected: Pick<Submission, 'id' | 'assignmentId' | 'studentName' | 'className' | 'submittedAt'>
): void {
  if (!teacherUid || teacherUid === 'teacher_preview_user') {
    throw Error('Chỉ tài khoản giáo viên đăng nhập Firebase thực mới được xóa bài nộp.');
  }
  if (!cloudAssignment.teacherId || cloudAssignment.teacherId !== teacherUid) {
    throw Error('Không thể xác minh chủ sở hữu đề trên Firebase. Chưa xóa bài nào.');
  }
  if (!expected.id || !expected.assignmentId || expected.assignmentId !== cloudAssignment.id ||
      currentResult.id !== expected.id || currentResult.assignmentId !== expected.assignmentId ||
      currentResult.studentName !== expected.studentName ||
      currentResult.className !== expected.className ||
      currentResult.submittedAt !== expected.submittedAt) {
    throw Error('Bài nộp đã thay đổi hoặc không thuộc đề hiện tại. Hãy tải lại trước khi xóa.');
  }
}

export function getSelectedSubmissionCopies(
  assignment: Pick<Assignment, 'id'>,
  all: Submission[],
  ids: string[]
): Submission[] {
  if (ids.length === 0) throw Error('Hãy chọn lượt nộp cần xóa.');
  if (ids.length > MAX_DELETE_SUBMISSIONS_AT_ONCE) {
    throw Error('Chỉ xóa tối đa ' + MAX_DELETE_SUBMISSIONS_AT_ONCE + ' lượt mỗi lần.');
  }
  if (new Set(ids).size !== ids.length) throw Error('Có ID lượt nộp bị chọn trùng.');
  const lookup = new Map(all.filter(s => s.assignmentId === assignment.id).map(s => [s.id, s]));
  return ids.map(id => {
    const result = lookup.get(id);
    if (!result || result.assignmentId !== assignment.id) throw Error('Danh sách lượt nộp đã thay đổi, hãy tải lại.');
    return { ...result };
  });
}
