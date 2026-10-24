import assert from 'node:assert/strict';
import { aiService } from '../src/services/aiService';
import { hasTrustedEssaySecondPassAgreement, verificationFingerprint } from '../src/services/verificationOptimizer';
import { buildVerificationParts } from '../server/verificationPrompts';
import { invokeVerification } from './verification-offline-route';
import type { Question } from '../src/types';
import { fingerprintAIInput, writeAIResult, readAIResult } from '../src/utils/aiResultCache';
import { isEssayQuestion } from '../src/utils/questionUtils';

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
  const noFigure = await aiService.verifyExamQuestions({ questions: [essay('no_figure', { question: 'Quan sát hình bên, tính góc A.', correctAnswer: '', explanation: '', rubric: '' })] });
  assert.equal(noFigure[0].reviewIssue, 'missing_data'); assert.equal(calls, before);
  const blank = await aiService.verifyExamQuestions({ questions: [essay('blank_question', { question: '', correctAnswer: '', explanation: '' })] });
  assert.equal(blank[0].reviewIssue, 'missing_data'); assert.equal(calls, before);
  provider = async body => {
    const independent = body.contents[0].parts[0].text.includes('chuyên gia độc lập');
    return [independent ? second('mismatch', 'x = 4') : { ...first('mismatch', 'x = 4'), matchesCurrentAnswer: false }];
  };
  const mismatch = await aiService.verifyExamQuestions({ questions: [essay('mismatch')] });
  assert.equal(mismatch[0].reviewIssue, 'answer_mismatch'); assert.equal(mismatch[0].needsReview, true);
  provider = async () => [{ questionId: 'different-id', proposedAnswer: 'x = 3' }];
  const unknown = await aiService.verifyExamQuestions({ questions: [essay('unknown')] });
  assert.equal(unknown[0].reviewIssue, 'unverified');
  console.log('PASS: source mismatch, missing data and unverified AI remain distinct; no source answer changed');

  // Unanswered questions have their own cache revision, not a global invalidation.
  const mc = (id: string, extra: Partial<Question> = {}): Question => ({ id, order: 1, type: 'multiple_choice',
    question: `Tính 1 + 1. Mã câu giả: ${id}`, options: ['A','B','C','D'].map((id, i) => ({ id, text: String(i+1) })), points: 0.5, ...extra });
  const legacyFingerprint = (q: Question) => fingerprintAIInput({ engine: 'verification-v5-server-restored-20261024', model: 'gemini-3.8-flash', grade: '7', topic: 'Toán THCS',
    question: q.question, type: isEssayQuestion(q) ? 'essay' : q.type, options: isEssayQuestion(q) ? [] : q.options, correctAnswer: q.correctAnswer,
    explanation: q.explanation || '', rubric: q.rubric || '', points: q.points, imageUrl: q.imageUrl || '' });
  const noAnswer = mc('no_answer_B');
  const oldFingerprint = await legacyFingerprint(noAnswer);
  writeAIResult('verification', oldFingerprint, { questionId: noAnswer.id, proposedAnswer: '', needsReview: true, reviewIssue: 'missing_answer' });
  assert.notEqual(await verificationFingerprint(noAnswer), oldFingerprint);
  const answered = mc('existing_answer_cache', { correctAnswer: 'B' });
  const oldAnsweredFingerprint = await legacyFingerprint(answered);
  assert.equal(await verificationFingerprint(answered), oldAnsweredFingerprint, 'Answered questions keep exactly their PR62 cache keys');
  writeAIResult('verification', oldAnsweredFingerprint, { questionId: answered.id, order: 1, currentAnswer: 'B', proposedAnswer: 'B', matchesCurrentAnswer: true, confidence: 'high', needsReview: false, reason: 'Existing cached source agreement' });
  const selfSolveProvider = (p1: string, p2 = p1, firstOverrides: any = {}, secondOverrides: any = {}) => async (body: any) => {
    const prompt = body.contents[0].parts[0].text, independent = prompt.includes('chuyên gia độc lập');
    if (independent) assert.ok(!prompt.includes('SOURCE_CANARY') && !prompt.includes('FIRST_REASON_CANARY') && !prompt.includes('[Đáp án hiện tại]'));
    const ids = [...new Set(Array.from(prompt.matchAll(/\[Mã:\s*([^\]]+)\]/g), (m: any) => m[1]))] as string[];
    return ids.map(id => independent ? { questionId: id, pass2Answer: p2, confidence: 'high', reason: 'Giải lại độc lập và thử ngược thỏa điều kiện.', ...secondOverrides }
      : { questionId: id, proposedAnswer: p1, matchesCurrentAnswer: false, confidence: 'high', needsReview: true, reason: 'FIRST_REASON_CANARY: Biến đổi và thay lại vào giả thiết.', ...firstOverrides });
  };
  provider = selfSolveProvider('B'); before = calls;
  const untouched = structuredClone(noAnswer);
  const noKey = await aiService.verifyExamQuestions({ questions: [noAnswer] });
  assert.equal(calls-before, 2, 'No answer requires both passes even with a confident first pass');
  assert.equal(noKey[0].proposedAnswer, 'B'); assert.equal(noKey[0].needsReview, true); assert.equal(noKey[0].matchesCurrentAnswer, false);
  assert.equal(noKey[0].confidence, 'medium'); assert.match(noKey[0].reason, /Hai lượt AI thống nhất – chờ giáo viên xác nhận/);
  assert.deepEqual(noAnswer, untouched); assert.equal(noAnswer.correctAnswer, undefined);
  assert.equal((readAIResult<any>('verification', oldFingerprint)).reviewIssue, 'missing_answer', 'Old cache is left intact');
  before = calls;
  await aiService.verifyExamQuestions({ questions: [answered] });
  await aiService.verifyExamQuestions({ questions: [noAnswer] });
  assert.equal(calls, before, 'Existing answered cache and the completed self-solve are both reused');
  console.log('PASS: unanswered MC proposes B after two passes; never A/verified; only unanswered cache is refreshed');

  const multipartAnswer = 'a) x=3; b) m=2, M=5; c) x>0';
  const unansweredEssay = essay('unanswered_parts', { question: 'a) Tìm x. b) Tìm m và M. c) Nêu điều kiện của x.', correctAnswer: '', explanation: 'SOURCE_CANARY: nguồn chỉ có barem', rubric: 'a) 0,1 điểm; b) 0,1 điểm; c) 0,1 điểm.' });
  provider = selfSolveProvider(multipartAnswer); before = calls;
  const solvedEssay = await aiService.verifyExamQuestions({ questions: [unansweredEssay] });
  assert.equal(calls-before, 2, 'A source solution/rubric without an explicit answer still needs two passes');
  assert.equal(solvedEssay[0].proposedAnswer, multipartAnswer); assert.equal(solvedEssay[0].needsReview, true);
  assert.equal(unansweredEssay.correctAnswer, '');
  const sourcePrompt = buildVerificationParts([unansweredEssay], '7', 'Math', 'source')[0].text;
  assert.ok(sourcePrompt.includes('TỰ GIẢI') && sourcePrompt.includes('matchesCurrentAnswer=false'));
  const independentParts = buildVerificationParts([{...unansweredEssay, correctAnswer:'ORIGINAL_ANSWER_CANARY', explanation:'SOURCE_CANARY', rubric:'SOURCE_CANARY'}], '7', 'Math', 'independent');
  assert.ok(!JSON.stringify(independentParts).includes('CANARY'), 'Independent model receives neither original source nor first-pass solution');
  console.log('PASS: unanswered multipart essay keeps a/b/c, variable case and conditions; independent model receives no source/first result');

  for (const [id, p1, p2, firstFlags, secondFlags] of [
    ['different', 'B', 'C', {}, {}],
    ['invalid_option', 'Z', 'Z', {}, {}],
    ['no_basis', 'B', 'B', { reason: '' }, {}],
    ['missing_basis', 'B', 'B', {}, { reason: 'Thiếu dữ kiện để kết luận.' }],
    ['uncertain_second', 'B', 'B', {}, { confidence: 'needs_review' }]
  ] as const) {
    provider = selfSolveProvider(p1, p2, firstFlags, secondFlags);
    const result = (await aiService.verifyExamQuestions({ questions: [mc('self_'+id)] }))[0];
    assert.equal(result.proposedAnswer, '', 'No single answer is chosen without a grounded agreement: '+id);
    assert.equal(result.needsReview, true); assert.equal(result.pass1Answer, p1); assert.equal(result.pass2Answer, p2);
  }
  for (const [id, p1, p2] of [
    ['missing_part', 'a) x=3; b) m=2', 'a) x=3; b) m=2'],
    ['variable_case', 'a) m=2; b) M=3', 'a) M=2; b) m=3'],
    ['conditions', 'a) x=3; b) x>0', 'a) x=3; b) x>=0'],
    ['superscript', 'a) x²=3; b) m=2', 'a) x2=3; b) m=2']
  ]) {
    provider = selfSolveProvider(p1,p2);
    const q = essay('strict_self_'+id, { question: id==='missing_part' ? 'a) Tìm x. b) Tìm m. c) Kiểm tra điều kiện.' : 'a) Giải. b) Kiểm tra điều kiện.', correctAnswer:'',explanation:'' });
    const result = (await aiService.verifyExamQuestions({questions:[q]}))[0];
    assert.equal(result.proposedAnswer,''); assert.equal(result.needsReview,true);
  }
  provider = selfSolveProvider('a. x=3; b. m=2');
  const dottedQuestion=essay('dotted_self',{question:'a. Tìm x. b. Tìm m. c. Nêu điều kiện.',correctAnswer:'',explanation:''});
  assert.equal((await aiService.verifyExamQuestions({questions:[dottedQuestion]}))[0].proposedAnswer,'','Dotted multipart labels also require every subpart');
  provider = selfSolveProvider('60°');
  const namedLine=essay('named_line_self',{question:'Tính góc tạo bởi đường thẳng a. Đề cho góc bằng 60°.',correctAnswer:'',explanation:''});
  assert.equal((await aiService.verifyExamQuestions({questions:[namedLine]}))[0].proposedAnswer,'60°','A named line followed by a full stop must not be invented as a missing subpart');
  console.log('PASS: disagreement/missing basis/partial solution/condition or symbol differences never auto-select an answer');

  provider = selfSolveProvider('B'); before = calls;
  await Promise.all([aiService.verifyExamQuestions({questions:[mc('duplicate_self_click')]}),aiService.verifyExamQuestions({questions:[mc('duplicate_self_click')]})]);
  assert.equal(calls-before,2);
  const invalid = mc('invalid_self_options', { options:[{id:'A',text:''},{id:'B',text:''}] });
  before=calls;const invalidResult=await aiService.verifyExamQuestions({questions:[invalid]});
  assert.equal(invalidResult[0].reviewIssue,'missing_data');assert.equal(calls,before);
  provider = async body => { if (body.contents[0].parts[0].text.includes('chuyên gia độc lập')) throw Object.assign(Error('Synthetic second-pass outage'),{status:500});return selfSolveProvider('B')(body); };
  const retryQuestion=mc('retry_self');
  await assert.rejects(()=>aiService.verifyExamQuestions({questions:[retryQuestion]}),(e:any)=>e.status===502);
  provider=selfSolveProvider('B');before=calls;
  const retriedSelf=await aiService.verifyExamQuestions({questions:[retryQuestion]});
  assert.equal(calls-before,1);assert.equal(retriedSelf[0].proposedAnswer,'B');assert.equal(retriedSelf[0].needsReview,true);
  console.log('PASS: duplicate self-solve clicks share two calls; missing data stays blocked; failed second pass is not success and retry reuses pass one');

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
  await assert.rejects(() => aiService.verifyExamQuestions({ questions: [mc('quota_self_solve')] }), (e: any) => e.status === 429);
  await assert.rejects(() => aiService.verifyExamQuestions({ questions: [essay('quota_again')] }), (e: any) => e.status === 429);
  assert.equal(calls-before, 1, 'Quota stops without SDK retries or another click starting a call');
  console.log('PASS: configuration/invalid requests/duplicates/500/429 remain failures; safe retry skips first pass');
} finally {
  delete (globalThis as any).__examOfflineFetch;
  if (originalKey === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = originalKey;
}
console.log('VERIFICATION RESTORATION: PASS (synthetic data; 0 real Gemini calls; 0 Firebase writes)');
