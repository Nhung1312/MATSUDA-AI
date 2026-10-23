import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { buildStudentSubmission } from '../src/services/studentSubmission';
import { StudentSubmissionReceipt } from '../src/components/StudentSubmissionReceipt';
import { stepGradingService } from '../src/services/stepGradingService';
assert.ok(String(globalThis.fetch).includes('__examOfflineFetch'), 'Offline guard is mandatory');
const question = { id: 'mcq', order: 1, question: '1+1=?', type: 'multiple_choice', points: .5, options: [{ id: 'A', text: '2' }], correctAnswer: 'A' };
const essay = { id: 'essay', order: 2, question: 'Giải x+1=2', type: 'essay', points: 1.5, correctAnswer: 'x=1', rubric: 'SYNTHETIC RUBRIC', options: [] };
const assignment: any = { id: 'synthetic-ui', title: 'Synthetic only', grade: '7', topic: 'Equations', questions: [question, essay], classId: 'c', totalPoints: 2, allowViewResult: true };
const image = 'data:image/png;base64,SYNTHETIC_ORIGINAL';
const text = fs.readFileSync('src/pages/student/StudentExamPage.tsx', 'utf8');
function bind(name: string, dependencies: Record<string, any>, sourceText = text): any {
  const source = ts.createSourceFile('view.tsx', sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let found: ts.VariableDeclaration | undefined;
  function visit(node: ts.Node) { if (ts.isVariableDeclaration(node) && node.name.getText(source) === name) found = node; ts.forEachChild(node, visit); }
  visit(source); assert.ok(found, name);
  const js = ts.transpileModule('const ' + found.getText(source) + ';', { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  return new Function(...Object.keys(dependencies), js + ';return ' + name)(...Object.values(dependencies));
}
let aiCalls = 0;
stepGradingService.analyzeStepByStep = async () => { aiCalls++; throw Error('Unexpected student-side AI grading'); };
const events: string[] = [];
let release!: (value: any) => void;
let sent: any, finish: any;
const ref = { current: false }, pending = { current: null as any };
const finishedRef = { current: null as string | null };
let busy = false, pendingCount: number | null = 0;
let fail = false, calls = 0;
const deps: Record<string, any> = {
  isSubmittingRef: ref, pendingCloudSubmissionRef: pending, finishedSubmissionIdRef: finishedRef, document: { fullscreenElement: false },
  setShowSubmitModal() {}, setIsSubmittingWithAI(value: boolean) { busy = value; },
  buildStudentSubmission, currentAssignment: assignment, answers: { mcq: 'A' }, studentSolutions: { essay: 'x+1=2; x=1' }, essayImagesByQuestion: { essay: [image] }, generalPdfImages: [],
  studentName: 'Synthetic student', classId: 'c', className: 'C', startedAt: '2026-01-01T00:00:00Z', tabSwitchCount: 0, violationEvents: [], isPdfMode: false,
  draftStorageKey: 'synthetic-draft', localStorage: { removeItem() { events.push('draft-removed-after-ack'); } },
  useMistakeVaultStore: { getState: () => ({ addMistakesFromSubmission() {} }) }, soundEffects: { playSuccess() { events.push('success-sound'); } },
  onFinishExam(s: any) { finish = s; events.push('finished'); }, alert(message: string) { events.push('alert:' + message); },
  saveSubmissionConfirmed: async (s: any) => { sent = s; calls++; events.push('write-start'); if (fail) return { cloudSaved: false, localSaved: true, pendingSubmission: { ...s, saveAttemptId: 'stable-ui-operation' }, error: 'Synthetic offline' }; return new Promise(resolve => { release = resolve; }); }
};
const handlers = () => {
  const d = { ...deps, isSubmittingWithAI: busy, recoveredPendingCount: pendingCount };
  d.finishConfirmedSubmission = bind('finishConfirmedSubmission', d);
  d.saveToCloudAndFinish = bind('saveToCloudAndFinish', d);
  return bind('submitExam', d);
};
const task = handlers()();
assert.equal(busy, true); assert.equal(aiCalls, 0); assert.equal(finish, undefined); assert.deepEqual(events, ['write-start']);
assert.equal(sent.gradingStatus, 'pending_teacher_grading'); assert.equal(sent.mcqPoints, .5);
assert.deepEqual(sent.answers[1].essayImages, [image]); assert.equal(sent.answers[1].studentSolutionText, 'x+1=2; x=1');
await handlers()(); assert.equal(calls, 1, 'double-click during upload is ignored');
release({ cloudSaved: true, submission: sent }); await task;
assert.equal(finish.id, sent.id); assert.ok(events.indexOf('finished') > events.indexOf('write-start')); assert.equal(aiCalls, 0);
bind('finishConfirmedSubmission', deps)(sent);
assert.equal(events.filter(e => e === 'finished').length, 1, 'late acknowledgement cannot finish the same submission twice');
console.log('PASS actual StudentExamPage submit handlers: complete mixed work -> wait for Cloud acknowledgement -> finish; zero student AI calls; double click locked');

pending.current = null; finish = undefined; fail = true;
await handlers()(); const originalId = pending.current.id;
assert.equal(finish, undefined); assert.equal(aiCalls, 0);
fail = false; const retry = handlers()(); assert.equal(sent.id, originalId); assert.equal(sent.saveAttemptId, 'stable-ui-operation');
release({ cloudSaved: true, submission: sent }); await retry;
assert.equal(finish.id, originalId); assert.equal(aiCalls, 0);
pending.current = null; pendingCount = 1; finish = undefined; const before = calls;
await handlers()(); assert.equal(calls, before); assert.equal(finish, undefined, 'reloaded pending upload blocks creation of another ID');
console.log('PASS interrupted/reloaded upload keeps the same ID and payload; recovered pending records block a new attempt');

const receipt = renderToStaticMarkup(<StudentSubmissionReceipt submission={sent} assignment={assignment} />);
assert.match(receipt, /NỘP BÀI THÀNH CÔNG/); assert.match(receipt, /có thể đóng trang/); assert.match(receipt, /Chưa chốt/); assert.match(receipt, /0.5<!-- -->\/<!-- -->0.5|0.5\/0.5/);
assert.doesNotMatch(receipt, /Tự luận:.*0 điểm/);
const hidden = renderToStaticMarkup(<StudentSubmissionReceipt submission={sent} assignment={{ ...assignment, allowViewResult: false }} />);
assert.doesNotMatch(hidden, /Điểm trắc nghiệm/);
assert.match(text, /Đang chờ Firebase xác nhận nhận bài/); assert.doesNotMatch(text, /stepGradingService\.analyzeStepByStep/);
console.log('PASS success receipt: objective subtotal/denominator, essays awaiting grading, final score unconfirmed, teacher visibility respected');

let route='', session:any;
const appFinish=bind('handleFinishExam',{
  refreshAllData(){},examSession:{assignment},useLearningProgressStore:{getState:()=>({recordSubmission(){throw Error('QuotaExceededError');}})},
  updateExamSession(fn:any){session=fn({assignment});},navigate(path:string){route=path;}
},fs.readFileSync('src/App.tsx','utf8'));
appFinish(sent);assert.equal(route,'/result');assert.equal(session.submission.id,sent.id);
console.log('PASS actual App: full progress cache cannot block the acknowledged submission/result route');
