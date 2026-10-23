import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import { auth } from '../src/firebase';
import { StorageService } from '../src/services/storageService';
import { CloudSessionCache } from '../src/services/cloudSessionCache';
import { FirestoreService } from '../src/services/firestoreService';
import { PendingResultStore, type PendingResult } from '../src/services/pendingResultStore';
import { saveSubmissionConfirmed } from '../src/services/submissionSaveService';
import { versionResult } from '../src/services/resultPersistence';
import { measureDataGroups } from '../src/services/teacherBackupService';
import type { Assignment, Submission } from '../src/types';

assert.ok(String(globalThis.fetch).includes('__examOfflineFetch'), 'Offline network guard required');
const image = 'data:image/png;base64,' + 'A'.repeat(200_000);
const mcq = (id: string): Submission => ({ id, assignmentId: 'synthetic-exam-0', assignmentTitle: 'Synthetic exam',
  classId: 'c', className: 'C', studentName: 'Synthetic student', totalScore: 9.5, maxScore: 10,
  correctCount: 1, wrongCount: 0, unansweredCount: 0, totalQuestions: 1, timeSpentSeconds: 10,
  startedAt: '2026-01-01', submittedAt: '2026-01-01',
  answers: [{ questionId: 'q', selectedAnswer: 'A', isCorrect: true, pointsEarned: 9.5, maxPoints: 10 }] });
const essay = (id: string): Submission => ({ ...mcq(id), hasEssayQuestions: true,
  answers: [{ questionId: 'q', selectedAnswer: '', studentSolutionText: 'x+1=2; x=1', essayImages: [image],
    stepAnalysis: [{ stepIndex: 1, studentLatex: 'x=1', status: 'correct', confidence: .9, comment: 'Synthetic analysis' }],
    teacherReviewed: true, teacherScore: 1, teacherFeedback: 'Synthetic approved comment', isCorrect: true, pointsEarned: 1, maxPoints: 1 }] });
const exams = Array.from({ length: 119 }, (_, i) => ({ id: 'synthetic-exam-' + i, assignmentCode: 'SYN-' + i,
  title: 'Synthetic exam ' + i, questions: [{ id: 'q', question: 'Original synthetic question', image, correctAnswer: 'A', points: 10 }]
})) as unknown as Assignment[];
const history = [...Array.from({ length: 100 }, (_, i) => mcq('old-mcq-' + i)), essay('old-essay')];
const disk = new Map<string, string>([
  ['toan_thcs_classes_v4', JSON.stringify([{ id: 'c', name: 'Synthetic class', students: [] }])],
  ['toan_thcs_assignments_v4', JSON.stringify(exams)],
  ['toan_thcs_submissions_v4', JSON.stringify(history)],
  ['toan_thcs_exam_draft_keep', JSON.stringify({ work: 'UNSYNCED SYNTHETIC WORK', image })],
  ['other-cache', 'OTHER CACHE MUST STAY']
]);
const originalDisk = [...disk];
let writeAttempts = 0;
Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
  get length() { return disk.size; }, key: (i: number) => [...disk.keys()][i] ?? null,
  getItem: (k: string) => disk.get(k) ?? null,
  setItem: () => { writeAttempts++; throw new DOMException('Synthetic quota full', 'QuotaExceededError'); },
  removeItem: () => { throw Error('Never remove legacy data'); }, clear: () => { throw Error('Never clear legacy data'); }
} });
Object.defineProperty(globalThis, 'window', { configurable: true, value: new EventTarget() });
await auth.authStateReady();
Object.defineProperty(auth, 'currentUser', { configurable: true, writable: true, value: null });

// Missing initialization flag while old data fills the quota must not break StudentJoinPage's getters.
assert.doesNotThrow(() => StorageService.initDemoData());
assert.equal(StorageService.getClasses()[0].id, 'c');
assert.deepEqual(StorageService.getAssignments(), exams.map(a => ({ ...a, grade: '6', topic: 'Toán học', isPublished: true })));
assert.deepEqual(StorageService.getSubmissions(), history);
assert.equal(writeAttempts, 1, 'Do not retry failed demo writes on each getter');
console.log('PASS full localStorage + missing init flag: student getters still work; no repeated demo writes');

const teacher = { uid: 'synthetic-teacher', email: 'synthetic@example.test' };
(auth as any).currentUser = teacher;
CloudSessionCache.begin(teacher.uid);
const writesBeforeTeacherCache = writeAttempts;
StorageService.setClasses([{ id: 'c', name: 'Synthetic class', students: [] } as any]);
StorageService.setAssignments(exams);
StorageService.setSubmissions(history);
assert.equal(StorageService.getAssignments().length, 119);
assert.equal(StorageService.getSubmissions().length, 101);
assert.deepEqual(StorageService.getSubmissions().at(-1), history.at(-1));
assert.equal(writeAttempts, writesBeforeTeacherCache, 'Cloud snapshots must never be serialized into legacy localStorage');
console.log('PASS authenticated Cloud cache: 119 image-bearing exams and 101 mixed history records, zero disk writes, all old fields retained');

(auth as any).currentUser = null;
CloudSessionCache.begin(null);
let cloudWrites = 0;
FirestoreService.saveResult = async value => { cloudWrites++; return versionResult({ ...value, saveRevision: 1 }); };
const studentWork = { ...essay('confirmed-student'), answers: essay('unused').answers.map(a => {
  const { teacherScore, teacherReviewed, teacherFeedback, ...answer } = a;
  return { ...answer, needsTeacherReview: true };
}) };
const beforeStudentSave = writeAttempts;
const result = await saveSubmissionConfirmed(studentWork, { intent: 'student' });
assert.equal(result.cloudSaved, true); assert.equal(result.localSaved, true);
assert.equal(writeAttempts, beforeStudentSave, 'Confirmed student work must not copy the historical result array into localStorage');
assert.deepEqual(StorageService.getSubmissions().find(s => s.id === studentWork.id), result.submission);
assert.deepEqual(StorageService.getSubmissions().find(s => s.id === 'old-essay'), history.at(-1));
await saveSubmissionConfirmed(studentWork, { intent: 'student' });
assert.equal(cloudWrites, 1, 'Confirmed receipt replay must not create another result');
console.log('PASS student acknowledgement: no full-array disk copy, raw image/analysis retained in keyed receipt, retry no duplicate');

// Exercise the existing v1 database. No migration, clear, delete, or production access.
for (let i = 0; i < 20; i++) await PendingResultStore.put({ operationId: 'archive-' + i,
  scope: 'other-owner', kind: 'result', intent: 'teacher', submission: essay('archive-' + i), savedAt: '2026-01-01', status: 'confirmed' });
const pending: PendingResult = { operationId: 'keep-pending', scope: 'student', kind: 'result', intent: 'student',
  submission: mcq('pending-work'), savedAt: '2026-01-01', status: 'pending' };
await PendingResultStore.put(pending);
const getAll = IDBObjectStore.prototype.getAll;
IDBObjectStore.prototype.getAll = () => { throw Error('Recovery must not getAll historical images/confirmed receipts'); };
try {
  assert.deepEqual(await PendingResultStore.list('student'), [pending]);
  assert.equal((await PendingResultStore.list('other-owner', true)).length, 20, 'Explicit backup can still include confirmed records');
  assert.equal((await PendingResultStore.get('archive-19'))!.submission.id, 'archive-19', 'No historical receipt removed');
} finally { IDBObjectStore.prototype.getAll = getAll; }
console.log('PASS pending recovery scans without getAll; unrelated confirmed images are not accumulated; explicit backup retains every record');

assert.deepEqual([...disk], originalDisk, 'All original cache strings and unsynced drafts must remain byte-for-byte unchanged');
console.log('Synthetic group sizes (UTF-8 bytes; NOT measurements of production): ' + JSON.stringify(measureDataGroups(exams, history)));
console.log('CACHE PRESSURE PASS — fake storage/data only, production network blocked, no reset/deletion');
