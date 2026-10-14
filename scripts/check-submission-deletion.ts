import assert from 'node:assert/strict';
import { assertTeacherCanDeleteSubmission, getSelectedSubmissionCopies, MAX_DELETE_SUBMISSIONS_AT_ONCE } from '../src/services/submissionDeletionService';
import type { Assignment, Submission } from '../src/types';

const assignment = { id: 'exam-owned', title: 'Toán 7', teacherId: 'teacher-real' } as Assignment & { teacherId: string };
const result = (id: string, studentName = 'Học sinh A'): Submission => ({
  id, assignmentId: assignment.id, assignmentTitle: assignment.title,
  studentName, classId: '7a', className: '7A',
  submittedAt: '2026-10-14T10:00:00Z', startedAt: '2026-10-14T09:00:00Z',
  totalScore: 7, maxScore: 10, correctCount: 3, wrongCount: 1, unansweredCount: 0,
  totalQuestions: 4, timeSpentSeconds: 1800, answers: [], gradingStatus: 'graded'
});
const attempts = [result('one'), result('two'), result('three')];
const serialized = JSON.stringify({ assignment, attempts });
const picked = getSelectedSubmissionCopies(assignment, attempts, ['two', 'three']);
assert.deepEqual(picked.map(s => s.id), ['two', 'three']);
assert.equal(JSON.stringify({ assignment, attempts }), serialized, 'Selecting must not mutate grades or attempts.');
assert.equal(picked[0] === attempts[1], false, 'Selection should snapshot objects.');
assert.doesNotThrow(() => assertTeacherCanDeleteSubmission('teacher-real', assignment, attempts[0], picked[0] && attempts[0]));
assert.throws(() => assertTeacherCanDeleteSubmission(null, assignment, attempts[0], attempts[0]), /Firebase/);
assert.throws(() => assertTeacherCanDeleteSubmission('teacher_preview_user', assignment, attempts[0], attempts[0]), /Firebase/);
assert.throws(() => assertTeacherCanDeleteSubmission('teacher-other', assignment, attempts[0], attempts[0]), /sở hữu/);
assert.throws(() => assertTeacherCanDeleteSubmission('teacher-real',
  { ...assignment, teacherId: undefined }, attempts[0], attempts[0]), /sở hữu/);
assert.throws(() => assertTeacherCanDeleteSubmission('teacher-real', assignment,
  { ...attempts[0], assignmentId: 'another-exam' }, attempts[0]), /thay đổi/);
assert.throws(() => assertTeacherCanDeleteSubmission('teacher-real', assignment,
  { ...attempts[0], submittedAt: 'changed' }, attempts[0]), /thay đổi/);
assert.throws(() => getSelectedSubmissionCopies(assignment, attempts, []), /Hãy chọn/);
assert.throws(() => getSelectedSubmissionCopies(assignment, attempts, ['one', 'one']), /trùng/);
assert.throws(() => getSelectedSubmissionCopies(assignment, attempts, ['unknown']), /thay đổi/);
assert.throws(() => getSelectedSubmissionCopies(assignment, attempts,
  Array.from({ length: MAX_DELETE_SUBMISSIONS_AT_ONCE + 1 }, (_, n) => 'id-' + n)), /tối đa/);
assert.equal(MAX_DELETE_SUBMISSIONS_AT_ONCE, 25);
console.log('PASS: teacher ownership, cloud record identity, missing records, preview account, duplicate selection, and delete batch limits.');
