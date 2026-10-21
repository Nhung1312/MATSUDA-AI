import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import { aiService } from '../src/services/aiService';
import { VERIFICATION_MODEL, VERIFICATION_TIMEOUT_MS } from '../src/services/geminiDiagnostics';
import { verificationFingerprint } from '../src/services/verificationOptimizer';
import { hasVerificationReference } from '../src/utils/verificationUtils';
import { isEssayQuestion } from '../src/utils/questionUtils';
import { readAIResult, writeAIResult } from '../src/utils/aiResultCache';
assert.ok(String(globalThis.fetch).includes('__examOfflineFetch'));
const data = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
  getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => data.set(k, v), removeItem: (k: string) => data.delete(k)
} });
// Advance the test clock through pacing waits; retain the actual SDK timeout
// and abort signal. No timing wait is removed from the production implementation.
const realNow = Date.now, realTimeout = setTimeout;
let advance = 0, simulateTimeout = false;
Date.now = () => realNow() + advance;
globalThis.setTimeout = ((callback: any, delay: number, ...args: any[]) => {
  if (delay > 0 && delay <= 1500) { advance += delay; return realTimeout(callback, 0, ...args); }
  if (simulateTimeout && delay === VERIFICATION_TIMEOUT_MS) { const timer = realTimeout(callback, 5, ...args); timer.unref = () => timer; return timer; }
  return realTimeout(callback, delay, ...args);
}) as typeof setTimeout;

const questions: any[] = Array.from({ length: 16 }, (_, i) => i < 12
  ? { id: `tn-${i}`, order: i + 1, question: `Tính căn bậc hai số học của ${(i + 1) ** 2}.`, type: 'multiple_choice', points: .25,
      options: [{ id: 'A', text: String(i + 1) }, { id: 'B', text: String(i + 2) }], correctAnswer: 'A' }
  : { id: `tl-${i}`, order: i + 1, question: `Giải phương trình x+${i}= ${i + 1}.`, type: 'essay', points: 1.75,
      options: [], correctAnswer: 'x=1', explanation: `x=${i + 1}-${i}=1.`, rubric: 'Biến đổi và kết luận: 1.75 điểm.' });
let requests: any[] = [], handler: (request: any) => Promise<any>;
(globalThis as any).__examOfflineFetch = async (url: any, init: any) => {
  const request = JSON.parse(String(init.body));
  assert.ok(String(url).includes(VERIFICATION_MODEL), 'No model fallback');
  assert.equal(new Headers(init.headers).get('x-goog-api-key'), 'synthetic-tier-one-key');
  requests.push({ request, at: Date.now() });
  return handler({ ...request, signal: init.signal });
};
const response = (value: any) => new Response(JSON.stringify({ candidates: [{ content: { role: 'model', parts: [{ text: JSON.stringify(value) }] } }] }), { headers: { 'content-type': 'application/json' } });
function successful(medium = false) {
  return async (request: any) => {
    const prompt = request.contents[0].parts[0].text;
    const ids: string[] = [...prompt.matchAll(/\[Mã:\s*([^\]]+)\]/g)].map((m: any) => m[1]);
    const essay = ids.every(id => id.startsWith('tl-'));
    assert.ok(essay || ids.every(id => id.startsWith('tn-')), 'Objective and essay requests must be separate');
    assert.ok(ids.length <= (essay ? 2 : 4));
    const pass2 = prompt.includes('chuyên gia độc lập');
    if (pass2) assert.ok(!prompt.includes('[Đáp án hiện tại]') && !prompt.includes('[Lời giải hiện tại]'));
    return response(ids.map(id => pass2
      ? { questionId: id, pass2Answer: id.startsWith('tl-') ? 'x=1' : 'A', confidence: 'high', reason: 'Independent solution.' }
      : { questionId: id, proposedAnswer: id.startsWith('tl-') ? 'x=1' : 'A', matchesCurrentAnswer: true,
          confidence: medium ? 'medium' : 'high', needsReview: false, reason: 'Synthetic source agreement.' }));
  };
}

try {
  aiService.setApiKey('synthetic-tier-one-key');
  handler = successful();
  const source = JSON.stringify(questions);
  const good = await aiService.verifyExamQuestions({ questions, grade: '9', force: true });
  assert.equal(requests.length, 5); assert.equal(good.length, 16); assert.ok(good.every(q => !q.needsReview));
  for (let i = 1; i < requests.length; i++) assert.ok(requests[i].at - requests[i - 1].at >= 1450, 'Requests must be paced');
  assert.equal(JSON.stringify(questions), source);
  requests = []; await aiService.verifyExamQuestions({ questions, grade: '9' }); assert.equal(requests.length, 0);
  handler = successful(true); requests = [];
  const independent = await aiService.verifyExamQuestions({ questions, grade: '9', force: true });
  assert.equal(requests.length, 10); assert.ok(independent.every(q => q.pass1Answer && q.pass2Answer && !q.needsReview));
  console.log('PASS: Toán 9 fixture 12 TN + 4 TL uses 5 small separated first-pass requests, 10 only when all need independent pass 2; unchanged source uses zero calls');

  handler = successful(); requests = [];
  await Promise.all([aiService.verifyExamQuestions({ questions, grade: '9', force: true }), aiService.verifyExamQuestions({ questions, grade: '9', force: true })]);
  assert.equal(requests.length, 5);
  // Different whole-run keys still share the exact first-batch request.
  requests = [];
  await Promise.all([aiService.verifyExamQuestions({ questions, grade: '9', force: true }), aiService.verifyExamQuestions({ questions: questions.slice(0, 4), grade: '9', force: true })]);
  assert.equal(requests.length, 5);

  const changed = questions.map(q => ({ ...q, question: q.question + ' Nhóm kiểm tra quota.' }));
  const success = successful(); requests = [];
  handler = async req => requests.length === 2
    ? new Response(JSON.stringify({ error: { code: 429, status: 'RESOURCE_EXHAUSTED', message: 'Quota exceeded', details: [
        { '@type': 'type.googleapis.com/google.rpc.QuotaFailure', violations: [{ quotaMetric: 'generativelanguage.googleapis.com/generate_content_paid_tier_requests',
          quotaId: 'GenerateRequestsPerMinutePerProjectPerModel-PaidTier', quotaDimensions: { project: 'synthetic-project-119', model: VERIFICATION_MODEL } }] }
      ] } }), { status: 429, headers: { 'content-type': 'application/json' } }) : success(req);
  let interrupted: any;
  try { await aiService.verifyExamQuestions({ questions: changed, grade: '9' }); } catch (e) { interrupted = e; }
  assert.equal(requests.length, 2); assert.equal(interrupted.status, 429); assert.equal(interrupted.partialResults.length, 4);
  assert.equal(interrupted.diagnostic.project, 'synthetic-project-119');
  assert.deepEqual(interrupted.diagnostic.quotaModels, [VERIFICATION_MODEL]);
  await assert.rejects(() => aiService.verifyExamQuestions({ questions: changed, grade: '9' }));
  assert.equal(requests.length, 2);
  advance += 61000; handler = successful(); requests = [];
  const resumed = await aiService.verifyExamQuestions({ questions: changed, grade: '9' });
  assert.equal(requests.length, 4); assert.equal(resumed.filter(r => r.reusedResult).length, 4);
  console.log('PASS: identical/overlapping runs coalesce; 429 names model/project when supplied, stops immediately, surfaces 4 completed questions and resumes the remaining 12 without repeating them');

  for (const failure of ['404', 'timeout']) {
    const input = questions.slice(0, 8).map(q => ({ ...q, question: q.question + failure }));
    requests = []; simulateTimeout = failure === 'timeout';
    handler = async req => {
      if (requests.length === 1) return success(req);
      if (failure === '404') return new Response(JSON.stringify({ error: { code: 404, message: 'NOT_FOUND' } }), { status: 404 });
      return new Promise((_resolve, reject) => {
        req.signal.addEventListener('abort', () => reject(new DOMException('Request timed out', 'TimeoutError')), { once: true });
      });
    };
    await assert.rejects(() => aiService.verifyExamQuestions({ questions: input, grade: '9' }), (e: any) => {
      assert.equal(e.partialResults.length, 4);
      assert.equal(e.diagnostic.kind, failure === '404' ? 'unsupported' : 'timeout'); return true;
    });
    assert.equal(requests.length, 2, 'No retry or fallback'); simulateTimeout = false;
  }
  console.log('PASS: real SDK abort timeout and 404 stop further groups, retain completed work and never approve failed questions');

  // Recover from transient image failure even with a legacy cached rejection.
  advance += 61000; simulateTimeout = false; handler = successful(); requests = [];
  const imageQuestion = { ...questions[0], id: 'tn-image', question: 'Cho hình bên. Chọn đáp án đúng.', imageUrl: 'https://offline.invalid/source.png' };
  const imageFingerprint = await verificationFingerprint(imageQuestion, '9');
  writeAIResult('verification', imageFingerprint, { questionId: imageQuestion.id, proposedAnswer: '',
    needsReview: true, confidence: 'needs_review', matchesCurrentAnswer: false, reason: 'Chưa đọc được hình nguồn.' });
  const apiFetch = (globalThis as any).__examOfflineFetch;
  let imageAvailable = false;
  (globalThis as any).__examOfflineFetch = async (url: any, init: any) => {
    if (String(url) === imageQuestion.imageUrl) return imageAvailable
      ? new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'image/png' } })
      : new Response('', { status: 503 });
    return apiFetch(url, init);
  };
  const blocked = await aiService.verifyExamQuestions({ questions: [imageQuestion], grade: '9' });
  assert.equal(blocked[0].sourceIssue, true); assert.equal(requests.length, 0);
  imageAvailable = true;
  const activities: string[] = [];
  const recovered = await aiService.verifyExamQuestions({ questions: [imageQuestion], grade: '9', onActivity: value => activities.push(value) });
  assert.equal(requests.length, 1); assert.equal(recovered[0].needsReview, false);
  assert.match(activities[0], /Đang giải/);
  requests = []; await aiService.verifyExamQuestions({ questions: [imageQuestion], grade: '9' });
  assert.equal(requests.length, 0, 'Completed AI answers still reuse cache');
  imageAvailable = false;
  const newImageQuestion = { ...imageQuestion, question: imageQuestion.question + ' Thử lại nguồn.' };
  await aiService.verifyExamQuestions({ questions: [newImageQuestion], grade: '9' });
  assert.equal(readAIResult('verification', await verificationFingerprint(newImageQuestion, '9')), undefined, 'Do not cache transient source failures');
  (globalThis as any).__examOfflineFetch = apiFetch;
  console.log('PASS: old/new image-source failures do not poison retries; restored source reaches Gemini, progress is visible and successful results still reuse cache');

  // Explicit answer generation uses this same guarded engine, but every new
  // answer requires two independent calls and stays pending teacher approval.
  const blankExam = questions.map(q => ({ ...q, id: q.id + '-blank', correctAnswer: '', explanation: '', rubric: '' }));
  const beforeProposal = JSON.stringify(blankExam);
  requests = [];
  handler = async request => {
    const prompt = request.contents[0].parts[0].text;
    assert.ok(!prompt.includes('[Đáp án hiện tại]') && !prompt.includes('[Lời giải hiện tại]'), 'A source-free proposal must not invent a teacher reference');
    if (prompt.includes('chuyên gia độc lập')) assert.ok(!prompt.includes('proposedExplanation') && !prompt.includes('x=1: lời giải đề xuất'), 'Pass 2 cannot see pass 1');
    const result = await successful()(request); const body = await result.json();
    const items = JSON.parse(body.candidates[0].content.parts[0].text);
    for (const item of items) if (item.proposedAnswer) { item.proposedExplanation = 'x=1: lời giải đề xuất'; item.proposedRubric = 'Kết luận: 1.75 điểm'; }
    return response(items);
  };
  const proposals = await aiService.verifyExamQuestions({ questions: blankExam, grade: '9', proposeMissingAnswers: true });
  assert.equal(requests.length, 10); assert.equal(proposals.length, 16);
  assert.ok(proposals.every(q => q.answerProposal && q.needsReview && !q.matchesCurrentAnswer && q.pass1Answer && q.pass2Answer));
  assert.ok(proposals.filter(q => q.questionId.startsWith('tl-')).every(q => q.proposedExplanation && q.proposedRubric));
  assert.equal(JSON.stringify(blankExam), beforeProposal, 'Generation cannot write a source key or approve anything');
  requests = []; await aiService.verifyExamQuestions({ questions: blankExam, grade: '9', proposeMissingAnswers: true });
  assert.equal(requests.length, 0, 'Proposal reuse must not repeat completed independent calls');
  const verifyBlanks = await aiService.verifyExamQuestions({ questions: blankExam, grade: '9' });
  assert.ok(verifyBlanks.every(q => q.sourceIssue && !q.answerProposal), 'Proposal cache must never pretend to verify an absent source');
  assert.equal(requests.length, 0);
  const partialBlanks = blankExam.map(q => ({ ...q, question: q.question + ' Khôi phục đề xuất.' }));
  const proposeSuccess = handler; requests = [];
  handler = async request => requests.length === 3
    ? new Response(JSON.stringify({ error: { code: 429, message: 'RESOURCE_EXHAUSTED' } }), { status: 429 })
    : proposeSuccess(request);
  let proposalError: any;
  try { await aiService.verifyExamQuestions({ questions: partialBlanks, grade: '9', proposeMissingAnswers: true }); } catch (e) { proposalError = e; }
  assert.equal(requests.length, 3); assert.equal(proposalError.status, 429);
  assert.equal(proposalError.partialResults.length, 4); assert.ok(proposalError.partialResults.every((r: any) => r.answerProposal && r.needsReview));
  advance += 61000; requests = []; handler = proposeSuccess;
  const proposalResume = await aiService.verifyExamQuestions({ questions: partialBlanks, grade: '9', proposeMissingAnswers: true });
  assert.equal(requests.length, 8); assert.equal(proposalResume.filter(q => q.reusedResult).length, 4);
  console.log('PASS: source-free 12 TN + 4 TL explicitly generates 16 proposals in 10 independent calls; keeps all pending teacher review, separates cache from source verification, preserves 4 completed proposals on quota and resumes without repeating them');

  // Actual UI catch must retain completed results and old manual approvals for
  // questions that were not completed, rather than clearing the whole dialog.
  const uiSource = fs.readFileSync(new URL('../src/components/AiSolveExamModal.tsx', import.meta.url), 'utf8');
  const ast = ts.createSourceFile('ui.tsx', uiSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let fn: ts.VariableDeclaration | undefined;
  const visit = (n: ts.Node) => { if (ts.isVariableDeclaration(n) && n.name.getText(ast) === 'handleStartVerification') fn = n; ts.forEachChild(n, visit); }; visit(ast); assert.ok(fn);
  const js = ts.transpileModule(`const ${fn!.getText(ast)};`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  let uiResults: any = { 'tl-12': { proposedAnswer: 'old answer', needsReview: true } }, decisions: any = { 'tl-12': 'keep' }, alerts: string[] = [];
  let uiMessage: any;
  const deps = { isChecking: false, verificationOperationLock: { current: false }, setIsSolving() {}, questions: changed, grade: '9', topic: 'Toán THCS',
    verificationFingerprint, hasVerificationReference, isEssayQuestion, setProgress() {}, setFilterMode() {}, setHasApiKey() {}, setVerificationMessage: (value: any) => { uiMessage = value; },
    aiService: { hasApiKey: () => true, verifyExamQuestions: async () => { throw interrupted; } },
    setVerificationMap: (f: any) => { uiResults = f(uiResults); }, setManualDecisionMap: (f: any) => { decisions = f(decisions); },
    alert: (m: string) => alerts.push(m), console: { warn() {} } };
  await new Function(...Object.keys(deps), js + '\nreturn handleStartVerification;')(...Object.values(deps))();
  assert.equal(Object.keys(uiResults).length, 5); assert.equal(decisions['tl-12'], 'keep');
  assert.equal(uiResults['tl-12'].proposedAnswer, 'old answer'); assert.match(alerts[0], /429/);
  assert.match(uiMessage.text, /429/);
  assert.match(uiMessage.text, /4 câu/);
  assert.equal(uiMessage.kind, 'error');
  assert.ok(!JSON.stringify(interrupted.diagnostic).includes('synthetic-tier-one-key'));
  console.log('VERIFICATION RECOVERY: PASS (offline, synthetic Toán 9 structure; no paid key or production data)');
} finally { Date.now = realNow; globalThis.setTimeout = realTimeout; }
