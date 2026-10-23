import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import { StorageService } from '../src/services/storageService';
import { FirestoreService } from '../src/services/firestoreService';
import { saveSubmissionConfirmed } from '../src/services/submissionSaveService';
import { stepGradingService } from '../src/services/stepGradingService';

assert.ok(String(globalThis.fetch).includes('__examOfflineFetch'), 'Mandatory offline guard is missing');
const local = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
  getItem: (key: string) => local.get(key) ?? null,
  setItem: (key: string, value: string) => local.set(key, value)
} });
const originalInit = StorageService.initDemoData;
const originalCloud = FirestoreService.saveResult;
StorageService.initDemoData = () => {};

const reviewText = fs.readFileSync(new URL('../src/pages/teacher/TeacherResults.tsx', import.meta.url), 'utf8');
const batchText = fs.readFileSync(new URL('../src/components/BatchGradingModal.tsx', import.meta.url), 'utf8');
function bind(text: string, name: string, dependencies: Record<string, any>): any {
  const source = ts.createSourceFile('view.tsx', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let found: ts.VariableDeclaration | undefined;
  const visit = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) && node.name.getText(source) === name) found = node;
    ts.forEachChild(node, visit);
  };
  visit(source); assert.ok(found, name);
  const js = ts.transpileModule(`const ${found!.getText(source)};`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  return new Function(...Object.keys(dependencies), `${js}\nreturn ${name};`)(...Object.values(dependencies));
}
const clone = (value: any) => JSON.parse(JSON.stringify(value));
const question = (id: string) => ({ id, question: 'Giải phương trình.', type: 'essay', points: 1, options: [], correctAnswer: '1', rubric: 'Đáp số: 1 điểm' });
const answer = (id: string) => ({ questionId: id, selectedAnswer: 'x=1', studentSolutionText: 'x=1', isCorrect: false, pointsEarned: 0, maxPoints: 1, needsTeacherReview: true });
const response = (score: number) => ({ success: true, analysisSource: 'ai', analysis: [{ stepIndex: 1, studentLatex: 'x=1', status: 'correct', confidence: .99, comment: 'Đúng.' }], score, maxScore: 1, isAllCorrect: false, feedback: 'Đề xuất AI.', firstErrorStep: null, firstErrorType: null, firstErrorExplanation: null, needsTeacherReview: false });
const flush = async () => { for (let i=0;i<8;i++) await new Promise<void>(resolve => setImmediate(resolve)); };
let cloudCalls: any[] = [];
let cloud: (submission: any) => Promise<void> = async () => {};
FirestoreService.saveResult = async submission => { cloudCalls.push(clone(submission)); await cloud(submission); return { ...submission, saveAttemptId: undefined, saveBaseFingerprint: 'offline-confirmed-fixture' }; };

function harness(initial: any, questions: any[]) {
  const state: any = { selected: initial, inputs: {}, feedback: {}, saved: {}, lock: { current: false }, dirty: { current: new Set<string>() }, pending: { current: null }, notice: null, aiCalls: 0, wholeCalls: 0 };
  const assignment = { id: 'a', grade: '7', topic: 'Toán', questions };
  let ai: (request: any) => Promise<any> = async () => response(.5);
  const dependencies = (): Record<string, any> => ({
    selectedSubmissionDetail: state.selected, currentAssignment: assignment,
    reviewOperationLock: state.lock, editedTeacherInputs: state.dirty, pendingCloudSave: state.pending,
    teacherScoreInput: state.inputs, teacherFeedbackInput: state.feedback,
    stepGradingService: { analyzeStepByStep: async (request: any) => { state.aiCalls++; return ai(request); } },
    GradingService: { gradeSingleSubmissionWithAI: async () => { state.wholeCalls++; throw Error('Unexpected whole grading'); } },
    getEssayGradingReference: (q: any) => ({ correctAnswer: q.correctAnswer, rubric: q.rubric }), isEssayQuestion: (q: any) => q.type === 'essay',
    setGradingAiInProgress: () => {}, setActionNotice: () => {}, setExpandedStepAnalysis: () => {}, setGradingSingleInProgress: () => {},
    setSelectedSubmissionDetail: (sub: any) => { state.selected = sub; },
    setTeacherScoreInput: (fn: any) => { state.inputs = fn(state.inputs); }, setTeacherFeedbackInput: (fn: any) => { state.feedback = fn(state.feedback); },
    setSavedGradeSuccess: (fn: any) => { state.saved = fn(state.saved); },
    setSavingSubmission: (value: boolean) => { state.saving = value; }, setReviewSaveNotice: (notice: any) => { state.notice = notice; },
    saveSubmissionConfirmed, listPendingResultSaves: async () => [], setRecoverableSaves: () => {}, setTimeout: () => {}, pendingReviewSubmissions: [], getPendingReviewCount: () => 0,
    setSubmissionReviewFilter: () => {}
  });
  const deps = () => {
    const d = dependencies();
    d.showSubmissionSaveResult = bind(reviewText, 'showSubmissionSaveResult', d);
    d.persistReviewSubmission = bind(reviewText, 'persistReviewSubmission', d);
    return d;
  };
  return { state, setAI: (fn: typeof ai) => { ai = fn; }, call: (name: string, ...args: any[]) => bind(reviewText, name, deps())(...args) };
}

try {
  StorageService.setSubmissions([]);
  const q = question('q1');
  const manual: any = { id: 'manual', assignmentId: 'a', maxScore: 1, gradingStatus: 'graded', answers: [{ ...answer(q.id), teacherScore: .8, pointsEarned: .8, teacherReviewed: true, teacherFeedback: 'Giáo viên đã duyệt.', needsTeacherReview: false }] };
  cloudCalls = [];
  StorageService.saveSubmission(manual);
  await flush(); assert.equal(cloudCalls.length, 1, 'Legacy save still auto-syncs by default');
  cloudCalls = [];
  StorageService.saveSubmission(manual, { syncCloud: false });
  await flush(); assert.equal(cloudCalls.length, 0);
  await saveSubmissionConfirmed(manual, { intent: 'teacher' });
  assert.equal(cloudCalls.length, 1, 'Confirmed save sends exactly one cloud write');
  console.log('PASS: old StorageService default preserved; confirmed save sends one cloud write');

  const h = harness(clone(manual), [q]);
  h.state.inputs = { q1: .8 }; h.state.feedback = { q1: 'Giáo viên đã duyệt.' };
  await h.call('handleAiGradeSingleQuestion', h.state.selected.answers[0], q);
  assert.equal(h.state.selected.answers[0].teacherScore, .8);
  assert.equal(h.state.selected.answers[0].aiScore, .5);
  assert.equal(h.state.inputs.q1, .8); assert.equal(h.state.feedback.q1, 'Giáo viên đã duyệt.');
  await h.call('handleSaveTeacherManualGrade', h.state.selected.answers[0], q);
  assert.equal(h.state.selected.answers[0].teacherScore, .8);
  console.log('PASS: AI refresh plus Save retains both the approved teacher score and feedback');

  const q2 = question('q2');
  const two: any = { id: 'two', assignmentId: 'a', maxScore: 2, gradingStatus: 'needs_review', answers: [answer(q.id), answer(q2.id)] };
  const serial = harness(two, [q, q2]);
  let resolveAI: (value: any) => void = () => {};
  serial.setAI(() => new Promise(resolve => { resolveAI = resolve; }));
  const first = serial.call('handleAiGradeSingleQuestion', two.answers[0], q);
  await serial.call('handleAiGradeSingleQuestion', two.answers[1], q2);
  await serial.call('handleGradeEntireSingleSubmission', two);
  await serial.call('handleSaveTeacherManualGrade', two.answers[1], q2);
  assert.equal(serial.state.aiCalls, 1); assert.equal(serial.state.wholeCalls, 0);
  resolveAI(response(.4)); await first;
  serial.setAI(async () => response(.6));
  await serial.call('handleAiGradeSingleQuestion', serial.state.selected.answers[1], q2);
  assert.deepEqual(serial.state.selected.answers.map((a: any) => a.pointsEarned), [.4, .6]);
  console.log('PASS: synchronous lock blocks overlapping single/whole/manual actions; later question keeps the first result');

  const dirty = harness({ ...two, id: 'dirty', answers: [answer(q.id)] }, [q]);
  dirty.state.inputs = { q1: .9 }; dirty.state.feedback = { q1: 'Đang nhập lời phê.' }; dirty.state.dirty.current.add(q.id);
  await dirty.call('handleAiGradeSingleQuestion', dirty.state.selected.answers[0], q);
  assert.equal(dirty.state.inputs.q1, .9); assert.equal(dirty.state.feedback.q1, 'Đang nhập lời phê.');
  console.log('PASS: an unsaved teacher edit is not replaced by an AI proposal');

  cloud = async () => { throw Error('fixture cloud failure'); };
  await h.call('handleSaveTeacherManualGrade', h.state.selected.answers[0], q);
  assert.equal(h.state.saved.q1, false); assert.equal(h.state.notice.warning, true);
  assert.equal(h.state.pending.current.id, manual.id);
  const callsBeforeRetry = h.state.aiCalls;
  cloud = async () => {};
  await h.call('retrySubmissionSave');
  assert.equal(h.state.notice.warning, false); assert.equal(h.state.pending.current, null);
  assert.equal(h.state.aiCalls, callsBeforeRetry);
  console.log('PASS: cloud failure is visible and never shows saved success; retry uses no AI');

  let releaseCloud: () => void = () => {};
  cloud = () => new Promise(resolve => { releaseCloud = resolve; });
  const pendingSave = h.call('handleSaveTeacherManualGrade', h.state.selected.answers[0], q);
  await flush(); assert.equal(h.state.saved.q1, false); assert.equal(h.state.lock.current, true);
  releaseCloud(); await pendingSave; assert.equal(h.state.saved.q1, true);
  console.log('PASS: saved success waits for cloud acknowledgement');

  cloudCalls = [];
  let releaseFirst: () => void = () => {};
  cloud = submission => submission.totalScore === .2 ? new Promise(resolve => { releaseFirst = resolve; }) : Promise.resolve();
  const firstSave = saveSubmissionConfirmed({ ...manual, id: 'ordered', totalScore: .2 }, { intent: 'teacher' });
  const secondSave = saveSubmissionConfirmed({ ...manual, id: 'ordered', totalScore: .4 }, { intent: 'teacher' });
  await flush(); assert.deepEqual(cloudCalls.map(s => s.totalScore), [.2]);
  releaseFirst(); await Promise.all([firstSave, secondSave]);
  assert.deepEqual(cloudCalls.map(s => s.totalScore), [.2, .4]);
  assert.equal(StorageService.getSubmissions().find(s => s.id === 'ordered')?.totalScore, .4);
  console.log('PASS: cloud writes for the same submission are ordered; latest local result is retained');

  const oldTimeout = globalThis.setTimeout, oldClear = globalThis.clearTimeout;
  let timeoutAction: (() => void) | undefined;
  const uiTimer = {};
  globalThis.setTimeout = ((fn: () => void, ms: number, ...args:any[]) => {
    if(ms===15000){timeoutAction=fn;return uiTimer;}
    return oldTimeout(fn,ms,...args);
  }) as any;
  globalThis.clearTimeout = ((timer:any) => { if(timer!==uiTimer)oldClear(timer); }) as any;
  try {
    cloud = () => new Promise(() => {});
    const timeoutSave = saveSubmissionConfirmed({ ...manual, id: 'timeout' }, { intent: 'teacher' });
    await flush(); assert.ok(timeoutAction); timeoutAction!();
    const timedOut = await timeoutSave; assert.equal(timedOut.localSaved, true); assert.equal(timedOut.cloudSaved, false); assert.ok(timedOut.pendingSubmission);
  } finally { globalThis.setTimeout = oldTimeout; globalThis.clearTimeout = oldClear; }
  console.log('PASS: missing cloud acknowledgement times out with the local copy retained');

  const beforeFinal = harness({ ...manual, gradingStatus: 'needs_review' }, [q]);
  cloud = async () => { throw Error('fixture cloud failure'); };
  await beforeFinal.call('finalizeSubmission', true);
  assert.equal(beforeFinal.state.selected.id, manual.id); assert.equal(beforeFinal.state.notice.warning, true);
  console.log('PASS: finalize failure stays on the current submission and offers retry');

  let items: any[] = [{ id: manual.id }], toast: any, updateOptions: any;
  const graded: any = { submission: manual, needsTeacherReview: false, totalErrors: 0, persistence: { localSaved: true, cloudSaved: false } };
  await bind(batchText, 'handleGradeSingle', { isGrading: false, assignment: { id: 'a' }, submissions: [manual],
    setItems: (fn: any) => { items = fn(items); }, GradingService: { gradeSingleSubmissionWithAI: async () => graded },
    onSubmissionsUpdated: (_subs: any, options: any) => { updateOptions = options; }, showToast: (text: string, type: string) => { toast = { text, type }; }
  })(items[0]);
  assert.equal(toast.type, 'warning'); assert.ok(items[0].cloudSaveWarning); assert.equal(updateOptions.cloudHandled, true);
  console.log('PASS: batch grading reports unconfirmed cloud saving without a second cloud write');

  let batchItems: any[] = [{ id: 'first', studentName: 'Fixture 1', status: 'pending', submission: manual },
    { id: 'second', studentName: 'Fixture 2', status: 'pending', submission: { ...manual, id: 'second' } }];
  let batchCalls = 0;
  const toasts: any[] = [];
  await bind(batchText, 'handleStartBatch', { isGrading: false, skipAlreadyGraded: true, items: batchItems,
    assignment: { id: 'a' }, submissions: batchItems.map(item => item.submission), abortControllerRef: { current: null },
    setIsGrading: () => {}, setCurrentGradingIndex: () => {}, setProgressText: () => {},
    setItems: (fn: any) => { batchItems = fn(batchItems); },
    GradingService: { gradeSingleSubmissionWithAI: async () => { batchCalls++; return graded; } },
    onSubmissionsUpdated: () => {}, showToast: (text: string, type: string) => { toasts.push({ text, type }); }
  })();
  assert.equal(batchCalls, 1); assert.equal(batchItems[1].status, 'pending');
  assert.ok(toasts.some(t => t.type === 'warning'));
  assert.ok(!toasts.some(t => t.type === 'success'));
  console.log('PASS: batch stops after unconfirmed saving, leaves later students untouched and does not claim class completion');

  const parentSource = ts.createSourceFile('parent.tsx', reviewText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let updateExpression: ts.Expression | undefined;
  const findUpdate = (node: ts.Node) => {
    if (ts.isJsxAttribute(node) && node.name.getText(parentSource) === 'onSubmissionsUpdated' && node.initializer && ts.isJsxExpression(node.initializer)) updateExpression = node.initializer.expression;
    ts.forEachChild(node, findUpdate);
  };
  findUpdate(parentSource); assert.ok(updateExpression);
  const parentJs = ts.transpileModule(`const update = ${updateExpression!.getText(parentSource)};`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  let rewrittenRecords = 0;
  const update = new Function('StorageService', 'window', 'CustomEvent', 'currentSubmissions', 'saveSubmissionConfirmed', 'setActionNotice', parentJs + '\nreturn update;')(
    { saveSubmission: () => { rewrittenRecords++; } }, { dispatchEvent: () => {} }, class {},
    [manual], async () => { rewrittenRecords++; return {cloudSaved:true}; }, () => {});
  update([manual], { cloudHandled: true }); assert.equal(rewrittenRecords, 0);
  update([manual]); assert.equal(rewrittenRecords, 0, 'Existing historical records are never re-saved by the list callback');
  update([{...manual,id:'new-paper'}]); assert.equal(rewrittenRecords, 1);
  console.log('PASS: parent only saves newly added IDs; never rewrites historical batch records');

  const photo = 'https://example.test/shared-grading-photo.png';
  const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4//8/AAX+Av4N70a4AAAAAElFTkSuQmCC';
  let imageDownloads = 0, aiRequests = 0;
  (globalThis as any).__examOfflineFetch = async (url: any, init: any) => {
    if (String(url) === photo) {
      imageDownloads++;
      return new Response(Uint8Array.from(atob(png), ch => ch.charCodeAt(0)), { headers: { 'content-type': 'image/png' } });
    }
    assert.equal(String(url), '/api/grading/step-analysis'); aiRequests++;
    assert.equal(JSON.parse(init.body).essayImages[0], `data:image/png;base64,${png}`, 'Original photo bytes must remain exact');
    return new Response(JSON.stringify(response(.5)), { headers: { 'content-type': 'application/json' } });
  };
  const request = { questionText: 'Giải phương trình.', maxPoints: 1, rubric: '1 điểm', essayImages: [photo] };
  const imageMemo = new Map();
  await stepGradingService.analyzeStepByStep({ ...request, questionId: 'memo-q1' }, { imageMemo });
  await stepGradingService.analyzeStepByStep({ ...request, questionId: 'memo-q2' }, { imageMemo });
  assert.equal(imageDownloads, 1); assert.equal(aiRequests, 2);
  await stepGradingService.analyzeStepByStep({ ...request, questionId: 'memo-next-run' }, { imageMemo: new Map() });
  assert.equal(imageDownloads, 2);
  console.log('PASS: shared original photo downloads once per grading run; a new run loads fresh bytes; no extra AI requests');
  console.log('REVIEW/SAVE CHECK: PASS (exact UI handlers; network blocked; synthetic records only)');
} finally { StorageService.initDemoData = originalInit; FirestoreService.saveResult = originalCloud; }
