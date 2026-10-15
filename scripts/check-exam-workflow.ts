import assert from 'node:assert/strict';
import { FileParserService } from '../src/services/fileParserService';
import { normalizeMediaExamQuestions, ExamImportError } from '../src/utils/examImportUtils';
import { isEssayQuestion, placeEssayQuestionsLast, getEssayGradingReference } from '../src/utils/questionUtils';
import { shuffleAssignmentQuestionsAndOptions } from '../src/utils/antiCheatUtils';
import { shuffleContestQuestions } from '../src/utils/contestUtils';
import { aiService } from '../src/services/aiService';
import { GradingService } from '../src/services/gradingService';
import { stepGradingService } from '../src/services/stepGradingService';
import { StorageService } from '../src/services/storageService';
import { FirestoreService } from '../src/services/firestoreService';
import type { Assignment, Question, Submission, StepGradingRequest } from '../src/types';

const mcq = Array.from({ length: 10 }, (_, idx) => `Câu ${idx + 1}. Tính ${idx} + 1.\nA. ${idx}\nB. ${idx + 1}\nC. ${idx + 2}\nD. ${idx + 3}`).join('\n');
const essays = Array.from({ length: 4 }, (_, idx) => `Bài ${idx + 1}. Giải phương trình x + ${idx} = ${idx + 3}.\na) Tìm x.\nb) Thử lại kết quả.`).join('\n');
const solutionSheet = `HƯỚNG DẪN CHẤM\nI. TRẮC NGHIỆM\nBảng đáp án: ${Array.from({ length: 10 }, (_, idx) => `${idx + 1}B`).join(' ')}\nII. TỰ LUẬN\n` + Array.from({ length: 4 }, (_, idx) => `Bài ${idx + 1}.\na) x = 3. (0,75 điểm)\nb) Thay x = 3: ${idx + 3} = ${idx + 3}. (1,0 điểm)`).join('\n');
const source = `PHẦN I. TRẮC NGHIỆM (3,0 ĐIỂM)\n${mcq}\nPHẦN II. TỰ LUẬN (7,0 ĐIỂM)\n${essays}\n${solutionSheet}`;

for (const fileType of ['pdf', 'word', 'text'] as const) {
  const result = FileParserService.parseRawText(source, `fixture.${fileType}`, fileType);
  assert.equal(result.totalFound, 14);
  assert.equal(result.multipleChoiceCount, 10);
  assert.equal(result.essayCount, 4);
  assert.ok(Math.abs(result.items.reduce((sum, q) => sum + q.points, 0) - 10) < 0.001);
  assert.ok(result.items.slice(0, 10).every(q => q.correctAnswer === 'B'));
  assert.ok(result.items.slice(10).every(q => q.explanation?.includes('x = 3') && q.rubric?.includes('1,0 điểm')));
  assert.ok(result.items.every(q => !q.question.includes('x = 3') && !q.question.includes('HƯỚNG DẪN CHẤM')));
  assert.equal(result.warnings?.length, 0);
  console.log(`PASS: ${fileType}: 14 questions / 10 MCQ / 4 essays / 10 points; solutions attached to source essays`);
}

for (const label of ['ĐÁP ÁN', 'ĐÁP ÁN VÀ HƯỚNG DẪN CHẤM', 'ĐÁP ÁN – THANG ĐIỂM', 'HƯỚNG DẪN GIẢI', 'LỜI GIẢI CHI TIẾT']) {
  const result = FileParserService.parseRawText(source.replace('HƯỚNG DẪN CHẤM', label));
  assert.equal(result.totalFound, 14, label);
  assert.ok(result.items[13].explanation?.includes('x = 3'), label);
}
console.log('PASS: answer-sheet heading variants do not create extra questions');

const inline = FileParserService.parseRawText('Câu 1. Giải phương trình x + 2 = 5.\nĐáp án: x = 3.\nCâu 2. Tìm x: 2x = 8.\nLời giải:\nx = 4.');
assert.equal(inline.totalFound, 2);
assert.ok(!inline.items[0].question.includes('x = 3'));
assert.equal(inline.items[0].explanation, 'x = 3.');
assert.equal(inline.items[1].explanation, 'x = 4.');
assert.equal(FileParserService.parseRawText(solutionSheet).totalFound, 0);
const unnumbered = FileParserService.parseRawText('Giải phương trình x + 2 = 5.\nĐáp án: x = 3.');
assert.equal(unnumbered.items[0].question, 'Giải phương trình x + 2 = 5.');
assert.equal(unnumbered.items[0].explanation, 'x = 3.');
assert.equal(FileParserService.parseRawText('Đáp án: x = 3.').totalFound, 0);
console.log('PASS: inline essay answers remain explanations; answer-only files produce no questions');

const actualQuestions: Question[] = FileParserService.convertToQuestions(FileParserService.parseRawText(source).items);
const modelPayload = {
  sourceCounts: { questionCount: 14, multipleChoiceCount: 10, essayCount: 4 },
  questions: actualQuestions.map(q => ({ ...q, sourceRole: 'question' })),
  answers: actualQuestions.slice(10).map(q => ({ questionOrder: q.order, explanation: q.explanation, rubric: q.rubric }))
};
const extracted = normalizeMediaExamQuestions(modelPayload);
assert.equal(extracted.length, 14);
assert.ok(extracted[13].explanation?.includes('x = 3'));
assert.throws(() => normalizeMediaExamQuestions({ ...modelPayload, questions: [...modelPayload.questions, { order: 15, question: 'x = 3', type: 'essay' }] }), ExamImportError);
assert.throws(() => normalizeMediaExamQuestions({ questions: [{ order: 1, question: 'Tìm x.' }, { order: 1, question: 'x = 3' }] }), ExamImportError);
assert.throws(() => normalizeMediaExamQuestions({ ...modelPayload, answers: [{ questionOrder: 99, explanation: 'x = 3' }] }), ExamImportError);
const roleResult = normalizeMediaExamQuestions({ questions: [...modelPayload.questions, ...modelPayload.answers.map(a => ({ ...a, sourceRole: 'solution' }))] });
assert.equal(roleResult.length, 14);
const joined = normalizeMediaExamQuestions({ questions: [{ order: 1, type: 'essay', question: 'Tìm x.\nĐáp án: x = 3' }] });
assert.equal(joined[0].question, 'Tìm x.');
assert.equal(joined[0].explanation, 'x = 3');
console.log('PASS: one-response AI normalization separates solutions and rejects count/link mismatches');

const assignment = { id: 'test_assignment', questions: actualQuestions, grade: '7', type: 'text' } as Assignment;
const originalJson = JSON.stringify(actualQuestions);
for (let trial = 0; trial < 30; trial++) {
  const shuffled = shuffleAssignmentQuestionsAndOptions(assignment).questions;
  assert.ok(shuffled.slice(0, 10).every(q => !isEssayQuestion(q)));
  assert.deepEqual(shuffled.slice(10).map(q => q.id), actualQuestions.slice(10).map(q => q.id));
  for (const q of shuffled.slice(0, 10)) {
    assert.equal(q.options.find(o => o.id === q.correctAnswer)?.text, actualQuestions.find(o => o.id === q.id)!.options[1].text);
  }
  for (const shuffleQ of [true, false]) for (const shuffleOpts of [true, false]) {
    const contest = shuffleContestQuestions(actualQuestions, shuffleQ, shuffleOpts);
    assert.deepEqual(contest.slice(10).map(q => q.id), actualQuestions.slice(10).map(q => q.id));
  }
}
assert.equal(JSON.stringify(actualQuestions), originalJson);
const legacyEssay = { ...actualQuestions[10], type: 'multiple_choice', options: ['A', 'B', 'C', 'D'].map(id => ({ id, text: `Phương án ${id}` })) } as Question;
assert.ok(isEssayQuestion(legacyEssay));
const draft = [legacyEssay, actualQuestions[4], actualQuestions[11], actualQuestions[0]];
const restored = placeEssayQuestionsLast(draft, actualQuestions);
assert.deepEqual(restored.map(q => q.id), [actualQuestions[4].id, actualQuestions[0].id, actualQuestions[10].id, actualQuestions[11].id]);
assert.deepEqual(restored[0].options, actualQuestions[4].options);
assert.equal(restored[0].correctAnswer, actualQuestions[4].correctAnswer);
console.log('PASS: fresh and restored exams keep essays last without changing IDs or reshuffling saved options');

const reference = getEssayGradingReference({ correctAnswer: 'Xem lời giải chi tiết', explanation: 'a) x=3; b) thử lại đúng.', rubric: 'a) 0,75 điểm; b) 1 điểm.' });
assert.equal(reference.correctAnswer, '');
assert.ok(reference.rubric.includes('x=3') && reference.rubric.includes('0,75'));
console.log('PASS: grading reference includes imported source explanation and rubric');

// Mandatory preload blocks fetch and all direct HTTP/HTTPS/TCP/TLS connections.
// The SDK uses fixture Responses supplied by this local handler, never the network.
assert.ok(String(globalThis.fetch).includes('__examOfflineFetch'), 'Run with scripts/offline-test-guard.mjs');
const fakeStore = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
  getItem: (k: string) => fakeStore.get(k) ?? null,
  setItem: (k: string, v: string) => fakeStore.set(k, v),
  removeItem: (k: string) => fakeStore.delete(k)
} });
aiService.setApiKey('test-key-unused-no-network');
let generateFixture: (request: any) => Promise<{ text: string }>;
(globalThis as any).__examOfflineFetch = async (_url: any, init: RequestInit) => {
  const request = JSON.parse(String(init.body));
  const fixture = await generateFixture({ contents: [{ text: request.contents[0].parts[0].text }] });
  return new Response(JSON.stringify({ candidates: [{ content: { role: 'model', parts: [{ text: fixture.text }] } }] }), {
    status: 200, headers: { 'content-type': 'application/json' }
  });
};
try {
  let calls = 0;
  const essay = { ...actualQuestions[10], correctAnswer: '', explanation: 'a) x = 3.\n' + 'Kiểm tra từng bước. '.repeat(35) + '\nb) m = 2; M = 5.' };
  generateFixture = async (request: any) => {
    calls++;
    const prompt = request.contents[0].text;
    assert.ok(prompt.includes('m = 2; M = 5.'), 'Full essay solution must reach verifier, including last subpart');
    return { text: JSON.stringify([{ questionId: essay.id, proposedAnswer: 'a) x = 3; b) m = 2; M = 5', matchesCurrentAnswer: true, confidence: 'high', needsReview: false, reason: 'Đủ các ý.' }]) };
  };
  const verified = await aiService.verifyExamQuestions({ questions: [essay], force: true });
  assert.equal(calls, 1);
  assert.equal(verified[0].needsReview, false);
  assert.ok(verified[0].proposedAnswer.includes('m = 2; M = 5'));
  console.log('PASS: essay verification uses full source solution, preserves symbol case, calls once when consistent');

  calls = 0;
  generateFixture = async (request: any) => {
    calls++;
    if (calls === 1) return { text: JSON.stringify([{ questionId: essay.id, proposedAnswer: 'x = 4', matchesCurrentAnswer: false, confidence: 'needs_review', needsReview: true, reason: 'Đáp án sai.' }]) };
    assert.ok(request.contents[0].text.includes('Giải độc lập đầy đủ các ý của câu tự luận'));
    return { text: JSON.stringify({ questionId: essay.id, pass2Answer: 'x = 3', confidence: 'high', reason: 'Kiểm tra lại.' }) };
  };
  const suspect = await aiService.verifyExamQuestions({ questions: [essay], force: true });
  assert.equal(calls, 2);
  assert.equal(suspect[0].needsReview, true);
  console.log('PASS: suspect essay gets a type-specific independent check and stays pending teacher review');

  calls = 0;
  generateFixture = async () => ++calls === 1 ? { text: '[]' } : { text: JSON.stringify({ pass2Answer: 'B', confidence: 'high' }) };
  const incomplete = await aiService.verifyExamQuestions({ questions: [actualQuestions[0]], force: true });
  assert.equal(incomplete[0].needsReview, true);
  console.log('PASS: missing first-pass result cannot be marked verified');
} finally {
  delete (globalThis as any).__examOfflineFetch;
}

// Regrade one stored shuffled submission through the actual shared grading core.
const savedOptions = [
  { id: 'A', text: '0', originalId: 'A' },
  { id: 'B', text: '2', originalId: 'C' },
  { id: 'C', text: '1', originalId: 'B' },
  { id: 'D', text: '3', originalId: 'D' }
];
const sourceMc = { ...actualQuestions[0], points: 1 };
const sourceEssay = { ...actualQuestions[10], points: 2, rubric: '', explanation: 'Đáp án nguồn: x = 3.' };
const snapshotMc = { ...sourceMc, options: savedOptions, correctAnswer: 'C' };
assert.equal(GradingService.evaluateMultipleChoiceAnswer(snapshotMc, 'B').isCorrect, false);
assert.equal(GradingService.evaluateMultipleChoiceAnswer(snapshotMc, 'C').isCorrect, true);
const submission = {
  id: 'test_sub', studentName: 'HS kiểm thử', totalScore: 0, maxScore: 3, answers: [
    { questionId: sourceMc.id, selectedAnswer: 'C', pointsEarned: 1, isCorrect: true, maxPoints: 1 },
    { questionId: sourceEssay.id, selectedAnswer: 'x = 3', pointsEarned: 0, isCorrect: false, maxPoints: 2 }
  ], shuffledQuestions: [snapshotMc, sourceEssay]
} as Submission;
const originalAnalyze = stepGradingService.analyzeStepByStep;
const originalLocalSave = StorageService.saveSubmission;
const originalCloudSave = FirestoreService.saveResult;
let gradingCalls = 0;
try {
  StorageService.saveSubmission = () => undefined;
  FirestoreService.saveResult = async () => undefined;
  stepGradingService.analyzeStepByStep = async (request: StepGradingRequest) => {
    gradingCalls++;
    assert.equal(request.studentSolutionText, 'x = 3');
    assert.ok(request.rubric?.includes('Đáp án nguồn: x = 3.'));
    return { success: true, analysis: [{ stepIndex: 1, studentLatex: 'x = 3', status: 'correct', comment: 'Đúng đáp án nguồn.', confidence: 0.99 }], firstErrorStep: null, firstErrorType: null, firstErrorExplanation: null, totalSteps: 1, correctStepsCount: 1, isAllCorrect: true, score: 2, maxScore: 2, feedback: 'Đúng đáp án nguồn.', analysisSource: 'ai' };
  };
  const graded = await GradingService.gradeSingleSubmissionWithAI({ assignment: { ...assignment, questions: [sourceMc, sourceEssay] }, submission });
  assert.equal(gradingCalls, 1);
  assert.equal(graded.submission.answers[0].pointsEarned, 1);
  assert.equal(graded.submission.answers[1].pointsEarned, 2);
  assert.equal(graded.submission.totalScore, 3);
  assert.equal(submission.totalScore, 0);
  console.log('PASS: regrading preserves the shuffled MC answer and sends the source essay answer to the grading core');
} finally {
  stepGradingService.analyzeStepByStep = originalAnalyze;
  StorageService.saveSubmission = originalLocalSave;
  FirestoreService.saveResult = originalCloudSave;
}
console.log('EXAM IMPORT / SHUFFLE / REGRADE CHECK: PASS (mock AI, no real API calls or cloud writes)');
