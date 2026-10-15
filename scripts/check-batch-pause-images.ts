import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import { GradingService } from '../src/services/gradingService';
import { StorageService } from '../src/services/storageService';
import { FirestoreService, sanitizeForFirestore } from '../src/services/firestoreService';
import { saveSubmissionConfirmed } from '../src/services/submissionSaveService';
import { stepGradingService } from '../src/services/stepGradingService';
import { selectBatchGradingItems } from '../src/utils/batchGradingUtils';
import { compactSubmissionImages, getSubmissionAnswerImages } from '../src/utils/submissionImageUtils';
import { getSubmissionSummary } from '../src/utils/submissionReviewUtils';
import { buildSubmissionPrintHtml } from '../src/services/submissionPrintService';
import { buildSubmissionExport } from '../src/services/submissionExportService';
import { useMistakeVaultStore } from '../src/store/useMistakeVaultStore';

assert.ok(String(globalThis.fetch).includes('__examOfflineFetch'), 'Mandatory offline guard missing');
const local = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
  getItem: (key: string) => local.get(key) ?? null,
  setItem: (key: string, value: string) => local.set(key, value),
  removeItem: (key: string) => local.delete(key)
} });
const clone = (value: any) => JSON.parse(JSON.stringify(value));
const source = (file: string) => fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8');
const batchText = source('src/components/BatchGradingModal.tsx');

// Exercise the exact UI handlers, and exact Firestore payload builder, with offline dependencies.
function bind(text: string, name: string, dependencies: Record<string, any>): any {
  const ast = ts.createSourceFile('fixture.tsx', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let found: ts.VariableDeclaration | ts.MethodDeclaration | undefined;
  const visit = (node: ts.Node) => {
    if ((ts.isVariableDeclaration(node) || ts.isMethodDeclaration(node)) && node.name.getText(ast) === name) found = node;
    ts.forEachChild(node, visit);
  };
  visit(ast); assert.ok(found, name);
  const code = ts.isMethodDeclaration(found!)
    ? `class Fixture { ${found!.getText(ast)} }; const handler = Fixture.${name};`
    : `const ${found!.getText(ast)}; const handler = ${name};`;
  const js = ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  return new Function(...Object.keys(dependencies), js + '\nreturn handler;')(...Object.values(dependencies));
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(r => { resolve = r; });
  return { promise, resolve };
}
const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4//8/AAX+Av4N70a4AAAAAElFTkSuQmCC';
const secondPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a3foAAAAASUVORK5CYII=';
const shared = [png, secondPng];
const questions = ['one', 'two'].map((id, index) => ({ id, order: index + 1, type: 'essay', question: 'Giải x+1=2.',
  points: 1, options: [], correctAnswer: 'x=1', rubric: 'Biến đổi và kết luận: 1 điểm.' }));
const assignment: any = { id: 'pause-image-fixture', title: 'Đề thử ngoại tuyến', grade: '7', questions, totalPoints: 2 };
const paper: any = { id: 'paper-fixture', assignmentId: assignment.id, studentName: 'Học sinh thử', className: '7A',
  maxScore: 10, totalScore: 0, gradingStatus: 'pending_teacher_grading', submissionSource: 'paper',
  essayImages: shared, shuffledQuestions: questions, answers: questions.map(q => ({ questionId: q.id,
    selectedAnswer: '', pointsEarned: 0, maxPoints: 1, isCorrect: false, essayImages: shared })) };
const response: any = { success: true, analysisSource: 'ai', analysis: [{ stepIndex: 1, studentLatex: 'x=1', status: 'correct', confidence: 1, comment: 'Đúng.' }],
  score: 1, maxScore: 1, isAllCorrect: true, feedback: 'Đúng.', firstErrorStep: null, firstErrorType: null,
  firstErrorExplanation: null, needsTeacherReview: false };

const originalInit = StorageService.initDemoData, originalCloud = FirestoreService.saveResult;
const originalAI = stepGradingService.analyzeStepByStep;
StorageService.initDemoData = () => {};
let cloudWrites: any[] = [];
let cloud: (sub: any) => Promise<void> = async () => {};
FirestoreService.saveResult = async sub => { cloudWrites.push(clone(sub)); await cloud(sub); };

function harness(subs: any[], core = GradingService) {
  const state: any = { items: subs.map(sub => ({ id: sub.id, studentName: sub.studentName, source: 'paper', status: 'pending', submission: sub })),
    running: false, toasts: [], progress: '', controller: { current: null }, subs };
  const dependencies = () => ({ isGrading: state.running, skipAlreadyGraded: true, items: state.items,
    selectBatchGradingItems, filterSource: 'all', filterStatus: 'all', assignment, submissions: state.subs,
    abortControllerRef: state.controller, setIsGrading: (value: boolean) => { state.running = value; },
    setCurrentGradingIndex: () => {}, setProgressText: (value: string) => { state.progress = value; },
    setItems: (fn: any) => { state.items = fn(state.items); }, GradingService: core,
    onSubmissionsUpdated: (subs: any[]) => { state.subs = subs; },
    showToast: (text: string, type: string) => state.toasts.push({ text, type })
  });
  return { state, start: () => bind(batchText, 'handleStartBatch', dependencies())(),
    pause: () => bind(batchText, 'handleStopBatch', dependencies())() };
}

try {
  const before = JSON.stringify(paper);
  const compact = compactSubmissionImages(paper);
  assert.equal(JSON.stringify(paper), before, 'Compaction must not mutate the source');
  assert.deepEqual(compact.essayImages, shared);
  compact.answers.forEach((a: any) => {
    assert.deepEqual(a.essayImages, []);
    assert.deepEqual(getSubmissionAnswerImages(compact, a), shared);
  });
  assert.equal(compactSubmissionImages(compact), compact, 'Already compact data needs no further transformation');
  const special = { ...paper, answers: [
    { ...paper.answers[0], essayImages: [secondPng, png] },
    { ...paper.answers[1], essayImages: [png] },
    { ...paper.answers[1], questionId: 'private', essayImages: ['https://example.test/private.png'] }
  ] };
  assert.equal(compactSubmissionImages(special), special, 'Reordered pages, subsets and private images must remain private');
  assert.deepEqual(getSubmissionSummary(assignment, paper), getSubmissionSummary(assignment, compact));

  const large = 'data:image/jpeg;base64,' + 'A'.repeat(160000);
  const big: any = { ...paper, essayImages: [large], answers: Array.from({ length: 5 }, (_, i) => ({ ...paper.answers[0], questionId: `q${i}`, essayImages: [large] })) };
  const smaller = JSON.stringify(compactSubmissionImages(big));
  assert.equal(smaller.split(large).length - 1, 1);
  assert.ok(smaller.length < JSON.stringify(big).length * .2);
  console.log('PASS: old/new shared photos resolve identically; ordered private pages and scores preserved; 5-question photo payload shrinks by over 80% without recompression');

  // Both persistence paths use compact snapshots, including the direct Firestore writer.
  await saveSubmissionConfirmed(paper);
  assert.deepEqual(cloudWrites[0], compact);
  assert.deepEqual(StorageService.getSubmissions().find(s => s.id === paper.id), compact);
  StorageService.saveSubmission(paper);
  assert.deepEqual(cloudWrites[1], compact);
  let firestorePayload: any;
  await bind(source('src/services/firestoreService.ts'), 'saveResult', {
    doc: () => 'fixture-doc', db: {}, RESULTS_COLLECTION: 'results', compactSubmissionImages, sanitizeForFirestore,
    setDoc: async (_doc: any, payload: any) => { firestorePayload = payload; }
  })(paper);
  assert.deepEqual(firestorePayload.answers, compact.answers);
  assert.deepEqual(firestorePayload.essayImages, shared);
  assert.equal(JSON.stringify(paper), before);

  let added: any[] = [];
  bind(batchText, 'handleSaveNewPaperSubmission', {
    newPaperStudentName: 'Bài giấy mới', newPaperImages: shared, assignment, submissions: [],
    onSubmissionsUpdated: (subs: any[]) => { added = subs; }, setNewPaperStudentName: () => {},
    setNewPaperImages: () => {}, setShowAddPaperForm: () => {}, showToast: () => {}
  })();
  assert.deepEqual(added[0].essayImages, shared);
  assert.ok(added[0].answers.every((a: any) => a.essayImages.length === 0));
  console.log('PASS: exact paper-entry handler and local/confirmed/direct cloud saves store shared pages once; input snapshots unchanged');

  const h = harness([compact, { ...clone(compact), id: 'next-student' }]);
  const aiStarted = deferred<void>(), releaseAI = deferred<void>();
  const cloudStarted = deferred<void>(), releaseCloud = deferred<void>();
  let aiCalls = 0;
  cloudWrites = [];
  stepGradingService.analyzeStepByStep = async request => {
    aiCalls++; assert.deepEqual(request.essayImages, shared, 'AI still receives every original page in order');
    if (aiCalls === 1) { aiStarted.resolve(); await releaseAI.promise; }
    return clone(response);
  };
  cloud = async () => { cloudStarted.resolve(); await releaseCloud.promise; };
  const running = h.start();
  await aiStarted.promise; h.pause(); releaseAI.resolve();
  await cloudStarted.promise;
  assert.equal(aiCalls, 2, 'Pause must allow the remaining questions in this submission to finish');
  assert.equal(h.state.running, true, 'Do not release the queue before saving completes');
  assert.equal(h.state.items[1].status, 'pending');
  assert.match(h.state.progress, /Đang dừng/);
  releaseCloud.resolve(); await running;
  assert.equal(h.state.running, false);
  assert.equal(cloudWrites.length, 1);
  assert.equal(h.state.items[0].status, 'completed');
  assert.equal(h.state.items[0].submission.answers.length, 2);
  assert.equal(h.state.items[1].status, 'pending');
  assert.ok(h.state.items.every((item: any) => item.status !== 'grading'));
  assert.ok(cloudWrites[0].answers.every((a: any) => !a.essayImages.length && a.pointsEarned === 1));
  assert.ok(h.state.toasts.some((toast: any) => /Đã tạm dừng/.test(toast.text)));
  cloud = async () => {};
  await h.start();
  assert.equal(aiCalls, 4); assert.deepEqual(cloudWrites.map(s => s.id), [paper.id, 'next-student']);
  console.log('PASS: pause during question 1 finishes question 2, waits for cloud, saves exactly once, leaves next student untouched; resume skips the saved student');

  // Pause during an AI failure/quota or a save failure must not hide the real warning.
  for (const failure of ['quota', 'cloud']) {
    const fail = harness([{ ...clone(compact), id: 'failure-' + failure }, { ...clone(compact), id: 'untouched-' + failure }]);
    stepGradingService.analyzeStepByStep = async () => {
      fail.pause();
      return failure === 'quota' ? { ...clone(response), success: false, analysisSource: 'unavailable', analysis: [],
        score: 0, needsTeacherReview: true, errorCode: 'quota' } : clone(response);
    };
    cloud = failure === 'cloud' ? async () => { throw Error('Synthetic offline cloud failure'); } : async () => {};
    cloudWrites = [];
    await fail.start();
    assert.equal(cloudWrites.length, 1);
    assert.equal(fail.state.items[1].status, 'pending');
    assert.ok(fail.state.toasts.some((t: any) => failure === 'quota' ? /429/.test(t.text) : /Chưa xác nhận/.test(t.text)));
    assert.ok(!fail.state.toasts.some((t: any) => /Đã tạm dừng/.test(t.text)), 'Do not replace a quota/save warning with successful-pause text');
    assert.equal(fail.state.running, false);
  }
  const fatal = harness([compact, { ...clone(compact), id: 'untouched-error' }], {
    gradeSingleSubmissionWithAI: async () => { fatal.pause(); throw Error('Synthetic source validation failure'); }
  } as any);
  await fatal.start();
  assert.equal(fatal.state.items[0].status, 'failed');
  assert.equal(fatal.state.items[1].status, 'pending');
  console.log('PASS: pause never hides quota, save failure or a fatal grading error; no row remains grading');

  // Reports/tutoring still see the shared photos after compact data is reloaded.
  const reloaded = JSON.parse(JSON.stringify(compact));
  const html = buildSubmissionPrintHtml(assignment, reloaded);
  assert.equal((html.match(/<img /g) || []).length, 2, 'Each original page prints once');
  shared.forEach(image => assert.ok(html.includes(image)));
  const exported = await buildSubmissionExport(assignment, reloaded);
  assert.equal(exported.attachmentCount, 2); assert.equal(exported.missingAttachments, 0);
  // ZIP uses STORE, so exact binary attachments can be checked without a network or unzip dependency.
  for (const image of shared) {
    assert.ok(Buffer.from(exported.bytes).includes(Buffer.from(image.split(',')[1], 'base64')));
  }
  const answerLabel = bind(source('src/components/ExamResultSheetView.tsx'), 'getStudentAnswerLabel', {
    submission: reloaded, getSubmissionAnswerImages, isEssayQuestion: (q: any) => q.type === 'essay'
  });
  assert.match(answerLabel(reloaded.answers[0], questions[0]), /2 ảnh/);
  useMistakeVaultStore.setState({ mistakes: [] });
  useMistakeVaultStore.getState().addMistakesFromSubmission(reloaded, assignment);
  assert.equal(useMistakeVaultStore.getState().mistakes.length, 2);
  assert.ok(useMistakeVaultStore.getState().mistakes.every(m => JSON.stringify(m.essayImages) === JSON.stringify(shared)));
  console.log('PASS: reloaded compact paper is not blank, PDF/ZIP keep both original pages, result labels and mistake-vault tutoring retain shared evidence');

  stepGradingService.analyzeStepByStep = originalAI;
  let requests = 0;
  (globalThis as any).__examOfflineFetch = async (url: unknown) => {
    assert.equal(String(url), '/api/grading/step-analysis'); requests++;
    return new Response(JSON.stringify(response), { headers: { 'content-type': 'application/json' } });
  };
  const request = { questionId: 'compact-cache-proof', questionText: questions[0].question,
    maxPoints: 1, essayImages: paper.answers[0].essayImages };
  await stepGradingService.analyzeStepByStep(request);
  const reused = await stepGradingService.analyzeStepByStep({ ...request,
    essayImages: getSubmissionAnswerImages(reloaded, reloaded.answers[0]) });
  assert.equal(requests, 1); assert.equal(reused.reusedResult, true);
  console.log('PASS: moving legacy shared images out of answers preserves the AI cache key and causes no new grading request');
  console.log('BATCH PAUSE / SHARED IMAGES: PASS (synthetic fixtures; no network or real AI/cloud calls)');
} finally {
  StorageService.initDemoData = originalInit;
  FirestoreService.saveResult = originalCloud;
  stepGradingService.analyzeStepByStep = originalAI;
}
