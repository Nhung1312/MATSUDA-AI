import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import * as sdk from 'firebase/firestore';
import 'fake-indexeddb/auto';

// This suite never imports a production Firebase configuration or uses real student data.
assert.equal(process.env.FIRESTORE_EMULATOR_HOST, '127.0.0.1:8097');
const projectId = 'demo-matsuda-submit-first';
const nativeFetch = globalThis.fetch;
globalThis.fetch = (input, options) => {
  const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
  if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) throw Error('PRODUCTION_NETWORK_FORBIDDEN');
  return nativeFetch(input, options);
};
const state = { user: null, writes: 0 };
globalThis.__submitFirstEmulator = state;
globalThis.window = new EventTarget();
const bridge = `import * as sdk from 'firebase/firestore';
export let db;
export function useDb(value){db=value;}
export const auth={get currentUser(){return globalThis.__submitFirstEmulator.user;}};
export const {collection,doc,getDoc,getDocs,addDoc,deleteDoc,query,where,orderBy,serverTimestamp}=sdk;
export const setDoc=async(...args)=>{globalThis.__submitFirstEmulator.writes++;return sdk.setDoc(...args);};`;
const buildResult = await build({ stdin: { contents: `
export {FirestoreService} from './src/services/firestoreService';
export {saveSubmissionConfirmed,saveContestSubmissionConfirmed} from './src/services/submissionSaveService';
export {PendingResultStore} from './src/services/pendingResultStore';
export {buildStudentSubmission} from './src/services/studentSubmission';
export {GradingService} from './src/services/gradingService';
export {stepGradingService} from './src/services/stepGradingService';
export {useDb} from 'emulator-bridge';`, resolveDir: process.cwd(), sourcefile: 'submit-first-entry.ts' },
  bundle: true, write: false, platform: 'node', format: 'esm', packages: 'external',
  plugins: [{ name: 'only-emulator-config', setup(b) {
    b.onResolve({ filter: /(^emulator-bridge$|\/firebase$)/ }, () => ({ path: 'firebase', namespace: 'submit-bridge' }));
    b.onResolve({ filter: /\/storageService$/ }, () => ({ path: 'storage', namespace: 'submit-bridge' }));
    b.onLoad({ filter: /.*/, namespace: 'submit-bridge' }, a => ({ contents: a.path === 'firebase' ? bridge : 'export const StorageService={saveSubmission(){},saveContestSubmission(){},getTeacherSettings(){return {};}};', loader: 'js', resolveDir: process.cwd() }));
  } }] });
const tmp = fs.mkdtempSync(path.resolve('.test-submit-emulator-'));
const modulePath = path.join(tmp, 'adapter.mjs');
fs.writeFileSync(modulePath, buildResult.outputFiles[0].text);
const { FirestoreService: service, saveSubmissionConfirmed: save, saveContestSubmissionConfirmed: saveContest,
  PendingResultStore, buildStudentSubmission: buildSubmission, GradingService, stepGradingService, useDb } = await import(pathToFileURL(modulePath).href);
const rules = fs.readFileSync('tests/fixtures/firestore.production-20261023.rules', 'utf8');
assert.equal(createHash('sha256').update(rules).digest('hex'), '02ca86dd5a88131f85b0b60de630412ad7fcefd43e596a22f71d0496653f7ba8');
const teacherUid = 'SfYjnDb35FhINTqWH1HaUZtp7fk1';
const env = await initializeTestEnvironment({ projectId, firestore: { host: '127.0.0.1', port: 8097, rules } });
const anon = env.unauthenticatedContext(), teacher = env.authenticatedContext(teacherUid), other = env.authenticatedContext('synthetic-unprivileged');
function select(context, user = null) { const db = context.firestore()._delegate; assert.equal(db.app.options.projectId, projectId); state.user = user; useDb(db); return db; }
const teacherDb = teacher.firestore()._delegate;
const denied = p => assert.rejects(p, e => e.code === 'permission-denied');
const ok = text => console.log('PASS ' + text);
const mcq = { id: 'q-mcq', order: 1, question: '1+1=?', type: 'multiple_choice', points: .5, options: [{ id: 'A', text: '2' }, { id: 'B', text: '3' }], correctAnswer: 'A' };
const essay = { id: 'q-essay', order: 2, question: 'Giải x+1=2', type: 'essay', points: 1.5, options: [], correctAnswer: 'x=1', rubric: 'SYNTHETIC ORIGINAL RUBRIC' };
const image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=';
function fixture(id, mode = 'text') {
  const assignment = { id: 'synthetic-exam', title: 'Synthetic only', grade: '7', topic: 'Equations', classId: 'c', className: 'C', totalPoints: 2, questions: mode === 'mcq' ? [mcq] : [mcq, essay] };
  const sub = buildSubmission({ assignment, studentAnswers: { 'q-mcq': 'A' }, studentSolutions: mode === 'text' ? { 'q-essay': 'x+1=2; x=1' } : {},
    essayImagesByQuestion: mode === 'image' ? { 'q-essay': [image] } : {}, studentName: 'Synthetic student', classId: 'c', className: 'C', startedAt: '2026-01-01T00:00:00Z', submittedAt: '2026-01-01T00:01:00Z' });
  return { assignment, sub: { ...sub, id } };
}
const read = async id => { const r = await sdk.getDocFromServer(sdk.doc(teacherDb, 'results', id)); return r.exists() ? r.data() : null; };
const edit = (s, score) => ({ ...s, answers: s.answers.map(a => a.questionId === essay.id ? { ...a, teacherReviewed: true, teacherScore: score, pointsEarned: score, teacherFeedback: 'Synthetic approved comment', needsTeacherReview: false, isProvisional: false } : a), gradingStatus: 'graded', needsTeacherReview: false, isProvisional: false });
let aiCalls = 0;
stepGradingService.analyzeStepByStep = async () => { aiCalls++; throw Error('AI must not run during submission'); };
try {
  for (const mode of ['mcq', 'text', 'image']) {
    const db = select(anon), { sub } = fixture('submit-' + mode, mode);
    const result = await save(sub, { intent: 'student' });
    assert.equal(result.cloudSaved, true); assert.equal(aiCalls, 0);
    const stored = await read(sub.id);
    assert.deepEqual(stored.answers, JSON.parse(JSON.stringify(sub.answers))); assert.equal(stored.mcqPoints, .5);
    if (mode !== 'mcq') { assert.equal(stored.gradingStatus, 'pending_teacher_grading'); assert.equal(stored.isProvisional, true); }
    await denied(sdk.getDocFromServer(sdk.doc(db, 'results', sub.id)));
    const before = state.writes;
    const receipt = await save(sub, { intent: 'student' });
    assert.equal(receipt.cloudSaved, true); assert.equal(state.writes, before, 'confirmed receipt avoids any duplicate write');
    ok('anonymous ' + mode + ': CREATE acknowledged before any AI; complete answer/image snapshot; no read permission; receipt retry uses same ID');
  }
  const db = select(anon);
  await denied(sdk.getDocsFromServer(sdk.collection(db, 'results')));
  await denied(sdk.updateDoc(sdk.doc(db, 'results', 'submit-image'), { totalScore: 99 }));
  await denied(sdk.setDoc(sdk.doc(db, 'results', 'bad-id'), JSON.parse(JSON.stringify(fixture('different').sub))));
  select(other, { uid: 'synthetic-unprivileged' });
  await denied(service.getResultById('submit-image'));
  ok('student/other UID cannot read/list/update results; mismatched document ID cannot create');

  select(anon);
  const interruption = fixture('offline-retry', 'image').sub;
  const cloudSave = service.saveResult.bind(service);
  service.saveResult = async () => { throw Error('synthetic connection interrupted before write'); };
  const offline = await save(interruption, { intent: 'student' });
  assert.equal(offline.cloudSaved, false); assert.equal(offline.localSaved, true); assert.equal(await read(interruption.id), null);
  service.saveResult = cloudSave;
  const resumed = await save(offline.pendingSubmission, { intent: 'student' });
  assert.equal(resumed.cloudSaved, true); assert.equal(resumed.submission.id, interruption.id);
  assert.deepEqual((await read(interruption.id)).answers, JSON.parse(JSON.stringify(interruption.answers)));
  ok('interrupted network retains durable same-ID snapshot; explicit retry creates one complete result');

  const sdkOffline = fixture('sdk-offline', 'image').sub;
  const offlineDb = select(anon);
  await sdk.disableNetwork(offlineDb);
  const waiting = await save(sdkOffline, { intent: 'student' });
  assert.equal(waiting.cloudSaved, false); assert.equal(waiting.localSaved, true); assert.equal(await read(sdkOffline.id), null);
  const retryWhileQueued = save(waiting.pendingSubmission, { intent: 'student' });
  await sdk.enableNetwork(offlineDb);
  assert.equal((await retryWhileQueued).cloudSaved, true);
  assert.deepEqual((await read(sdkOffline.id)).answers, JSON.parse(JSON.stringify(sdkOffline.answers)));
  ok('real SDK offline queue: no success before backend acknowledgement; reconnect/retry shares the same pending write');

  const uncertain = fixture('lost-ack', 'text').sub;
  service.saveResult = async (s, options) => { await cloudSave(s, options); throw Error('synthetic acknowledgement lost after commit'); };
  const lost = await save(uncertain, { intent: 'student' });
  assert.equal(lost.cloudSaved, false); assert.ok(await read(uncertain.id));
  service.saveResult = cloudSave;
  const replay = await save(lost.pendingSubmission, { intent: 'student' });
  assert.equal(replay.cloudSaved, false); assert.match(replay.error, /chưa đủ căn cứ xác nhận/);
  assert.ok((await PendingResultStore.list('student')).some(r => r.submission.id === uncertain.id));
  assert.deepEqual((await read(uncertain.id)).answers, JSON.parse(JSON.stringify(uncertain.answers)));
  ok('lost acknowledgement is never reported as success; replay denied on same ID, no overwrite/duplicate, pending preserved');

  const concurrent = fixture('double-click').sub, before = state.writes;
  const double = await Promise.all([save(concurrent, { intent: 'student' }), save(concurrent, { intent: 'student' })]);
  assert.ok(double.every(r => r.cloudSaved)); assert.equal(state.writes, before + 1);
  const oversized = fixture('oversized', 'image').sub;
  oversized.answers[1].essayImages = ['data:image/png;base64,' + 'A'.repeat(1_048_576)];
  const tooBig = await save(oversized, { intent: 'student' });
  assert.equal(tooBig.cloudSaved, false); assert.equal(tooBig.localSaved, true); assert.match(tooBig.error, /quá lớn/); assert.equal(await read(oversized.id), null);
  ok('double click coalesces one write; oversized images are retained locally and rejected before a partial/invalid Cloud write');

  select(teacher, { uid: teacherUid });
  const { assignment } = fixture('submit-image', 'image');
  const original = await service.getResultById('submit-image');
  assert.deepEqual(original.answers[1].essayImages, [image]);
  for (const status of [429, 500]) {
    stepGradingService.analyzeStepByStep = async () => { aiCalls++; throw Error('Synthetic AI HTTP ' + status); };
    await GradingService.gradeSingleSubmissionWithAI({ assignment, submission: await service.getResultById(original.id) });
    const after = await read(original.id);
    assert.deepEqual(after.answers[1].essayImages, [image]); assert.equal(after.gradingStatus, 'needs_review'); assert.equal(after.answers[0].pointsEarned, .5);
    ok('AI HTTP ' + status + ' after submission preserves original saved work/image/objective score');
  }
  stepGradingService.analyzeStepByStep = async () => { aiCalls++; return { success: true, analysisSource: 'ai', score: 1, maxScore: 1.5, feedback: 'Synthetic AI suggestion', firstErrorStep: 2, firstErrorType: 'calculation', firstErrorExplanation: 'Synthetic first error', totalSteps: 3, correctStepsCount: 1, isAllCorrect: false, needsTeacherReview: false,
    analysis: [{ stepIndex: 1, studentLatex: 'x+1=2', status: 'correct', confidence: .99, comment: 'Synthetic correct step' }, { stepIndex: 2, studentLatex: 'x=2', status: 'first_error', confidence: .99, comment: 'Synthetic first error' }, { stepIndex: 3, studentLatex: '2x=4', status: 'cascading_error', confidence: .99, comment: 'Synthetic cascading error' }] }; };
  const graded = await GradingService.gradeSingleSubmissionWithAI({ assignment, submission: await service.getResultById(original.id) });
  assert.equal(graded.persistence.cloudSaved, true); assert.equal(graded.submission.isProvisional, true); assert.equal(graded.submission.answers[1].stepAnalysis.length, 3);
  const approved = await service.saveResult(edit(graded.submission, 1.25), { intent: 'teacher', operationId: 'approve-essay' });
  const reloaded = await service.getResultById(original.id);
  assert.equal(reloaded.answers[1].teacherScore, 1.25); assert.equal(reloaded.answers[1].teacherFeedback, 'Synthetic approved comment');
  const countBefore = aiCalls;
  await GradingService.gradeSingleSubmissionWithAI({ assignment, submission: reloaded });
  assert.equal(aiCalls, countBefore, 'approved answer must not be automatically regraded');
  await assert.rejects(service.saveResult(edit(graded.submission, .25), { intent: 'teacher', operationId: 'stale-tab' }), e => e.code === 'RESULT_CONFLICT');
  select(anon);
  await denied(sdk.setDoc(sdk.doc(db, 'results', approved.id), JSON.parse(JSON.stringify(fixture(approved.id, 'image').sub))));
  assert.equal((await read(original.id)).answers[1].teacherScore, 1.25);
  ok('teacher AI first/cascading error analysis is stored as provisional; approval survives reload; stale tab/student cannot overwrite it; no old approved regrade');
  const contest = { ...fixture('contest-create', 'mcq').sub, contestId: 'synthetic-contest', contestCode: 'SYN', contestTitle: 'Synthetic', studentClass: 'C', essayScore: 0, hasEssay: false, isEssayGraded: true, attemptNumber: 1 };
  delete contest.assignmentId;
  assert.equal((await saveContest(contest, { intent: 'student' })).cloudSaved, true);
  ok('shared anonymous create path remains compatible with contest create permission');
  console.log('SUBMIT FIRST EMULATOR PASS — exact deployed Rules fixture, synthetic records only, production writes: 0');
} finally { await env.cleanup(); }
