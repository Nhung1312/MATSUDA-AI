import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { spawn } from 'node:child_process';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import * as sdk from 'firebase/firestore';
import 'fake-indexeddb/auto';

// This suite never imports a production Firebase configuration or uses real student data.
assert.equal(process.env.FIRESTORE_EMULATOR_HOST, '127.0.0.1:8097');
const projectId = 'demo-matsuda-submit-first';
const liveAI = process.env.MATSUDA_LIVE_AI_SMOKE === '1';
const liveOnly = process.env.MATSUDA_LIVE_AI_ONLY === '1';
assert.ok(!liveOnly || liveAI, 'The focused live test requires explicit live AI opt-in');
const reuseObservedAI = process.env.MATSUDA_REUSE_OBSERVED_AI === '1';
assert.ok(!reuseObservedAI || (liveAI && liveOnly), 'Captured response reuse is only for the focused synthetic UI test');
const aiOrigin = 'https://matsuda-ai-xi.vercel.app';
const liveFixture = liveAI ? JSON.parse(fs.readFileSync('tests/fixtures/live-ai-synthetic-image.json', 'utf8')) : null;
let liveRequests = 0;
let actualHttpRequests = 0;
let replayedResponses = 0;
let liveResponse;
const nativeFetch = globalThis.fetch;
// The Work Mode proxy is supported by urllib. Keep the live smoke's transport isolated
// from the Emulator, with a fixed URL, redirects disabled and only a validated fake body.
async function requestLiveAI(body) {
  const script = `import sys,json,urllib.request,urllib.error
class NoRedirect(urllib.request.HTTPRedirectHandler):
 def redirect_request(self,req,fp,code,msg,headers,newurl): return None
request=urllib.request.Request('https://matsuda-ai-xi.vercel.app/api/grading/step-analysis',data=sys.stdin.buffer.read(),headers={'Content-Type':'application/json'},method='POST')
try:
 with urllib.request.build_opener(NoRedirect()).open(request,timeout=90) as response:
  print(json.dumps({'status':response.status,'body':response.read().decode()}))
except urllib.error.HTTPError as error:
 print(json.dumps({'status':error.code,'body':error.read().decode()}))
`;
  return new Promise((resolve, reject) => {
    const child = spawn('python', ['-c', script], { stdio: ['pipe', 'pipe', 'pipe'] });
    let output = '', error = '';
    const timer = setTimeout(() => { child.kill(); reject(Error('Live AI HTTP request timed out after 95 seconds')); }, 95000);
    child.stdout.on('data', chunk => { output += chunk; });
    child.stderr.on('data', chunk => { error += chunk; });
    child.on('error', failure => { clearTimeout(timer); reject(failure); });
    child.on('close', code => {
      clearTimeout(timer);
      if (code !== 0) { reject(Error('Live AI transport failed: ' + error.slice(-1200))); return; }
      try { const response = JSON.parse(output); resolve(new Response(response.body, { status: response.status, headers: { 'Content-Type': 'application/json' } })); }
      catch (failure) { reject(failure); }
    });
    child.stdin.end(body);
  });
}
globalThis.fetch = async (input, options) => {
  const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, liveAI ? aiOrigin : undefined);
  if (liveAI && url.origin === aiOrigin && url.pathname === '/api/grading/step-analysis' && !url.search) {
    assert.equal(options?.method, 'POST');
    assert.equal(globalThis.__submitFirstEmulator.user?.uid, teacherUid, 'AI only after selecting the synthetic teacher');
    const body = JSON.parse(options.body);
    for (const key of ['questionText', 'grade', 'topic', 'maxPoints', 'correctAnswer', 'rubric', 'studentSolutionText', 'essayImages']) {
      assert.deepEqual(body[key], liveFixture[key], 'Only the committed synthetic fixture may reach the live AI endpoint: ' + key);
    }
    assert.equal(++liveRequests, 1, 'At most one paid AI request per manual smoke run');
    console.log('STAGE live-ai-http START');
    const started = Date.now();
    let response;
    if (reuseObservedAI) {
      // Exact captured response from the just-completed real AI call, never a fabricated grade.
      const observed = JSON.parse(fs.readFileSync('tests/fixtures/live-ai-observed-response-20261023.json', 'utf8'));
      assert.deepEqual(body.essayImages, observed.syntheticRequest.essayImages);
      for (const key of ['questionText', 'maxPoints', 'correctAnswer', 'rubric']) assert.deepEqual(body[key], observed.syntheticRequest[key]);
      response = new Response(JSON.stringify(observed.response.body), { status: observed.response.httpStatus, headers: { 'Content-Type': 'application/json' } });
      replayedResponses++;
    } else {
      actualHttpRequests++;
      response = await requestLiveAI(options.body);
    }
    liveResponse = { httpStatus: response.status, body: await response.clone().json() };
    console.log('STAGE live-ai-http END ' + JSON.stringify({ ms: Date.now() - started, status: response.status, source: liveResponse.body.analysisSource, reusedCapturedResponse: reuseObservedAI }));
    fs.writeFileSync(path.join(tmp, 'live-ai-response.json'), JSON.stringify(liveResponse, null, 2) + '\n');
    return response;
  }
  if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) throw Error('PRODUCTION_NETWORK_FORBIDDEN');
  return nativeFetch(input, options);
};
const state = { user: null, writes: 0 };
globalThis.__submitFirstEmulator = state;
globalThis.window = new EventTarget();
const legacyDisk = new Map([['toan_thcs_exam_draft_keep', 'SYNTHETIC UNSYNCED ORIGINAL']]);
const originalDisk = [...legacyDisk];
let cacheWrites = 0;
globalThis.localStorage = {
  get length() { return legacyDisk.size; }, key: i => [...legacyDisk.keys()][i] ?? null,
  getItem: key => legacyDisk.get(key) ?? null,
  setItem: () => { cacheWrites++; throw new DOMException('Synthetic localStorage full', 'QuotaExceededError'); },
  removeItem: () => { throw Error('Never remove legacy data'); }, clear: () => { throw Error('Never reset cache'); }
};
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
export {StorageService} from './src/services/storageService';
export {buildStudentSubmission} from './src/services/studentSubmission';
export {GradingService} from './src/services/gradingService';
export {stepGradingService} from './src/services/stepGradingService';
${liveAI ? "export {TeacherResults} from './src/pages/teacher/TeacherResults';" : ''}
export {useDb} from 'emulator-bridge';`, resolveDir: process.cwd(), sourcefile: 'submit-first-entry.ts' },
  bundle: true, write: false, platform: 'node', format: 'esm', packages: 'external',
  plugins: [{ name: 'only-emulator-config', setup(b) {
    if (liveAI) {
      b.onResolve({ filter: /\/components\// }, args => ({ path: args.path.split('/').pop(), namespace: 'smoke-ui-components' }));
      b.onLoad({ filter: /.*/, namespace: 'smoke-ui-components' }, args => ({
        contents: `import React from 'react'; export const ${args.path} = ${args.path === 'MathDisplay'
          ? "({text})=>React.createElement('span',{},text)"
          : args.path === 'StepGradingBreakdown' ? "({result})=>React.createElement('pre',{},JSON.stringify(result))" : '()=>null'};`, loader: 'js', resolveDir: process.cwd()
      }));
    }
    b.onResolve({ filter: /(^emulator-bridge$|\/firebase$)/ }, () => ({ path: 'firebase', namespace: 'submit-bridge' }));
    b.onLoad({ filter: /.*/, namespace: 'submit-bridge' }, () => ({ contents: bridge, loader: 'js', resolveDir: process.cwd() }));
  } }] });
const tmp = fs.mkdtempSync(path.resolve('.test-submit-emulator-'));
const modulePath = path.join(tmp, 'adapter.mjs');
fs.writeFileSync(modulePath, buildResult.outputFiles[0].text);
const adapter = await import(pathToFileURL(modulePath).href);
const { FirestoreService: service, saveSubmissionConfirmed: save, saveContestSubmissionConfirmed: saveContest,
  PendingResultStore, StorageService, buildStudentSubmission: buildSubmission, GradingService, stepGradingService, useDb } = adapter;
const realAnalyze = stepGradingService.analyzeStepByStep.bind(stepGradingService);
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
  assert.doesNotThrow(() => StorageService.initDemoData());
  const cacheWritesAfterDemo = cacheWrites;
  if (!liveOnly) {
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
  assert.equal(cacheWrites, cacheWritesAfterDemo, 'Acknowledged student/teacher results must not rewrite localStorage arrays');
  ok('actual StorageService under full localStorage: acknowledged creates, teacher AI/review/reload succeed with zero result-cache writes');
  const contest = { ...fixture('contest-create', 'mcq').sub, contestId: 'synthetic-contest', contestCode: 'SYN', contestTitle: 'Synthetic', studentClass: 'C', essayScore: 0, hasEssay: false, isEssayGraded: true, attemptNumber: 1 };
  delete contest.assignmentId;
  assert.equal((await saveContest(contest, { intent: 'student' })).cloudSaved, true);
  ok('shared anonymous create path remains compatible with contest create permission');
  assert.deepEqual([...legacyDisk], originalDisk, 'Legacy draft must remain byte-for-byte intact');
  ok('old draft untouched; contest cache quota error does not block its Cloud acknowledgement');
  }
  if (liveAI) {
    const { runLiveAIReviewSmoke } = await import('./run-live-ai-review-smoke.mjs');
    const report = await runLiveAIReviewSmoke({ fixture: liveFixture, service, save, buildSubmission, select, anon, teacher, teacherUid,
      TeacherResults: adapter.TeacherResults, stepGradingService, realAnalyze, getLiveResponse: () => liveResponse, getLiveRequests: () => liveRequests,
      getTransportStats: () => ({ liveAIRequests: actualHttpRequests, replayedAIResponses: replayedResponses }) });
    assert.deepEqual([...legacyDisk], originalDisk);
    fs.writeFileSync(path.join(tmp, 'live-ai-smoke-report.json'), JSON.stringify(report, null, 2) + '\n');
    console.log((reuseObservedAI ? 'CAPTURED REAL-AI REVIEW SMOKE PASS ' : 'LIVE AI REVIEW SMOKE PASS ') + JSON.stringify(report));
  }
  console.log('SUBMIT FIRST EMULATOR PASS — exact deployed Rules fixture, synthetic records only, production writes: 0');
} finally { await env.cleanup(); }
