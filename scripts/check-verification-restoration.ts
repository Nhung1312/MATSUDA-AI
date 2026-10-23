import assert from 'node:assert/strict';
import { aiService } from '../src/services/aiService';
import { hasTrustedEssaySecondPassAgreement } from '../src/services/verificationOptimizer';
import { buildVerificationParts } from '../server/verificationPrompts';
import { invokeVerification } from './verification-offline-route';
import type { Question } from '../src/types';

assert.ok(String(globalThis.fetch).includes('__examOfflineFetch'));
const originalKey = process.env.GEMINI_API_KEY;
const fakeKey = 'synthetic-server-verification-never-sent-to-network';
process.env.GEMINI_API_KEY = fakeKey;
const stored = new Map<string, string>();
let fullCache = false, calls = 0, endpointCalls = 0;
Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
  getItem: (k: string) => stored.get(k) ?? null,
  setItem: (k: string, v: string) => { if (fullCache) throw new DOMException('full', 'QuotaExceededError'); stored.set(k, v); }
} });
let provider: (body: any) => Promise<any>;
let browserPosts: any[] = [];
(globalThis as any).__examOfflineFetch = async (url: any, init: RequestInit) => {
  const body = JSON.parse(String(init.body));
  if (String(url) === '/api/exam-verification/pass') {
    endpointCalls++; browserPosts.push(body);
    assert.ok(!JSON.stringify({ body, headers: init.headers }).includes(fakeKey));
    const result = await invokeVerification(body);
    assert.ok(!JSON.stringify(result).includes(fakeKey));
    return new Response(JSON.stringify(result.value), { status: result.status, headers: { 'content-type': 'application/json' } });
  }
  assert.ok(String(url).includes('generativelanguage.googleapis.com'), 'Only the guarded synthetic provider is expected');
  calls++;
  const value = await provider(body);
  return new Response(JSON.stringify({ candidates: [{ content: { role: 'model', parts: [{ text: JSON.stringify(value) }] } }] }),
    { status: 200, headers: { 'content-type': 'application/json' } });
};
const essay = (id: string, extra: Partial<Question> = {}): Question => ({ id, order: 1, type: 'essay',
  question: `Giải phương trình x + 2 = 5.\nMã câu giả: ${id}`, options: [], correctAnswer: 'x = 3', points: 0.3, explanation: 'x = 5 - 2 = 3.', ...extra });
const first = (id: string, value = 'x = 3') => ({ questionId: id, proposedAnswer: value,
  matchesCurrentAnswer: true, confidence: 'medium', needsReview: false, reason: 'Giải nhanh, cần đối soát độc lập.' });
const second = (id: string, value = 'x = 3') => ({ questionId: id, pass2Answer: value, confidence: 'high', reason: 'Thử ngược phù hợp.' });
const fixture = async (body: any) => {
  const prompt = body.contents[0].parts[0].text;
  const ids = [...new Set(Array.from(prompt.matchAll(/\[Mã:\s*([^\]]+)\]/g), (m: any) => m[1]))] as string[];
  const independent = prompt.includes('chuyên gia độc lập');
  if (independent) assert.ok(!prompt.includes('[Đáp án hiện tại]') && !prompt.includes('[Lời giải hiện tại]'));
  return ids.map(id => independent ? second(id) : first(id));
};
try {
  provider = fixture;
  const q = essay('restored_essay'); const source = JSON.stringify(q);
  const result = await aiService.verifyExamQuestions({ questions: [q] });
  assert.equal(calls, 2); assert.equal(result[0].needsReview, false);
  assert.equal(result[0].pass2Answer, 'x = 3'); assert.equal(JSON.stringify(q), source);
  assert.ok(browserPosts.every(p => !('apiKey' in p) && !('model' in p)));
  console.log('PASS: no browser key; client -> real server handler -> guarded SDK; restored independent essay agreement');

  const independentPrompt = buildVerificationParts([essay('independent_canary', { correctAnswer: 'SOURCE_ANSWER_CANARY', explanation: 'SOURCE_SOLUTION_CANARY', rubric: 'SOURCE_RUBRIC_CANARY' })], '7', 'Math', 'independent')[0].text;
  assert.ok(!independentPrompt.includes('SOURCE_'));
  const e = essay('strict');
  assert.equal(hasTrustedEssaySecondPassAgreement(e, first(e.id), second(e.id)), true);
  for (const [answer, reference] of [['m=2', 'M=2'], ['x2=3', 'x²=3'], ['x+3', 'x-3']]) {
    assert.equal(hasTrustedEssaySecondPassAgreement({ ...e, correctAnswer: reference }, first(e.id, answer), second(e.id, answer)), false);
  }
  const multipart = essay('parts', { question: 'a) Tìm x. b) Tìm y.', correctAnswer: 'a) x=3' });
  assert.equal(hasTrustedEssaySecondPassAgreement(multipart, first('parts', 'a) x=3'), second('parts', 'a) x=3')), false);
  console.log('PASS: independent prompt has no source answers; symbol case, superscripts, signs and missing subparts remain guarded');

  let before = calls;
  const noKey = await aiService.verifyExamQuestions({ questions: [essay('no_reference', { correctAnswer: '', explanation: '', rubric: '' })] });
  const noFigure = await aiService.verifyExamQuestions({ questions: [essay('no_figure', { question: 'Quan sát hình bên, tính góc A.' })] });
  assert.equal(noKey[0].reviewIssue, 'missing_answer'); assert.equal(noFigure[0].reviewIssue, 'missing_data');
  assert.equal(calls, before); assert.equal(noKey[0].proposedAnswer, '');
  provider = async body => {
    const independent = body.contents[0].parts[0].text.includes('chuyên gia độc lập');
    return [independent ? second('mismatch', 'x = 4') : { ...first('mismatch', 'x = 4'), matchesCurrentAnswer: false }];
  };
  const mismatch = await aiService.verifyExamQuestions({ questions: [essay('mismatch')] });
  assert.equal(mismatch[0].reviewIssue, 'answer_mismatch'); assert.equal(mismatch[0].needsReview, true);
  provider = async () => [{ questionId: 'different-id', proposedAnswer: 'x = 3' }];
  const unknown = await aiService.verifyExamQuestions({ questions: [essay('unknown')] });
  assert.equal(unknown[0].reviewIssue, 'unverified');
  console.log('PASS: answer mismatch, missing answer, missing data and unverified AI are distinct; no source answer changed');

  provider = fixture;
  const seventeen = Array.from({ length: 17 }, (_, i) => essay('synthetic17_'+i, { order: i+1 }));
  const original17 = JSON.stringify(seventeen);
  const checked17 = await aiService.verifyExamQuestions({ questions: seventeen });
  assert.equal(checked17.filter(q => q.needsReview).length, 0);
  assert.equal(JSON.stringify(seventeen), original17);
  before = calls;
  const reused = await aiService.verifyExamQuestions({ questions: seventeen });
  assert.equal(calls, before); assert.ok(reused.every(q => q.reusedResult));
  console.log('PASS: synthetic 17-essay regression no longer reports 17/17 blanket suspicions; repeat consumes zero calls');

  before = calls; fullCache = true;
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=';
  provider = async body => {
    assert.equal(body.contents[0].parts.find((p: any) => p.inlineData).inlineData.data, png.split(',')[1]);
    return fixture(body);
  };
  const withImage = await aiService.verifyExamQuestions({ questions: [essay('exact_image', { imageUrl: png })] });
  assert.equal(withImage[0].needsReview, false); assert.equal(calls-before, 2);
  before = calls;
  provider = fixture;
  await Promise.all([aiService.verifyExamQuestions({ questions: [essay('concurrent')] }), aiService.verifyExamQuestions({ questions: [essay('concurrent')] })]);
  assert.equal(calls-before, 2, 'Two duplicate clicks share the same two-pass operation');
  console.log('PASS: full cache does not prevent verification and exact source image bytes reach both passes');

  provider = async body => {
    if (body.contents[0].parts[0].text.includes('chuyên gia độc lập')) throw Object.assign(new Error('Synthetic upstream failure'), { status: 500 });
    return fixture(body);
  };
  await assert.rejects(() => aiService.verifyExamQuestions({ questions: [essay('failed_second')] }), (e: any) => e.status === 502);
  before = calls; provider = fixture;
  const retried = await aiService.verifyExamQuestions({ questions: [essay('failed_second')] });
  assert.equal(calls-before, 1, 'Retry reuses the completed first pass');
  assert.equal(retried[0].needsReview, false);
  delete process.env.GEMINI_API_KEY;
  const unavailable = await invokeVerification({ questions: [essay('config')], phase: 'source' });
  assert.equal(unavailable.status, 503); assert.equal(unavailable.value.success, false);
  process.env.GEMINI_API_KEY = fakeKey;
  assert.equal((await invokeVerification({ questions: [essay('bad')], phase: 'arbitrary-prompt' })).status, 400);
  await assert.rejects(() => aiService.verifyExamQuestions({ questions: [essay('duplicate'), essay('duplicate')] }), /ID câu hỏi bị trùng/);
  provider = async () => { throw Object.assign(new Error('Synthetic quota'), { status: 429 }); };
  before = calls;
  await assert.rejects(() => aiService.verifyExamQuestions({ questions: [essay('quota')] }), (e: any) => e.status === 429);
  await assert.rejects(() => aiService.verifyExamQuestions({ questions: [essay('quota_again')] }), (e: any) => e.status === 429);
  assert.equal(calls-before, 1, 'Quota stops without SDK retries or another click starting a call');
  console.log('PASS: configuration/invalid requests/duplicates/500/429 remain failures; safe retry skips first pass');
} finally {
  delete (globalThis as any).__examOfflineFetch;
  if (originalKey === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = originalKey;
}
console.log('VERIFICATION RESTORATION: PASS (synthetic data; 0 real Gemini calls; 0 Firebase writes)');
