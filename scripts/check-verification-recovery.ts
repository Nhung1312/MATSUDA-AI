import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import { aiService } from '../src/services/aiService';
import { VERIFICATION_MODEL, VERIFICATION_TIMEOUT_MS } from '../src/services/geminiDiagnostics';
import { verificationFingerprint } from '../src/services/verificationOptimizer';
import { hasVerificationReference } from '../src/utils/verificationUtils';
import { isEssayQuestion } from '../src/utils/questionUtils';
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

  // Actual UI catch must retain completed results and old manual approvals for
  // questions that were not completed, rather than clearing the whole dialog.
  const uiSource = fs.readFileSync(new URL('../src/components/AiSolveExamModal.tsx', import.meta.url), 'utf8');
  const ast = ts.createSourceFile('ui.tsx', uiSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let fn: ts.VariableDeclaration | undefined;
  const visit = (n: ts.Node) => { if (ts.isVariableDeclaration(n) && n.name.getText(ast) === 'handleStartVerification') fn = n; ts.forEachChild(n, visit); }; visit(ast); assert.ok(fn);
  const js = ts.transpileModule(`const ${fn!.getText(ast)};`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  let uiResults: any = { 'tl-12': { proposedAnswer: 'old answer', needsReview: true } }, decisions: any = { 'tl-12': 'keep' }, alerts: string[] = [];
  const deps = { isChecking: false, verificationOperationLock: { current: false }, setIsSolving() {}, questions: changed, grade: '9', topic: 'Toán THCS',
    verificationFingerprint, hasVerificationReference, isEssayQuestion, setProgress() {}, setFilterMode() {},
    aiService: { hasApiKey: () => true, verifyExamQuestions: async () => { throw interrupted; } },
    setVerificationMap: (f: any) => { uiResults = f(uiResults); }, setManualDecisionMap: (f: any) => { decisions = f(decisions); },
    alert: (m: string) => alerts.push(m), console: { warn() {} } };
  await new Function(...Object.keys(deps), js + '\nreturn handleStartVerification;')(...Object.values(deps))();
  assert.equal(Object.keys(uiResults).length, 5); assert.equal(decisions['tl-12'], 'keep');
  assert.equal(uiResults['tl-12'].proposedAnswer, 'old answer'); assert.match(alerts[0], /429/);
  assert.ok(!JSON.stringify(interrupted.diagnostic).includes('synthetic-tier-one-key'));
  console.log('VERIFICATION RECOVERY: PASS (offline, synthetic Toán 9 structure; no paid key or production data)');
} finally { Date.now = realNow; globalThis.setTimeout = realTimeout; }
