import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import { webcrypto } from 'node:crypto';
import { createSubmissionLimitService, getMaxSubmissions, SubmissionLimitError, type SubmissionLimitRepository } from '../src/services/submissionLimitService';
import { GradingService } from '../src/services/gradingService';
import { isEssayQuestion, getEssayGradingReference, normalizeQuestion, calculateQuestionsTotalPoints, toPointUnits } from '../src/utils/questionUtils';
import { ExamGeneratorService } from '../src/services/examGeneratorService';
import { normalizeAssignmentDoc, sanitizeForFirestore } from '../src/services/firestoreService';
import type { Assignment, Submission } from '../src/types';

assert.ok(String(globalThis.fetch).includes('__examOfflineFetch'), 'Mandatory offline guard is missing');
if (!globalThis.crypto?.subtle) Object.defineProperty(globalThis, 'crypto', { value: webcrypto });
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const exam = (limit?: number, classId = 'all'): Assignment => ({
  id: 'limit_exam', title: 'Bài kiểm tra', assignmentCode: 'LIMIT-01', grade: '7', topic: 'Phương trình',
  classId, className: '7A1', durationMinutes: 45, deadline: '', allowViewResult: true,
  createdAt: '2026-10-01T00:00:00Z', isPublished: true, maxSubmissions: limit, totalPoints: 2,
  questions: [
    { id: 'mc', order: 1, type: 'multiple_choice', question: '1+1=?', options: [{ id: 'A', text: '2' }, { id: 'B', text: '3' }], correctAnswer: 'A', points: 1 },
    { id: 'essay', order: 2, type: 'essay', question: 'Giải x+2=5.', options: [], correctAnswer: 'x=3', explanation: 'x=5-2=3', rubric: 'Đúng cách giải: 1 điểm', points: 1 }
  ]
});
const participant = { studentName: 'Nguyễn Văn An', classId: 'other', className: '7A1' };
const result = (id: string, extra: Partial<Submission> = {}): Submission => ({
  id, assignmentId: 'limit_exam', studentName: participant.studentName, classId: 'other', className: '7A1',
  totalScore: .8, maxScore: 2, answers: [], ...extra
} as Submission);

// Model Firestore's read-before-write and optimistic retry contract without network access.
// Both devices first read empty slots; only one can commit that version of a slot.
function fixture(initial: Assignment | null, previous: Submission[] = []) {
  let source = clone(initial);
  let sourceVersion = 0;
  const records = new Map(previous.map(item => [item.id, clone(item)]));
  const versions = new Map<string, number>();
  const knownLimits = new Map<string, number>();
  const state = { failAssignment: false, failResults: false, failTransaction: false, retries: 0, writes: 0, queries: 0 };
  const repository: SubmissionLimitRepository = {
    getKnownLimit: id => knownLimits.get(id) ?? 0,
    rememberLimit: (id, limit) => { knownLimits.set(id, limit); },
    async getAssignment() { if (state.failAssignment) throw Error('offline'); return clone(source); },
    async getResults(id) {
      state.queries++;
      if (state.failResults) throw Error('unavailable results');
      return [...records.values()].filter(item => item.assignmentId === id).map(clone);
    },
    async transaction(_id, work) {
      if (state.failTransaction) throw Error('transaction not saved');
      for (let retry = 0; retry < 10; retry++) {
        const snapshot = new Map([...records].map(([id, value]) => [id, clone(value)]));
        const originalVersions = new Map(versions);
        const originalSource = clone(source);
        const originalSourceVersion = sourceVersion;
        const readIds = new Set<string>();
        const writes: Submission[] = [];
        const accepted = await work({
          async getAssignment() { assert.equal(writes.length, 0, 'Reads must precede writes'); return originalSource; },
          async getResult(id) { assert.equal(writes.length, 0, 'Reads must precede writes'); readIds.add(id); return snapshot.get(id) ?? null; },
          writeResult(submission) { writes.push(clone(submission)); }
        });
        if (sourceVersion !== originalSourceVersion || [...readIds].some(id => versions.get(id) !== originalVersions.get(id))) {
          state.retries++; continue;
        }
        for (const item of writes) { records.set(item.id, item); versions.set(item.id, (versions.get(item.id) ?? 0) + 1); state.writes++; }
        return accepted;
      }
      throw Error('Too many conflicts');
    }
  };
  return { service: createSubmissionLimitService(repository), reload: () => createSubmissionLimitService(repository), records, state, setExam(next: Assignment | null) { source = clone(next); sourceVersion++; } };
}

const one = fixture(exam(1));
const original = result('random-before-save');
const accepted = await one.service.commit(exam(1), participant, original);
assert.match(accepted.id, /^attempt_[a-f0-9]{64}_1$/);
assert.equal(accepted.attemptNumber, 1); assert.equal(accepted.submissionSource, 'online');
assert.equal(original.id, 'random-before-save', 'Input result must not be mutated');
await assert.rejects(one.service.commit(exam(1), participant, result('second', { totalScore: 0 })), SubmissionLimitError);
assert.equal(one.records.size, 1); assert.equal(one.records.get(accepted.id)?.totalScore, .8);
assert.equal((await one.service.check(exam(1), participant)).remaining, 0);
console.log('PASS: one attempt survives reload and rejected resubmission never overwrites its score');

const concurrent = fixture(exam(1));
const simultaneous = await Promise.allSettled([
  concurrent.service.commit(exam(1), participant, result('device-a')),
  concurrent.service.commit(exam(1), participant, result('device-b', { totalScore: .2 }))
]);
assert.equal(simultaneous.filter(item => item.status === 'fulfilled').length, 1);
assert.equal(simultaneous.filter(item => item.status === 'rejected' && item.reason instanceof SubmissionLimitError).length, 1);
assert.equal(concurrent.records.size, 1); assert.equal(concurrent.state.writes, 1); assert.ok(concurrent.state.retries > 0);
console.log('PASS: simultaneous tabs/devices collide, retry and accept exactly one result');

const old = result('old-random-id', { answers: [{ questionId: 'essay', teacherScore: .8, teacherReviewed: true, teacherFeedback: 'Đã duyệt' } as any] });
const paper = result('paper', { submissionSource: 'paper' });
const legacy = fixture(exam(2), [old, paper]);
assert.equal((await legacy.service.check(exam(2), participant)).used, 1);
const second = await legacy.service.commit(exam(2), participant, result('online-new'));
assert.equal(second.attemptNumber, 2); assert.equal(legacy.records.size, 3);
assert.deepEqual(legacy.records.get(old.id), old, 'Teacher score and existing images/answers must be untouched');
await assert.rejects(legacy.service.commit(exam(2), participant, result('online-third')), SubmissionLimitError);
legacy.setExam(exam(1));
await assert.rejects(legacy.service.commit(exam(2), participant, result('lowered-limit')), SubmissionLimitError);
assert.equal(legacy.records.size, 3, 'Lowering a limit never removes old records');
legacy.setExam(exam(3));
assert.equal((await legacy.service.commit(exam(1), participant, result('teacher-extra-try'))).attemptNumber, 3);
console.log('PASS: historical online results count, paper uploads do not; increasing/lowering limits preserves old grades');

const outsideSlots = fixture(exam(2), [result(`attempt_${accepted.submissionParticipantKey}_3`, { submissionParticipantKey: accepted.submissionParticipantKey })]);
assert.equal((await outsideSlots.service.commit(exam(2), participant, result('after-limit-lowered'))).attemptNumber, 2);
await assert.rejects(outsideSlots.service.commit(exam(2), participant, result('over-lowered-limit')), SubmissionLimitError);
assert.equal(outsideSlots.records.size, 2, 'A historical slot beyond a lowered limit must still count');

const names = fixture(exam(1), [old]);
assert.equal((await names.service.check(exam(1), { ...participant, studentName: '  NGUYỄN   VĂN AN '.normalize('NFD'), className: ' Lớp 7 a1 ' })).remaining, 0);
assert.equal((await names.service.check(exam(1), { ...participant, className: '7A2' })).remaining, 1);
assert.equal((await names.service.check(exam(1), { ...participant, studentName: 'Nguyễn Văn Bình' })).remaining, 1);
const fixed = fixture(exam(1, 'class-7a1'), [old]);
assert.equal((await fixed.service.check(exam(1, 'class-7a1'), { ...participant, className: 'changed class label' })).remaining, 0);
await assert.rejects(names.service.commit(exam(1), participant, result('wrong-exam', { assignmentId: 'another' })));
await assert.rejects(names.service.commit(exam(1), participant, result('wrong-name', { studentName: 'Someone else' })));
await assert.rejects(names.service.commit(exam(1), participant, paper));
console.log('PASS: name casing, Unicode and class whitespace cannot create a new attempt; separate students/classes still work');

const offline = fixture(exam(1));
assert.equal((await offline.service.check(exam(), participant)).limit, 1, 'Fresh teacher limit overrides a cached unlimited assignment');
offline.state.failAssignment = true;
await assert.rejects(offline.service.check(exam(1), participant));
await assert.rejects(offline.reload().check(exam(), participant), /offline/, 'Reloading an old cache must not bypass a previously observed teacher limit');
const legacyOffline = fixture(exam()); legacyOffline.state.failAssignment = true;
assert.equal((await legacyOffline.service.check(exam(), participant)).limit, 0, 'Unrestricted legacy offline behavior is preserved');
offline.state.failAssignment = false; offline.state.failResults = true;
await assert.rejects(offline.service.check(exam(1), participant), /unavailable results/);
const missing = fixture(null);
await assert.rejects(missing.service.check(exam(1), participant));
const unlimited = fixture(exam(0), [old]);
assert.equal((await unlimited.service.check(exam(1), participant)).limit, 0);
assert.equal(unlimited.state.queries, 0, 'Unlimited assignments do not fetch student results');
assert.equal(getMaxSubmissions(exam()), 0);
assert.equal(normalizeAssignmentDoc(sanitizeForFirestore(exam(1)), 'limit_exam').maxSubmissions, 1);
console.log('PASS: current settings are read from server; limited checks fail closed; unlimited/offline legacy behavior and document round-trip remain compatible');

// Execute the current React handlers with fake I/O rather than duplicate their logic.
function bind(file: string, name: string, dependencies: Record<string, any>) {
  const text = fs.readFileSync(new URL(file, import.meta.url), 'utf8');
  const source = ts.createSourceFile('view.tsx', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let found: ts.VariableDeclaration | undefined;
  const visit = (node: ts.Node) => { if (ts.isVariableDeclaration(node) && node.name.getText(source) === name) found = node; ts.forEachChild(node, visit); };
  visit(source); assert.ok(found, name);
  const js = ts.transpileModule(`const ${found!.getText(source)};`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  return new Function(...Object.keys(dependencies), `${js}\nreturn ${name};`)(...Object.values(dependencies));
}
const draft = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
  getItem: (key: string) => draft.get(key) ?? null,
  setItem: (key: string, value: string) => draft.set(key, value),
  removeItem: (key: string) => draft.delete(key)
} });
function examUI(service: any, assignment = exam(1), options: { failLocal?: boolean; failAI?: boolean; staleDraft?: boolean; onAI?: () => void } = {}) {
  const key = 'draft-fixture'; draft.set(key, 'saved student answers');
  const state: any = { lock: { current: false }, busy: false, error: '', stages: [], aiCalls: 0, cloudCalls: 0, local: [], vault: [], finish: [], success: 0, checks: [] };
  const deps = {
    assignment, currentAssignment: options.staleDraft ? { ...assignment, maxSubmissions: undefined } : assignment,
    ...participant, isSubmittingRef: state.lock, isSubmittingWithAI: false, draftStorageKey: key,
    setShowSubmitModal: () => {}, setIsSubmittingWithAI: (value: boolean) => { state.busy = value; },
    setSubmissionStage: (stage: string) => state.stages.push(stage), setSubmissionError: (message: string) => { state.error = message; },
    submissionLimitService: { check: async (a: Assignment, p: any) => { state.checks.push(a); return service.check(a, p); }, commit: service.commit }, SubmissionLimitError,
    document: { fullscreenElement: null }, console: { warn: () => {} },
    studentSolutions: { essay: 'x=5-2=3' }, essayImagesByQuestion: { essay: ['data:image/png;base64,original'] },
    answers: { mc: 'A' }, generalPdfImages: [], startedAt: '2026-10-13T00:00:00Z', tabSwitchCount: 0, violationEvents: [], isPdfMode: false,
    isEssayQuestion, getEssayGradingReference, GradingService,
    stepGradingService: { async analyzeStepByStep(request: any) {
      state.aiCalls++; state.request = request;
      options.onAI?.();
      if (options.failAI) throw Error('AI unavailable');
      return { score: .8, feedback: 'Cần bổ sung kết luận', analysis: [], analysisSource: 'ai', needsTeacherReview: true };
    } },
    FirestoreService: { saveResult: async () => { state.cloudCalls++; } },
    StorageService: { saveSubmission: (s: Submission, opts?: any) => { if (options.failLocal) throw Error('Local quota'); state.local.push({ submission: clone(s), options: opts }); } },
    useMistakeVaultStore: { getState: () => ({ addMistakesFromSubmission: (s: Submission) => state.vault.push(s) }) },
    soundEffects: { playSuccess: () => { state.success++; } }, onFinishExam: (s: Submission) => state.finish.push(s)
  };
  return { state, key, submit: bind('../src/pages/student/StudentExamPage.tsx', 'submitExam', deps) };
}

const denied = examUI(one.service);
await denied.submit();
assert.equal(denied.state.aiCalls, 0); assert.equal(denied.state.cloudCalls, 0); assert.equal(denied.state.local.length, 0);
assert.equal(denied.state.finish.length, 0); assert.equal(denied.state.success, 0); assert.equal(denied.state.vault.length, 0);
assert.equal(draft.get(denied.key), 'saved student answers'); assert.match(denied.state.error, /1\/1/);
assert.equal(denied.state.lock.current, false); assert.equal(denied.state.busy, false);
const broken = fixture(exam(1)); broken.state.failResults = true;
const noNetwork = examUI(broken.service); await noNetwork.submit();
assert.equal(noNetwork.state.aiCalls, 0); assert.equal(draft.has(noNetwork.key), true); assert.match(noNetwork.state.error, /Bài làm vẫn/);
console.log('PASS: actual submit handler denies exhausted/unverifiable attempts before AI, storage, success sound and finish; draft and retry lock survive');

const normal = fixture(exam(1));
const success = examUI(normal.service, exam(1), { staleDraft: true });
const firstClick = success.submit();
await success.submit(); await firstClick;
assert.equal(success.state.aiCalls, 1); assert.equal(normal.state.writes, 1); assert.equal(success.state.finish.length, 1);
assert.equal(success.state.checks[0].maxSubmissions, 1, 'Quota comes from the joined assignment, not the stale shuffled draft');
assert.equal(success.state.cloudCalls, 0, 'No unguarded saveResult follows the atomic save');
assert.equal(success.state.local[0].options.syncCloud, false);
assert.equal(success.state.local[0].submission.id, success.state.finish[0].id);
assert.deepEqual(success.state.stages, ['checking', 'grading', 'saving']);
assert.equal(success.state.finish[0].totalScore, 1.8);
assert.equal(success.state.finish[0].answers[1].needsTeacherReview, true);
assert.equal(success.state.request.correctAnswer, 'x=3'); assert.ok(success.state.request.rubric.includes('1 điểm'));
assert.deepEqual(success.state.request.essayImages, ['data:image/png;base64,original']);
assert.equal(draft.has(success.key), false);
const acceptedBefore = clone([...normal.records.values()]);
const later = examUI(normal.service); await later.submit();
assert.equal(later.state.aiCalls, 0); assert.deepEqual([...normal.records.values()], acceptedBefore);
console.log('PASS: actual successful handler keeps original rubric/images, step grading and teacher review; double click grades/saves once and repeat submission uses zero AI calls');

const saveFails = fixture(exam(1)); saveFails.state.failTransaction = true;
const retry = examUI(saveFails.service); await retry.submit();
assert.equal(retry.state.finish.length, 0); assert.equal(retry.state.local.length, 0); assert.equal(saveFails.records.size, 0);
assert.equal(draft.has(retry.key), true); assert.equal(retry.state.lock.current, false);
saveFails.state.failTransaction = false; await retry.submit();
assert.equal(retry.state.finish.length, 1); assert.equal(saveFails.records.size, 1);
const localFails = examUI(fixture(exam(1)).service, exam(1), { failLocal: true }); await localFails.submit();
assert.equal(localFails.state.finish.length, 1, 'Confirmed cloud acceptance must remain successful when local storage is full');
const aiFails = examUI(fixture(exam(1)).service, exam(1), { failAI: true }); await aiFails.submit();
assert.equal(aiFails.state.finish.length, 1); assert.equal(aiFails.state.finish[0].gradingStatus, 'pending_teacher_grading');
assert.equal(aiFails.state.finish[0].answers[1].aiGraded, false);
assert.equal(aiFails.state.finish[0].answers[1].studentSolutionText, 'x=5-2=3');
const oldUI = examUI(unlimited.service, exam()); await oldUI.submit();
assert.equal(oldUI.state.cloudCalls, 1); assert.equal(oldUI.state.local[0].options, undefined);
assert.equal(oldUI.state.finish.length, 1); assert.equal(draft.has(oldUI.key), false);
console.log('PASS: failed transactions retain drafts and allow retry; cloud success tolerates local quota; unavailable essay AI still queues teacher review; unlimited workflow remains intact');

const updatedDuringGrading = fixture(exam(0), [old]);
const changedDuringSubmit = examUI(updatedDuringGrading.service, exam(), { onAI: () => updatedDuringGrading.setExam(exam(1)) });
await changedDuringSubmit.submit();
assert.equal(changedDuringSubmit.state.finish.length, 0); assert.match(changedDuringSubmit.state.error, /1\/1/);
assert.equal(draft.has(changedDuringSubmit.key), true); assert.equal(updatedDuringGrading.state.writes, 0);
assert.deepEqual(updatedDuringGrading.records.get(old.id), old);
console.log('PASS: enabling a limit during grading is checked before saving and never overwrites historical teacher grades');

function joinUI(service: any, cached = exam()) {
  const state: any = { lock: { current: false }, error: '', starts: [], busy: false, current: cached };
  const start = bind('../src/pages/student/StudentJoinPage.tsx', 'handleStart', {
    assignment: cached, studentName: participant.studentName, classes: [], selectedClassId: 'other', customClassName: '7A1',
    startExamLock: state.lock, submissionLimitService: service, SubmissionLimitError,
    setErrorMsg: (message: string) => { state.error = message; }, setIsCheckingAttempts: (busy: boolean) => { state.busy = busy; },
    setAssignment: (a: Assignment) => { state.current = a; }, onStartExam: (a: Assignment) => state.starts.push(a)
  });
  return { state, start: () => start({ preventDefault: () => {} }) };
}
const blockedJoin = joinUI(one.service); await blockedJoin.start();
assert.equal(blockedJoin.state.starts.length, 0); assert.match(blockedJoin.state.error, /1\/1/);
assert.equal(blockedJoin.state.current.maxSubmissions, 1);
const openJoin = joinUI(fixture(exam(1)).service);
const startClick = openJoin.start(); await openJoin.start(); await startClick;
assert.equal(openJoin.state.starts.length, 1); assert.equal(openJoin.state.starts[0].maxSubmissions, 1);
assert.equal(openJoin.state.lock.current, false); assert.equal(openJoin.state.busy, false);
console.log('PASS: actual join handler refreshes cached limits, blocks already submitted students and ignores double click');

const teacherFile = '../src/pages/teacher/TeacherCreateAssignment.tsx';
function initialTeacherLimit(editingAssignment?: Assignment) {
  const source = ts.createSourceFile('create.tsx', fs.readFileSync(new URL(teacherFile, import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let initializer: ts.Expression | undefined;
  const visit = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) && ts.isArrayBindingPattern(node.name) && node.name.elements[0]?.getText(source) === 'maxSubmissions') initializer = node.initializer;
    ts.forEachChild(node, visit);
  };
  visit(source); assert.ok(initializer);
  const js = ts.transpileModule(`const value = ${initializer!.getText(source)};`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  return new Function('editingAssignment', 'useState', `${js}\nreturn value;`)(editingAssignment, (value: number) => value);
}
async function saveTeacherLimit(editingAssignment?: Assignment, selected = initialTeacherLimit(editingAssignment)) {
  const saved: Assignment[] = [], local: Assignment[] = [];
  const assignment = editingAssignment ?? exam(1);
  const handler = bind(teacherFile, 'handleSave', {
    editingAssignment, isEditing: Boolean(editingAssignment), maxSubmissions: selected,
    title: assignment.title, grade: assignment.grade, topic: assignment.topic, classId: assignment.classId,
    durationMinutes: 45, deadline: '', allowViewResult: true, resultReviewMode: 'full',
    examMode: 'text', questions: assignment.questions, targetTotalPoints: 2, classes: [], BILLING_ENABLED: false, user: undefined,
    isEssayQuestion, normalizeQuestion, calculateQuestionsTotalPoints, toPointUnits,
    setIsSaving: () => {}, alert: () => {}, console: { warn: () => {}, error: () => {} },
    FirestoreService: { saveExam: async (item: Assignment) => { saved.push(clone(item)); } },
    StorageService: { generateAssignmentCode: () => 'NEW-EXAM', saveAssignment: (item: Assignment) => local.push(clone(item)) },
    onSaveSuccess: () => {}
  });
  await handler({ preventDefault: () => {} });
  assert.equal(saved.length, 1); assert.deepEqual(saved, local); return saved[0];
}
assert.equal((await saveTeacherLimit()).maxSubmissions, 1);
assert.equal((await saveTeacherLimit(exam())).maxSubmissions, 0);
const changed = await saveTeacherLimit(exam(), 1);
assert.equal(changed.maxSubmissions, 1); assert.equal(changed.id, 'limit_exam');
assert.equal((await saveTeacherLimit(exam(3))).maxSubmissions, 3);
const variant = await ExamGeneratorService.generateVariantAssignment(exam(), { mode: 'permutation', shuffleQuestions: false, shuffleOptions: false });
assert.equal(variant.maxSubmissions, 1);
const copiedUnlimited = await ExamGeneratorService.generateVariantAssignment(exam(0), { mode: 'permutation', shuffleQuestions: false, shuffleOptions: false });
assert.equal(copiedUnlimited.maxSubmissions, 0);
console.log('PASS: actual teacher save defaults new assignments to one, retains legacy unlimited on edit and saves an explicitly selected limit to both cloud and local; variants inherit configured limits');

console.log('All submission-limit checks passed with offline fixtures; no AI, cloud or student records were contacted.');
