import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeMediaExamQuestions, ExamImportError } from '../src/utils/examImportUtils';
import { auditNewMediaQuestions, findEmptyEssaySubparts } from '../src/utils/mediaImportGuard';

assert.ok(String(globalThis.fetch).includes('__examOfflineFetch'), 'Offline network guard must be active');
const clone = <T>(x:T):T => JSON.parse(JSON.stringify(x));
const payload = {
  sourceCounts: { questionCount: 2, multipleChoiceCount: 1, essayCount: 1 },
  questions: [
    { order: 1, question: 'Tính 2 + 3', type: 'multiple_choice', options: [
      {id: 'A', text: '4'}, {id: 'B', text: '5'}
    ], correctAnswer: 'B', points: .25 },
    { order: 2, question: 'Giải phương trình:\na) $2x+1=7$\nb) $x-5=0$\nc) $x+1=3$', type: 'essay',
      options: [], correctAnswer: '', explanation: '', points: 2 }
  ],
  answers: [{ questionOrder: 2, correctAnswer: '', answer: 'a) $x=3$; b) $x=5$; c) $x=2$',
    solution: 'Giải và thay vào từng phương trình.', markingGuide: 'a) 0,5 điểm; b) 0,5 điểm; c) 1 điểm' }]
};
const original = JSON.stringify(payload);
const normalized = normalizeMediaExamQuestions(payload);
assert.equal(JSON.stringify(payload), original, 'Import must not mutate Gemini source response');
assert.equal(normalized.length, 2);
assert.equal(normalized[0].correctAnswer, 'B');
assert.match(normalized[1].correctAnswer, /x=3/);
assert.match(normalized[1].correctAnswer, /x=2/);
assert.equal(normalized[1].explanation, payload.answers[0].solution);
assert.equal(normalized[1].rubric, payload.answers[0].markingGuide);
assert.equal(auditNewMediaQuestions(normalized).length, 0, 'Complete PDF source needs no warnings');

const pref = clone(payload);
pref.questions[1].correctAnswer = 'x=1';
pref.answers[0].answer = 'x=9';
pref.answers[0].correctAnswer = '';
assert.equal(normalizeMediaExamQuestions(pref)[1].correctAnswer, 'x=1',
  'Nonempty explicit question answer must not be overwritten by an empty answer field');
const answerPriority = clone(pref);
answerPriority.answers[0].correctAnswer = 'x=7';
assert.equal(normalizeMediaExamQuestions(answerPriority)[1].correctAnswer, 'x=7');

const onlySolution = clone(payload);
onlySolution.questions[1].correctAnswer = '';
onlySolution.answers[0].answer = '';
onlySolution.answers[0].solution = '$x=3$';
assert.equal(normalizeMediaExamQuestions(onlySolution)[1].correctAnswer, '$x=3$',
  'Source solution is preserved rather than writing empty correctAnswer');

const missing = clone(payload);
missing.questions[1].correctAnswer = '';
missing.questions[1].explanation = '';
missing.answers = [];
const issues = auditNewMediaQuestions(normalizeMediaExamQuestions(missing));
assert.ok(issues.some(i => i.level === 'warning' && /đáp án|lời giải/.test(i.message)),
  'Missing source answer warns the teacher; do not hallucinate');

assert.deepEqual(findEmptyEssaySubparts('Bài 2: a) x+1 b) c) x+3'), ['b)']);
const bad = clone(payload);
bad.questions[1].question = 'Bài 2: a) $2+3$ b) c) $x+1$';
const errors = auditNewMediaQuestions(normalizeMediaExamQuestions(bad));
assert.ok(errors.some(i => i.level === 'error' && /b\)/.test(i.message)),
  'Incomplete essay subpart must be visible and blocked before adding into an exam');

const mismatched = clone(payload);
mismatched.sourceCounts.questionCount = 3;
assert.throws(() => normalizeMediaExamQuestions(mismatched), ExamImportError,
  'Wrong Gemini count cannot be silently imported');
const duplicate = clone(payload);
duplicate.questions[1].order = 1;
assert.throws(() => normalizeMediaExamQuestions(duplicate), ExamImportError,
  'Duplicate order must be rejected');

const modal = readFileSync('src/components/FileUploadModal.tsx', 'utf8');
assert.match(modal, /auditNewMediaQuestions\(result\.questions, result\)/);
assert.match(modal, /const blockingIssues = aiPdfIssues\.filter/);
assert.match(modal, /Barem nguồn:/);
assert.match(modal, /Đáp án gốc:/);
assert.match(modal, /setAiPdfIssues\(\[\]\)/);
console.log('PASS: preserve source PDF essay answer, solution, rubric; detect empty parts, duplicates, missing references; do not call AI/cloud.');
