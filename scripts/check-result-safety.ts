import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import fs from 'node:fs';
import ts from 'typescript';
import { build } from 'esbuild';
import { auth } from '../src/firebase';
import { FirestoreService } from '../src/services/firestoreService';
import { StorageService } from '../src/services/storageService';
import { CloudSessionCache } from '../src/services/cloudSessionCache';
import { PendingResultStore } from '../src/services/pendingResultStore';
import { saveSubmissionConfirmed, saveContestSubmissionConfirmed } from '../src/services/submissionSaveService';
import { versionResult, ResultConflictError } from '../src/services/resultPersistence';
import { buildTeacherBackup, assertSameIds, measureDataGroups } from '../src/services/teacherBackupService';
import type { Submission, Assignment, ContestSubmission } from '../src/types';

assert.ok(String(globalThis.fetch).includes('__examOfflineFetch'), 'Offline guard required');
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const disk = new Map<string, string>([['toan_thcs_submissions_v4', '[{"id":"legacy-only"}]']]);
let quotaFull = true;
Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
  get length() { return disk.size; }, key: (i: number) => [...disk.keys()][i] || null,
  getItem: (k: string) => disk.get(k) ?? null,
  setItem: (k: string, v: string) => { if (quotaFull) throw new DOMException('Quota full', 'QuotaExceededError'); disk.set(k,v); },
  removeItem: () => { throw new Error('Tests must never delete legacy data'); }
} });
await auth.authStateReady();
Object.defineProperty(auth, 'currentUser', { configurable: true, writable: true, value: { uid: 'teacher-fixture', email: 'teacher@example.test' } });
Object.defineProperty(globalThis, 'window', { configurable: true, value: new EventTarget() });
StorageService.initDemoData = () => {};
CloudSessionCache.begin('teacher-fixture');
const state = { records: new Map<string, any>(), chain: Promise.resolve(), writes: 0, failRead: false, offline: false, auth: { currentUser: { uid: 'teacher-fixture' } } };
(globalThis as any).__resultTestCloud = state;
const mock = `
const state = globalThis.__resultTestCloud;
export const auth = state.auth, db = {};
export const doc = (_db, collection, id) => ({ key: collection + '/' + id, id });
export const collection = (_db, name) => name;
export const query = (...args) => args;
export const where = (...args) => args;
export const orderBy = (...args) => args;
export const serverTimestamp = () => 'server-time';
function snapshot(ref) { const v = state.records.get(ref.key); return { id: ref.id, exists: () => v !== undefined, data: () => structuredClone(v) }; }
export const getDocFromServer = async ref => { if (state.failRead || state.offline) throw Error('fixture server read denied / offline'); return snapshot(ref); };
export const getDoc = getDocFromServer;
export const getDocs = async () => { throw Error('Unexpected fixture query'); };
export const getDocsFromServer = getDocs;
export const setDoc = async () => { throw Error('Nontransactional overwrite forbidden'); };
export const addDoc = setDoc, deleteDoc = setDoc;
export function runTransaction(_db, update) {
  const task = state.chain.then(async () => {
    if (state.offline) throw Error('fixture offline');
    const writes = [];
    const result = await update({ get: async ref => snapshot(ref), set: (ref, value) => writes.push([ref,value]) });
    for (const [ref,value] of writes) { state.records.set(ref.key, structuredClone(value)); state.writes++; }
    return result;
  });
  state.chain = task.catch(() => {});
  return task;
}`;
const compiled = await build({
  entryPoints: ['src/services/firestoreService.ts'], bundle: true, write: false, platform: 'node', format: 'esm', packages: 'external',
  plugins: [{ name: 'isolated-firestore', setup(b) {
    b.onResolve({ filter: /(^firebase\/firestore$|\/firebase$)/ }, args => ({ path: args.path, namespace: 'test-firebase' }));
    b.onLoad({ filter: /.*/, namespace: 'test-firebase' }, () => ({ contents: mock, loader: 'js' }));
  } }]
});
const { FirestoreService: isolated } = await import('data:text/javascript;base64,' + Buffer.from(compiled.outputFiles[0].text).toString('base64'));
FirestoreService.saveResult = isolated.saveResult.bind(isolated);
FirestoreService.saveContestSubmission = isolated.saveContestSubmission.bind(isolated);
const fixture = (id: string): Submission => ({
  id, assignmentId: 'exam-fixture', assignmentTitle: 'Offline fixture', classId: 'c', className: 'C', studentName: 'Synthetic student',
  answers: [
    { questionId: 'q1', selectedAnswer: 'x=1', studentSolutionText: 'x=1', isCorrect: false, pointsEarned: 0, maxPoints: 1, needsTeacherReview: true,
      essayImages: ['data:image/png;base64,ORIGINAL_BYTES'], stepAnalysis: [{ stepIndex: 1, studentLatex: 'x=1', status: 'correct', confidence: .99, comment: 'Fixture analysis' }] },
    { questionId: 'q2', selectedAnswer: 'x=2', isCorrect: false, pointsEarned: 0, maxPoints: 1, needsTeacherReview: true }
  ],
  totalScore: 0, maxScore: 2, correctCount: 0, wrongCount: 0, unansweredCount: 0, totalQuestions: 2,
  timeSpentSeconds: 20, startedAt: '2026-01-01', submittedAt: '2026-01-01', gradingStatus: 'needs_review',
  shuffledQuestions: [{ id: 'q1', question: 'Original source', correctAnswer: 'x=1', points: 1, rubric: 'Original rubric' }] as any
});
const edit = (s: Submission, i: number, score: number) => ({
  ...clone(s), answers: s.answers.map((a,j) => j === i ? { ...a, teacherReviewed: true, teacherScore: score, teacherFeedback: 'Teacher comment ' + i, pointsEarned: score, needsTeacherReview: false } : a)
});
const seed = (s: Submission) => state.records.set('results/' + s.id, { ...clone(s), createdAt: 'original-created-at' });
const read = async (id: string) => await isolated.getResultById(id) as Submission;

// Quota does not block reads/writes; the actual Firestore adapter uses transaction + server readback.
seed(fixture('close-reopen'));
const base = await read('close-reopen');
const one = await saveSubmissionConfirmed(edit(base, 0, .75), { intent: 'teacher' });
assert.equal(one.cloudSaved, true); assert.equal(one.localSaved, true);
assert.equal(one.submission!.answers[0].teacherScore, .75);
const reopened = await read('close-reopen');
const two = await saveSubmissionConfirmed(edit(reopened, 1, .5), { intent: 'teacher' });
assert.equal(two.cloudSaved, true);
assert.equal(two.submission!.answers[0].teacherScore, .75);
assert.equal(two.submission!.answers[0].teacherFeedback, 'Teacher comment 0');
assert.equal(two.submission!.answers[1].teacherScore, .5);
assert.deepEqual(two.submission!.answers[0].essayImages, base.answers[0].essayImages);
assert.deepEqual(two.submission!.answers[0].stepAnalysis, base.answers[0].stepAnalysis);
assert.deepEqual(two.submission!.shuffledQuestions, base.shuffledQuestions);
assert.equal((two.submission as any).createdAt, 'original-created-at');
assert.equal(disk.get('toan_thcs_submissions_v4'), '[{"id":"legacy-only"}]');
console.log('PASS quota full: close/reopen q1 then q2; original image, analysis, rubric and createdAt preserved');

seed(fixture('two-tabs'));
const tab1 = await read('two-tabs'), tab2 = await read('two-tabs');
const outcomes = await Promise.allSettled([
  isolated.saveResult(edit(tab1,0,.8), { intent: 'teacher', operationId: 'tab1' }),
  isolated.saveResult(edit(tab2,1,.6), { intent: 'teacher', operationId: 'tab2' })
]);
assert.equal(outcomes.filter(r => r.status === 'fulfilled').length, 1);
assert.ok(outcomes.some(r => r.status === 'rejected' && r.reason.code === 'RESULT_CONFLICT'));
const afterRace = await read('two-tabs');
assert.equal(afterRace.answers[0].teacherScore, .8);
assert.equal(afterRace.answers[1].teacherScore, undefined);
const afterReload = await isolated.saveResult(edit(afterRace,1,.6), { intent:'teacher', operationId:'tab2-reloaded' });
assert.equal(afterReload.answers[0].teacherScore,.8);
assert.equal(afterReload.answers[1].teacherScore,.6);
await assert.rejects(isolated.saveResult(edit(afterReload,0,0), { intent:'student', operationId:'old-student' }), /giáo viên duyệt/);
console.log('PASS two tabs: stale writer rejected; reload preserves both teacher scores; student overwrite rejected');

seed(fixture('legacy-race'));
const legacy = await read('legacy-race');
state.records.get('results/legacy-race').answers[0].teacherFeedback = 'Concurrent legacy client';
await assert.rejects(isolated.saveResult(edit(legacy,1,.3), { intent:'teacher', operationId:'race' }), /Firebase/);
console.log('PASS legacy revision-0 fingerprint detects a concurrent edit before commit');

const retry = fixture('retry-one-id');
state.failRead = true;
const writesBefore = state.writes;
const failedAck = await saveSubmissionConfirmed(retry, { intent:'student' });
assert.equal(failedAck.cloudSaved, false); assert.equal(failedAck.localSaved,true);
assert.ok(failedAck.error?.includes('read denied'));
const pending = await PendingResultStore.list('teacher-fixture');
assert.ok(pending.some(r => r.submission.id === retry.id));
state.failRead = false;
const resent = await saveSubmissionConfirmed(failedAck.pendingSubmission!, { intent:'student' });
assert.equal(resent.cloudSaved,true);
assert.equal(resent.submission!.id,retry.id);
assert.equal(state.writes,writesBefore + 1, 'Retry is an idempotent receipt, not another write or submission');
assert.equal((await PendingResultStore.list('teacher-fixture')).filter(r=>r.submission.id===retry.id).length,0);
console.log('PASS missing server acknowledgement: accurate error, durable pending copy, retry once with the same ID and operation');

state.offline=true;
const disconnected = await saveSubmissionConfirmed(fixture('offline'), { intent:'student' });
assert.equal(disconnected.cloudSaved,false); assert.equal(disconnected.localSaved,true);
assert.equal(state.records.has('results/offline'),false);
state.offline=false;
const pendingBeforeReload = await PendingResultStore.list('teacher-fixture');
assert.ok(pendingBeforeReload.some(r=>r.submission.id==='offline'));
console.log('PASS offline failure retains an independent pending attempt across database reopen');

const mcq = { ...fixture('legacy-mcq'), totalScore:9.5, maxScore:10, gradingStatus:'graded',
  answers:[{ questionId:'old-duplicate-id', selectedAnswer:'B', isCorrect:true, pointsEarned:9.5,maxPoints:10 }] } as Submission;
seed(mcq);
assert.equal((await read(mcq.id)).totalScore,9.5);
assert.deepEqual((await read(mcq.id)).answers,mcq.answers);
const contest = { ...fixture('contest-fixture'), contestId:'contest', contestCode:'C', mcqScore:0,essayScore:0,isEssayGraded:false } as unknown as ContestSubmission;
delete (contest as any).assignmentId;
const contestSaved = await saveContestSubmissionConfirmed(contest, {intent:'student'});
assert.equal(contestSaved.cloudSaved,true);
assert.equal(contestSaved.submission!.id,contest.id);
console.log('PASS old MCQ values read unchanged; online contest uses the same confirmed persistence');

const expectedExams = [{id:'exam-fixture',questions:[],assignmentCode:'FIX'}] as unknown as Assignment[];
const hundredOne = Array.from({length:101},(_,i)=>({...mcq,id:'mcq-'+i}));
CloudSessionCache.set('teacher-fixture','assignments',expectedExams);
CloudSessionCache.set('teacher-fixture','submissions',hundredOne);
FirestoreService.readTeacherBackupSource = async () => ({assignments:expectedExams,submissions:hundredOne,classes:[]});
const fullBackup = await buildTeacherBackup();
assert.equal(fullBackup.submissions.length,101);
assertSameIds('101 IDs',hundredOne,fullBackup.submissions);
assert.equal(fullBackup.legacyBrowserData.toan_thcs_submissions_v4,'[{"id":"legacy-only"}]');
assert.equal(fullBackup.manifest.recordsVerified,true);
assert.throws(()=>assertSameIds('incomplete',hundredOne,hundredOne.slice(0,2)),/không khớp/);
FirestoreService.readTeacherBackupSource = async () => { throw Error('HTTP 403 permission denied'); };
await assert.rejects(buildTeacherBackup(),/403/);
const measured=measureDataGroups(expectedExams,[mcq,fixture('essay')]);
assert.equal(measured.mcqWithoutEssayEvidence.count,1);
assert.equal(measured.essayImageOrAnalysis.count,1);
assert.ok(measured.assignments.utf8Bytes>0);
CloudSessionCache.begin('other-owner');
assert.equal(CloudSessionCache.get('other-owner','submissions').length,0);
assert.equal(disk.get('toan_thcs_submissions_v4'),'[{"id":"legacy-only"}]');
console.log('PASS backup: 101 independent IDs, legacy-only data retained separately, missing IDs/403 rejected, group sizes separate, account cache isolated');

// Actual paper creation handler: one image copy and stable ID on retry, without grading or real writes.
const text=fs.readFileSync('src/components/BatchGradingModal.tsx','utf8');
const ast=ts.createSourceFile('paper.tsx',text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
let declaration:ts.VariableDeclaration|undefined;
function visit(node:ts.Node){if(ts.isVariableDeclaration(node)&&node.name.getText(ast)==='handleSaveNewPaperSubmission')declaration=node;ts.forEachChild(node,visit);}
visit(ast);assert.ok(declaration);
let paper:any, cloudAttempt=0;
const pendingPaper:{current:any}={current:null}, paperSaveLock={current:false};
const deps:any={pendingPaper,paperSaveLock,newPaperStudentName:'Synthetic paper',newPaperImages:['data:image/png;base64,ORIGINAL'],
  assignment:{id:'paper-exam',questions:Array.from({length:18},(_,i)=>({id:'q'+i,points:1}))},submissions:[],
  setSavingPaper:()=>{},setNewPaperStudentName:()=>{},setNewPaperImages:()=>{},setShowAddPaperForm:()=>{},showToast:()=>{},
  onSubmissionsUpdated:(list:any[])=>{paper=list[0];},
  saveSubmissionConfirmed:async(s:any)=>{cloudAttempt++;return cloudAttempt===1?{cloudSaved:false,pendingSubmission:{...s,saveAttemptId:'paper-op'}}:{cloudSaved:true,submission:s};}};
const js=ts.transpileModule('const '+declaration!.getText(ast)+';', {compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
const handler=new Function(...Object.keys(deps),js+';return handleSaveNewPaperSubmission;')(...Object.values(deps));
await handler();const stableId=pendingPaper.current.id;await handler();
assert.equal(paper.id,stableId);assert.equal(JSON.stringify(paper).split('data:image/png;base64,ORIGINAL').length-1,1);
assert.equal(paper.answers.length,18);assert.equal(paper.essayImages[0],'data:image/png;base64,ORIGINAL');
console.log('PASS new paper: original image stored once, same pending ID on retry, no rewrite of historical submissions');
console.log('RESULT SAFETY PASS — synthetic records, network blocked; not a production rules or real-data write test');
