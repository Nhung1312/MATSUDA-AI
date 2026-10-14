import assert from 'node:assert/strict';
import { buildBatchSubmissionExport, MAX_BATCH_EXPORT_SUBMISSIONS } from '../src/services/submissionExportService';
import type { Assignment, Submission } from '../src/types';

assert.ok(String(globalThis.fetch).includes('__examOfflineFetch'), 'Offline guard must prevent AI and network calls.');
(globalThis as any).__examOfflineFetch = async () => { throw Error('Batch export must not call network.'); };

const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4//8/AAX+Av4N70a4AAAAAElFTkSuQmCC';
const assignment: Assignment = {
  id: 'batch-exam', title: 'Đề kiểm tra thử', grade: '7', topic: 'Đại số',
  classId: 'class-a', type: 'text', durationMinutes: 45, deadline: '',
  allowViewResult: true, assignmentCode: 'TEST-BATCH', createdAt: '', isPublished: true,
  questions: [{
    id: 'q-1', order: 1, question: 'Tính 1 + 1', type: 'essay',
    points: 1, correctAnswer: '2', explanation: '1 + 1 = 2',
    rubric: '1 điểm nếu kết quả đúng', options: [],
    imageUrl: 'data:image/png;base64,' + png
  }]
};
const submission = (id: string, name: string): Submission => ({
  id, assignmentId: assignment.id, assignmentTitle: assignment.title, classId: 'class-a', className: '7A1',
  studentName: name, totalScore: 1, maxScore: 1, correctCount: 1, wrongCount: 0,
  unansweredCount: 0, totalQuestions: 1, timeSpentSeconds: 60,
  startedAt: '2026-10-14T00:00:00Z', submittedAt: '2026-10-14T00:01:00Z',
  gradingStatus: 'graded', isShuffled: false, answers: [{
    questionId: 'q-1', selectedAnswer: '', studentSolutionText: '1 + 1 = 2',
    isCorrect: true, pointsEarned: 1, maxPoints: 1, teacherReviewed: true
  }]
});
const submissions = [
  submission('attempt-1', 'Lê Đình Lộc'),
  submission('attempt-2', 'Lê Đình Lộc'),
  submission('attempt-3', '=HYPERLINK("bad")')
];
const original = JSON.stringify({ assignment, submissions });
const progress: number[] = [];
const output = await buildBatchSubmissionExport(assignment, submissions, done => progress.push(done));
assert.equal(JSON.stringify({ assignment, submissions }), original, 'Must not modify saved data.');
assert.equal(output.exportedCount, 3);
assert.equal(output.distinctStudentGroups, 2);
assert.equal(output.missingAttachments, 0);
assert.deepEqual(progress, [1, 2, 3]);

// Parse ZIP local records in memory, including each nested archive.
function readStoredZip(bytes: Uint8Array): Map<string, Uint8Array> {
  const found = new Map<string, Uint8Array>();
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let position = 0;
  while (position + 30 <= bytes.byteLength && view.getUint32(position, true) === 0x04034b50) {
    const size = view.getUint32(position + 18, true);
    const nameSize = view.getUint16(position + 26, true);
    const extras = view.getUint16(position + 28, true);
    const start = position + 30 + nameSize + extras;
    assert.ok(start + size <= bytes.byteLength, 'ZIP entry must fit inside archive.');
    const name = new TextDecoder().decode(bytes.subarray(position + 30, position + 30 + nameSize));
    assert.equal(found.has(name), false, 'ZIP paths must be unique.');
    found.set(name, bytes.slice(start, start + size));
    position = start + size;
  }
  assert.ok(found.size > 0, 'ZIP must include entries.');
  return found;
}
const files = readStoredZip(output.bytes);
const children = [...files.entries()].filter(([name]) => name.startsWith('bai-cham/') && name.endsWith('.zip'));
assert.equal(children.length, 3, 'Preserve every individual attempt, including repeated students.');
for (const [, contents] of children) {
  const nested = readStoredZip(contents);
  assert.ok(nested.has('bai-cham.html'));
  assert.ok(nested.has('du-lieu-cham.json'));
  assert.ok(nested.has('anh-va-de/tep-001.png'), 'Keep original image bytes in each ZIP.');
  const report = new TextDecoder().decode(nested.get('du-lieu-cham.json')!);
  assert.match(report, /studentName/);
}
const csv = new TextDecoder().decode(files.get('BANG_KE_LUOT_NOP.csv')!);
assert.match(csv, /attempt-1/);
assert.match(csv, /attempt-2/);
assert.match(csv, /'=HYPERLINK/, 'Spreadsheet formula injection must be neutralized.');
const manifest = JSON.parse(new TextDecoder().decode(files.get('THONG_TIN_XUAT.json')!));
assert.equal(manifest.distinctNameClassGroups, 2);
assert.deepEqual(manifest.submissions.map((row: any) => row.sameNameClassOccurrence), [1, 2, 1]);

await assert.rejects(buildBatchSubmissionExport(assignment, []), /Chưa có/);
await assert.rejects(buildBatchSubmissionExport(assignment, [submissions[0], submissions[0]]), /trùng ID/);
await assert.rejects(buildBatchSubmissionExport(assignment, [
  { ...submissions[0], assignmentId: 'other' }
]), /không hợp lệ/);
await assert.rejects(buildBatchSubmissionExport(assignment,
  Array.from({ length: MAX_BATCH_EXPORT_SUBMISSIONS + 1 }, (_, i) => submission('limit-' + i, 'HS ' + i))
), /tối đa/);

const missing = await buildBatchSubmissionExport({
  ...assignment, questions: [{ ...assignment.questions[0], imageUrl: 'data:text/html;base64,PGI+aW52YWxpZDwvYj4=' }]
}, [submissions[0]]);
assert.equal(missing.missingAttachments, 1, 'Missing or unsafe attachments must be signaled, not hidden.');

console.log('PASS: batch ZIP contains all independent graded attempts and image assets; manifest and CSV guard repeated attempts and spreadsheet formulas; saved data untouched; no AI/network writes.');
