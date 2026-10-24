import { invokeVerification } from './verification-offline-route';
import assert from 'node:assert/strict';
import { aiService } from '../src/services/aiService';
import { stepGradingService } from '../src/services/stepGradingService';
import { gradingRouter } from '../server/routes/grading';
import { invalidateEditedVerification, getEssayGradingReference } from '../src/utils/questionUtils';
import { GradingService } from '../src/services/gradingService';
import { StorageService } from '../src/services/storageService';
import { FirestoreService } from '../src/services/firestoreService';
import type { Question, StepGradingRequest, Assignment, Submission } from '../src/types';

assert.ok(String(globalThis.fetch).includes('__examOfflineFetch'), 'Mandatory offline guard is missing');
const localData = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
  getItem: (key: string) => localData.get(key) ?? null,
  setItem: (key: string, value: string) => localData.set(key, value),
  removeItem: (key: string) => localData.delete(key)
} });
aiService.setApiKey('synthetic-key-never-sent-to-network');
const oldKey = process.env.GEMINI_API_KEY;
process.env.GEMINI_API_KEY = 'synthetic-server-key-never-sent-to-network';

const trueNow = Date.now; let clockAdvance = 0; Date.now = () => trueNow() + clockAdvance;
let providerCalls = 0;
let endpointCalls = 0;
let sdkHandler: (request: any) => Promise<{ value?: any; status?: number }>;
const route = (gradingRouter as any).stack.find((layer: any) => layer.route?.path === '/step-analysis').route.stack[0].handle;
async function invokeGrading(body: any): Promise<{ status: number; value: any }> {
  let status = 200;
  let value: any;
  await route({ body }, { status(code: number) { status = code; return this; }, json(data: any) { value = data; return this; } });
  return { status, value };
}
(globalThis as any).__examOfflineFetch = async (url: any, init: RequestInit) => {
  const request = JSON.parse(String(init.body));
  if (String(url) === '/api/exam-verification/pass') {
    const result = await invokeVerification(request);
    return new Response(JSON.stringify(result.value), { status: result.status, headers: { 'content-type': 'application/json' } });
  }
  if (String(url) === '/api/grading/step-analysis') {
    endpointCalls++;
    const result = await invokeGrading(request);
    return new Response(JSON.stringify(result.value), { status: result.status, headers: { 'content-type': 'application/json' } });
  }
  providerCalls++;
  const result = await sdkHandler(request);
  return new Response(JSON.stringify(result.status ? { error: { code: result.status, message: result.status === 429 ? 'fixture quota exhausted' : 'fixture provider failure', status: result.status === 429 ? 'RESOURCE_EXHAUSTED' : 'INTERNAL' } }
    : { candidates: [{ content: { role: 'model', parts: [{ text: JSON.stringify(result.value) }] } }] }), {
      status: result.status || 200, headers: { 'content-type': 'application/json' }
    });
};

const questions: Question[] = Array.from({ length: 14 }, (_, idx) => ({
  id: `eff_q_${idx + 1}`, order: idx + 1, question: `Giá trị của ${idx} + 1 là bao nhiêu?`, type: 'multiple_choice',
  options: [{ id: 'A', text: String(idx) }, { id: 'B', text: String(idx + 1) }, { id: 'C', text: String(idx + 2) }, { id: 'D', text: String(idx + 3) }],
  correctAnswer: 'B', points: 0.25, explanation: `${idx} + 1 = ${idx + 1}.`
}));
function verificationFixture(suspect: boolean) {
  return async (request: any) => {
    const prompt = request.contents[0].parts[0].text;
    const ids = [...prompt.matchAll(/\[Mã:\s*([^\]]+)\]/g)].map((m: any) => m[1]);
    const secondPass = prompt.includes('chuyên gia độc lập');
    if (secondPass) {
      assert.ok(!prompt.includes('[Đáp án hiện tại]') && !prompt.includes('[Lời giải hiện tại]'), 'Pass 2 must be independent');
    }
    return { value: ids.map((id: string) => secondPass
      ? { questionId: id, pass2Answer: 'B', confidence: 'high', reason: 'Thử ngược.' }
      : { questionId: id, proposedAnswer: 'B', matchesCurrentAnswer: !suspect, confidence: suspect ? 'needs_review' : 'high', needsReview: suspect, reason: suspect ? 'Nguồn cần xem lại.' : 'Đủ căn cứ.' }) };
  };
}

try {
  sdkHandler = verificationFixture(false);
  let before = providerCalls;
  const initial = await aiService.verifyExamQuestions({ questions });
  assert.equal(providerCalls - before, 4);
  assert.ok(initial.every(q => !q.needsReview));
  console.log('PASS: healthy 14-question verification uses 4 calls');

  before = providerCalls;
  const reused = await aiService.verifyExamQuestions({ questions });
  assert.equal(providerCalls - before, 0);
  assert.ok(reused.every(q => q.reusedResult));
  console.log('PASS: unchanged exam reuses results with 0 calls');

  before = providerCalls;
  const edited = questions.map((q, idx) => idx === 5 ? { ...q, correctAnswer: 'A' } : q);
  const changed = await aiService.verifyExamQuestions({ questions: edited });
  assert.equal(providerCalls - before, 2);
  assert.ok(changed[5].needsReview);
  assert.ok(changed.filter((_, idx) => idx !== 5).every(q => q.reusedResult));
  console.log('PASS: editing one answer rechecks only that question, never the other 13');

  sdkHandler = verificationFixture(true);
  before = providerCalls;
  const suspicious = await aiService.verifyExamQuestions({ questions, force: true });
  assert.equal(providerCalls - before, 8);
  assert.ok(suspicious.every(q => q.needsReview));
  console.log('PASS: 14 suspected questions use 8 calls (4 first-pass + 4 independent batches), instead of 18');

  const partial = questions.map(q => ({ ...q, question: q.question + ' Kiểm tra lại nguồn A.' }));
  let quotaSequence = 0;
  const goodVerification = verificationFixture(false);
  sdkHandler = async request => ++quotaSequence === 2 ? { status: 429 } : goodVerification(request);
  before = providerCalls;
  await assert.rejects(() => aiService.verifyExamQuestions({ questions: partial }), (error: any) => error.status === 429);
  assert.equal(providerCalls - before, 2);
  sdkHandler = goodVerification;
  await assert.rejects(() => aiService.verifyExamQuestions({ questions: partial }), (e: any) => e.status === 429);
  clockAdvance += 61000;
  before = providerCalls;
  await aiService.verifyExamQuestions({ questions: partial });
  assert.equal(providerCalls - before, 3);
  console.log('PASS: quota stops immediately; retry skips 4 already verified questions');

  const pass1Only = questions.slice(0, 4).map(q => ({ ...q, question: q.question + ' Kiểm tra lượt độc lập.' }));
  let pass2QuotaSequence = 0;
  const suspectedFixture = verificationFixture(true);
  sdkHandler = async request => ++pass2QuotaSequence === 2 ? { status: 429 } : suspectedFixture(request);
  await assert.rejects(() => aiService.verifyExamQuestions({ questions: pass1Only }));
  sdkHandler = suspectedFixture;
  clockAdvance += 61000;
  before = providerCalls;
  await aiService.verifyExamQuestions({ questions: pass1Only });
  assert.equal(providerCalls - before, 1);
  console.log('PASS: a quota error in pass 2 does not repeat a completed pass 1');

  const parallel = questions.slice(0, 4).map(q => ({ ...q, question: q.question + ' Kiểm tra đồng thời.' }));
  sdkHandler = goodVerification;
  before = providerCalls;
  await Promise.all([aiService.verifyExamQuestions({ questions: parallel }), aiService.verifyExamQuestions({ questions: parallel })]);
  assert.equal(providerCalls - before, 1);
  console.log('PASS: duplicate simultaneous verification shares one request');

  before = providerCalls;
  const missingImage = await aiService.verifyExamQuestions({ questions: [{ ...questions[0], question: 'Quan sát hình bên, tính số đo góc A.' }] });
  assert.equal(providerCalls - before, 0);
  assert.ok(missingImage[0].needsReview);
  const placeholder = await aiService.verifyExamQuestions({ questions: [{ ...questions[1], options: [{ id: 'A', text: 'Phương án A' }, { id: 'B', text: '' }] }] });
  assert.equal(providerCalls - before, 0);
  assert.ok(placeholder[0].needsReview);
  console.log('PASS: missing source figures and broken options are flagged locally with 0 AI calls');

  const verifiedSource = { ...questions[0], verificationStatus: 'verified', needsReview: false } as Question;
  assert.equal(invalidateEditedVerification([{ ...verifiedSource, order: 6 }], [verifiedSource])[0].verificationStatus, 'verified');
  assert.equal(invalidateEditedVerification([{ ...verifiedSource, correctAnswer: 'C' }], [verifiedSource])[0].verificationStatus, undefined);
  console.log('PASS: source edits invalidate approval; reordering preserves it');
  sdkHandler = async request => {
    const prompt = request.contents[0].parts[0].text;
    const id = [...prompt.matchAll(/\[Mã:\s*([^\]]+)\]/g)][0][1];
    return { value: [{ questionId: id, proposedAnswer: '3', matchesCurrentAnswer: true, confidence: 'high', needsReview: false, reason: 'Cùng giá trị số.' }] };
  };
  before = providerCalls;
  const short = await aiService.verifyExamQuestions({ questions: [{ ...questions[0], id: 'short_3', type: 'short_answer', options: [], correctAnswer: '3,00', question: 'Giải phương trình x + 2 = 5, điền giá trị x.', explanation: 'x = 5 - 2 = 3.' }] });
  assert.equal(providerCalls - before, 1);
  assert.equal(short[0].needsReview, false);
  console.log('PASS: short numeric answers retain their question type and equivalent decimal formatting does not waste pass 2');
  sdkHandler = async request => {
    const prompt = request.contents[0].parts[0].text;
    const id = [...prompt.matchAll(/\[Mã:\s*([^\]]+)\]/g)][0][1];
    return {value:[prompt.includes('chuyên gia độc lập') ? {questionId:id,pass2Answer:'3',confidence:'high',reason:'Thay x=3 vào x+2=5 cho kết quả đúng.'}
      : {questionId:id,proposedAnswer:'3',matchesCurrentAnswer:false,confidence:'high',needsReview:true,reason:'Giải x+2=5 được x=3.'}]};
  };
  before = providerCalls;
  const recoveredEssay = await aiService.verifyExamQuestions({ questions: [{ ...questions[0], id: 'legacy_eff_essay', type: 'multiple_choice',
    options: ['A', 'B', 'C', 'D'].map(id => ({ id, text: `Phương án ${id}` })),
    question: 'Giải phương trình x + 2 = 5.', correctAnswer: 'Xem lời giải chi tiết', explanation: 'x = 5 - 2 = 3 (0,5đ).' }] });
  assert.equal(providerCalls - before, 2);
  assert.equal(recoveredEssay[0].needsReview, true);
  assert.equal(recoveredEssay[0].proposedAnswer, '3');
  console.log('PASS: recovered legacy essays use essay verification instead of rejecting placeholder MC choices');
  assert.equal(getEssayGradingReference({ correctAnswer: '', rubric: 'Ta có 3 điểm A, B, C thẳng hàng.', explanation: '' }).hasExplicitRubric, false);
  assert.equal(getEssayGradingReference({ correctAnswer: '', rubric: 'a) 0,5đ; b) 1 điểm.', explanation: '' }).hasExplicitRubric, true);
  console.log('PASS: geometry point counts are not mistaken for scoring allocations');

  const gradingFixture = (overrides: any = {}) => ({
    analysis: [{ stepIndex: 1, studentLatex: 'x = 3', status: 'correct', comment: 'Đúng.', confidence: 0.99, ...overrides.step }],
    isAllCorrect: true, score: 0.2, feedback: 'Đúng các tiêu chí.',
    scoreBreakdown: [{ criterion: 'Biến đổi đúng', maxPoints: 0.1, earnedPoints: 0.1, status: 'met' }, { criterion: 'Kết luận đúng', maxPoints: 0.1, earnedPoints: 0.1, status: 'met' }],
    ...overrides.result
  });
  sdkHandler = async () => ({ value: gradingFixture() });
  const request: StepGradingRequest = { questionId: 'eff_essay', questionText: 'Giải phương trình x + 2 = 5.', grade: '7', topic: 'Phương trình', maxPoints: 0.2,
    correctAnswer: 'x = 3', rubric: 'Biến đổi đúng: 0,1 điểm; kết luận đúng: 0,1 điểm.', hasExplicitRubric: true, studentSolutionText: 'x = 3', essayImages: [] };
  before = providerCalls;
  const graded = await stepGradingService.analyzeStepByStep(request);
  assert.equal(providerCalls - before, 1);
  assert.equal(graded.score, 0.2);
  assert.equal(graded.needsTeacherReview, false);
  assert.equal(graded.scoringMethod, 'rubric');
  console.log('PASS: one request performs vision/step/rubric grading; 0.1-point criteria are preserved');

  const beforeEndpoints = endpointCalls;
  before = providerCalls;
  const reverseOrder = Object.fromEntries(Object.entries(request).reverse()) as unknown as StepGradingRequest;
  const cachedGrade = await stepGradingService.analyzeStepByStep(reverseOrder);
  assert.equal(providerCalls - before, 0);
  assert.equal(endpointCalls, beforeEndpoints);
  assert.equal(cachedGrade.reusedResult, true);
  console.log('PASS: unchanged grading input reuses the result, independent of object-field order');

  const originalNow = Date.now;
  Date.now = () => originalNow() + 8 * 24 * 60 * 60 * 1000;
  before = providerCalls;
  const endpointsBeforeReuse = endpointCalls;
  try {
    const savedGrade = await stepGradingService.analyzeStepByStep(request, { previousResult: graded });
    assert.equal(providerCalls - before, 0);
    assert.equal(endpointCalls, endpointsBeforeReuse);
    assert.equal(savedGrade.reusedResult, true);
  } finally { Date.now = originalNow; }
  console.log('PASS: a matching saved student result is reused even when the local cache has expired');

  before = providerCalls;
  await stepGradingService.analyzeStepByStep({ ...request, rubric: request.rubric + ' Kiểm tra theo nguồn mới.' });
  assert.equal(providerCalls - before, 1);
  before = providerCalls;
  await stepGradingService.analyzeStepByStep(request, { force: true });
  assert.equal(providerCalls - before, 1);
  console.log('PASS: changed rubric or explicit regrade causes a new request');

  for (const step of [{ status: 'unknown_status' }, { confidence: undefined }, { confidence: 0.8 }, { contentType: 'crossed_out' }, { studentLatex: '' }]) {
    sdkHandler = async () => ({ value: gradingFixture({ step }) });
    const result = await invokeGrading(request);
    assert.equal(result.value.needsTeacherReview, true);
    assert.equal(result.value.isAllCorrect, false);
  }
  sdkHandler = async () => ({ value: gradingFixture() });
  const noRubric = await invokeGrading({ ...request, rubric: '', hasExplicitRubric: false });
  assert.equal(noRubric.value.needsTeacherReview, true);
  assert.equal(noRubric.value.scoringMethod, 'step_fallback');
  console.log('PASS: invalid/low/missing confidence, cancelled-only work and missing rubric require teacher review');

  sdkHandler = async () => ({ value: gradingFixture({ result: { score: 0.1, scoreBreakdown: [
    { criterion: 'Biến đổi đúng', maxPoints: 0.1, earnedPoints: 0, status: 'not_met' },
    { criterion: 'Kết luận đúng', maxPoints: 0.1, earnedPoints: 0.1, status: 'met' }
  ] } }) });
  const partialGrade = await invokeGrading(request);
  assert.equal(partialGrade.value.score, 0.1);
  assert.equal(partialGrade.value.isAllCorrect, false);
  assert.equal(partialGrade.value.needsTeacherReview, false);
  console.log('PASS: correctly scored incomplete work gets partial credit without a false review warning');
  sdkHandler = async () => ({ value: gradingFixture({ result: { isAllCorrect: false, score: 0.1, scoreBreakdown: [] } }) });
  const unallocated = await invokeGrading({ ...request, rubric: 'Lời giải tham khảo x = 3.', hasExplicitRubric: false });
  assert.equal(unallocated.value.score, 0.1);
  assert.equal(unallocated.value.isAllCorrect, false);
  assert.equal(unallocated.value.needsTeacherReview, true);
  console.log('PASS: missing point allocation never turns correct provided steps into an invented maximum score');
  for (const result of [
    { score: 0.1 },
    { scoreBreakdown: [{ criterion: 'Biến đổi đúng', maxPoints: 0.1, earnedPoints: 0.3, status: 'met' }, { criterion: 'Kết luận đúng', maxPoints: 0.1, earnedPoints: 0.1, status: 'met' }] },
    { scoreBreakdown: [{ criterion: 'Biến đổi đúng', maxPoints: 0.1, earnedPoints: 0.1, status: 'not_met' }, { criterion: 'Kết luận đúng', maxPoints: 0.1, earnedPoints: 0.1, status: 'met' }] }
  ]) {
    sdkHandler = async () => ({ value: gradingFixture({ result }) });
    assert.equal((await invokeGrading(request)).value.needsTeacherReview, true);
  }
  console.log('PASS: invalid component points and contradictory rubric/total scores are not silently finalized');

  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=';
  before = providerCalls;
  sdkHandler = async request => {
    const parts = request.contents[0].parts;
    assert.equal(parts.filter((part: any) => part.inlineData).length, 2);
    assert.ok(parts.some((part: any) => part.text?.includes('HÌNH NGUỒN CỦA ĐỀ BÀI')));
    assert.ok(parts.some((part: any) => part.text?.includes('pageIndex = 0')));
    return { value: gradingFixture() };
  };
  await stepGradingService.analyzeStepByStep({ ...request, questionImageUrl: png, essayImages: [png] });
  assert.equal(providerCalls - before, 1);
  console.log('PASS: source figure and student photo are labelled separately in the same grading request');

  const oldSave = StorageService.saveSubmission;
  const oldCloudSave = FirestoreService.saveResult;
  try {
    StorageService.saveSubmission = () => undefined;
    FirestoreService.saveResult = async submission => ({ ...submission, saveRevision: 1, saveBaseFingerprint: 'offline-confirmed-fixture' });
    const essay: Question = { id: 'manual_essay', order: 1, question: request.questionText, type: 'essay', options: [], correctAnswer: 'x = 3', rubric: request.rubric, points: 0.2 };
    const submission = { id: 'offline_submission', studentName: 'HS mẫu', totalScore: 0.1, maxScore: 0.2, answers: [{ questionId: essay.id, selectedAnswer: '', studentSolutionText: 'x = 3', pointsEarned: 0.1, teacherScore: 0.1, teacherReviewed: true, teacherFeedback: 'Điểm giáo viên đã duyệt.', maxPoints: 0.2, isCorrect: false }] } as Submission;
    before = providerCalls;
    const retained = await GradingService.gradeSingleSubmissionWithAI({ assignment: { id: 'offline_assignment', grade: '7', questions: [essay] } as Assignment, submission });
    assert.equal(providerCalls - before, 0);
    assert.equal(retained.submission.answers[0].teacherScore, 0.1);
    assert.equal(retained.submission.totalScore, 0.1);
    console.log('PASS: normal whole-submission grading preserves a teacher-approved score with 0 requests');
    const sourceMc = { ...questions[0], points: 1, correctAnswer: 'B' };
    const snapshotMc = { ...sourceMc, correctAnswer: 'A', options: [
      { id: 'A', text: '0', originalId: 'A' }, { id: 'B', text: '2', originalId: 'C' },
      { id: 'C', text: '1', originalId: 'B' }, { id: 'D', text: '3', originalId: 'D' }
    ] };
    const correctedSubmission = { ...submission, maxScore: 1, totalScore: 0, shuffledQuestions: [snapshotMc], answers: [{ questionId: sourceMc.id, selectedAnswer: 'C', correctAnswer: 'A', pointsEarned: 0, maxPoints: 1, isCorrect: false }] } as Submission;
    before = providerCalls;
    const corrected = await GradingService.gradeSingleSubmissionWithAI({ assignment: { id: 'offline_corrected', grade: '7', questions: [sourceMc] } as Assignment, submission: correctedSubmission });
    assert.equal(providerCalls - before, 0);
    assert.equal(corrected.submission.totalScore, 1);
    assert.equal(corrected.submission.answers[0].correctAnswer, 'C');
    assert.equal(corrected.submission.shuffledQuestions![0].correctAnswer, 'C');
    console.log('PASS: correcting the source answer remaps it to the student exam and updates the displayed key, with 0 calls');
  } finally {
    StorageService.saveSubmission = oldSave;
    FirestoreService.saveResult = oldCloudSave;
  }

  sdkHandler = async () => ({ status: 500 });
  const failedProvider = await invokeGrading(request);
  assert.equal(failedProvider.status, 502);
  assert.equal(failedProvider.value.success, false);
  assert.equal(failedProvider.value.errorCode, 'gemini');
  assert.ok(failedProvider.value.requestId);
  sdkHandler = async () => ({ status: 503 });
  const overloaded = await invokeGrading(request);
  assert.equal(overloaded.status, 503);
  assert.equal(overloaded.value.errorCode, 'gemini');
  const fixtureKey = process.env.GEMINI_API_KEY;
  try {
    process.env.GEMINI_API_KEY = '';
    const missingConfiguration = await invokeGrading(request);
    assert.equal(missingConfiguration.status, 503);
    assert.equal(missingConfiguration.value.errorCode, 'configuration');
  } finally { process.env.GEMINI_API_KEY = fixtureKey; }
  console.log('PASS: Gemini 500/503 and missing server key return distinct errors with correlation ID, never a successful AI analysis');

  const oldTransport = (globalThis as any).__examOfflineFetch;
  try {
    for (const status of [500, 504]) {
      (globalThis as any).__examOfflineFetch = async () => new Response('platform error', { status });
      const failed = await stepGradingService.analyzeStepByStep({ ...request, questionId: 'http-' + status }, { force: true });
      assert.equal(failed.success, false);
      assert.equal(failed.errorCode, status === 504 ? 'timeout' : 'http');
      assert.ok(failed.feedback.includes('HTTP ' + status));
    }
    let networkAttempts = 0;
    (globalThis as any).__examOfflineFetch = async () => { networkAttempts++; throw new TypeError('Failed to fetch'); };
    const interrupted = await stepGradingService.analyzeStepByStep({ ...request, questionId: 'network-interrupted' }, { force: true });
    assert.equal(interrupted.errorCode, 'network');
    assert.equal(interrupted.needsTeacherReview, true);
    assert.equal(networkAttempts, 1, 'No automatic repeated POST after unknown delivery');
    let calls = 0;
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    (globalThis as any).__examOfflineFetch = async () => { calls++; await gate; return new Response(JSON.stringify(graded)); };
    const pending = [1, 2].map(() => stepGradingService.analyzeStepByStep({ ...request, questionId: 'duplicate-active' }, { force: true }));
    // Let both asynchronous SHA-256 operations enter the shared in-flight request.
    await new Promise<void>(resolve => setTimeout(resolve, 25));
    release();
    assert.ok((await Promise.all(pending)).every(r => r.analysisSource === 'ai'));
    assert.equal(calls, 1);
    console.log('PASS: HTTP 500/504 and browser transport interruption are distinct; duplicate clicks share one POST');
  } finally { (globalThis as any).__examOfflineFetch = oldTransport; }

  sdkHandler = async () => ({ status: 429 });
  before = providerCalls;
  const quotaGrade = await stepGradingService.analyzeStepByStep({ ...request, questionId: 'quota_essay' });
  assert.equal(providerCalls - before, 1);
  assert.equal(quotaGrade.errorCode, 'quota');
  before = providerCalls;
  const heldGrade = await stepGradingService.analyzeStepByStep({ ...request, questionId: 'quota_essay_next' });
  assert.equal(providerCalls - before, 0);
  assert.equal(heldGrade.errorCode, 'quota');
  console.log('PASS: grading quota stops model failover and further repeated requests');

  sdkHandler = async () => ({ value: { score: 0.2, feedback: 'Điểm đề xuất.' } });
  const legacy = await aiService.gradeEssay({ questionText: request.questionText, studentAnswerText: 'x = 3', maxPoints: 0.2, rubric: request.rubric });
  assert.equal(legacy.needsTeacherReview, true);
  assert.equal(legacy.isProvisional, true);
  console.log('PASS: legacy grading produces a provisional proposal requiring teacher approval');

  const serialized = localData.get('toan_thcs_ai_result_cache_v3') || '';
  assert.ok(!serialized.includes('synthetic-key') && !serialized.includes('iVBORw0'));
  console.log('PASS: persisted cache contains neither API keys nor image bytes');
  console.log('AI EFFICIENCY / GRADING SAFETY CHECK: PASS (network blocked; fake responses; no cloud writes)');
} finally {
  Date.now = trueNow;
  delete (globalThis as any).__examOfflineFetch;
  if (oldKey === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = oldKey;
}
