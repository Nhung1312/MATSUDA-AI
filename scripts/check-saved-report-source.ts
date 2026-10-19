import assert from 'node:assert/strict';
import { GradingService } from '../src/services/gradingService';
import { StorageService } from '../src/services/storageService';
import { FirestoreService } from '../src/services/firestoreService';
import { stepGradingService } from '../src/services/stepGradingService';
import { buildSubmissionPrintHtml } from '../src/services/submissionPrintService';
import { buildSubmissionExport, buildBatchSubmissionExport } from '../src/services/submissionExportService';
import { captureGradingReference, getSavedGradingReference, getSavedReportQuestion, getSubmissionReportSourceIssue } from '../src/utils/submissionReportUtils';

assert.ok(String(globalThis.fetch).includes('__examOfflineFetch'), 'Offline network guard missing');
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const mc: any = { id: 'mc', order: 1, question: 'Chọn giá trị của 1+1.', type: 'multiple_choice', points: 1,
  options: [{ id: 'A', text: '2' }, { id: 'B', text: '3' }], correctAnswer: 'A', explanation: 'Lời giải cũ.' };
const essay: any = { id: 'essay', order: 2, question: 'Giải x+1=2.', type: 'essay', points: 1,
  options: [], correctAnswer: 'x=1', rubric: 'Kết luận x=1: 1 điểm.', explanation: 'Trừ 1 ở cả hai vế.' };
const assignment: any = { id: 'saved-report-fixture', title: 'Đề giả lập', grade: '6', topic: 'Đại số', totalPoints: 2, questions: [mc, essay] };
const submission: any = { id: 'saved-report-submission', assignmentId: assignment.id, studentName: 'Học sinh giả lập', className: '6A',
  gradingStatus: 'graded', totalScore: 2, maxScore: 2, shuffledQuestions: clone(assignment.questions), answers: [
    { questionId: mc.id, selectedAnswer: 'A', selectedOptionText: '2', correctAnswer: 'A', pointsEarned: 1, maxPoints: 1, isCorrect: true, gradingReference: captureGradingReference(mc) },
    { questionId: essay.id, selectedAnswer: 'TỰ_LUẬN', studentSolutionText: 'x=1', pointsEarned: 1, maxPoints: 1, isCorrect: true, gradingReference: captureGradingReference(essay) }
  ] };
const before = JSON.stringify({ assignment, submission });
const changed = clone(assignment);
changed.questions[0].correctAnswer = 'B';
changed.questions[1].rubric = 'BAREM_MOI: Kết luận x=1: 2 điểm.';
changed.questions[1].explanation = 'LOI_GIAI_MOI';
const html = buildSubmissionPrintHtml(changed, submission, { includeReferenceSolution: true });
assert.match(html, /Đáp án theo kết quả đã lưu:<\/b> A - 2/);
assert.match(html, /Kết luận x=1: 1 điểm/);
assert.match(html, /Trừ 1 ở cả hai vế/);
assert.ok(!html.includes('BAREM_MOI') && !html.includes('LOI_GIAI_MOI'));
assert.match(html, /nguồn đã thay đổi/);
assert.ok(!html.includes('ĐÃ HOÀN TẤT CHẤM'));
assert.equal(getSavedReportQuestion(changed, submission, 'mc')!.correctAnswer, 'A');
assert.equal(JSON.stringify({ assignment, submission }), before);
console.log('PASS: changing a source key/rubric/solution cannot replace the saved report evidence or alter saved scores');

for (const [field, value] of Object.entries({ correctAnswer: 'x=2', rubric: 'Barem khác', explanation: 'Lời giải khác', imageUrl: 'https://example.invalid/new.png', points: 2 })) {
  const edited = clone(assignment); edited.questions[1][field] = value;
  assert.ok(getSubmissionReportSourceIssue(edited, submission), field);
}
const shuffled = clone(submission);
shuffled.shuffledQuestions[0].options = [{ id: 'A', text: '3', originalId: 'B' }, { id: 'B', text: '2', originalId: 'A' }];
shuffled.shuffledQuestions[0].correctAnswer = 'B';
Object.assign(shuffled.answers[0], { selectedAnswer: 'B', correctAnswer: 'B', gradingReference: { ...shuffled.answers[0].gradingReference, correctAnswer: 'B' } });
assert.equal(getSubmissionReportSourceIssue(assignment, shuffled), null, 'Shuffling alone is not a source change');
const legacy = clone(submission); legacy.answers.forEach((answer: any) => delete answer.gradingReference);
assert.equal(getSubmissionReportSourceIssue(assignment, legacy), null);
assert.match(buildSubmissionPrintHtml(changed, legacy), /Barem trong bản đề đã lưu/);
const missing = clone(legacy); delete missing.shuffledQuestions;
const missingHtml = buildSubmissionPrintHtml(changed, missing, { includeReferenceSolution: true });
assert.match(missingHtml, /chưa lưu đủ bản đề hoặc căn cứ chấm/);
assert.match(missingHtml, /Chưa lưu nội dung đề gốc/);
assert.ok(!missingHtml.includes(mc.question) && !missingHtml.includes(essay.question));
assert.ok(!missingHtml.includes('BAREM_MOI') && !missingHtml.includes('LOI_GIAI_MOI'));
console.log('PASS: key/points/figure/rubric/solution edits are flagged; shuffled labels and unchanged legacy snapshots remain valid; missing snapshots do not borrow new rubrics');
const photoQuestion = { ...essay, imageUrl: 'data:image/png;base64,fixture-original-bytes' };
const compact = captureGradingReference(photoQuestion, photoQuestion);
assert.equal(compact.imageUrl, undefined, 'Do not duplicate embedded image bytes');
assert.equal(getSavedGradingReference({ shuffledQuestions: [photoQuestion] } as any, { questionId: essay.id, gradingReference: compact } as any)!.imageUrl, photoQuestion.imageUrl);
assert.equal(captureGradingReference({ ...essay, imageUrl: '' }, photoQuestion).imageUrl, '', 'Removing a figure is distinct from reusing it');

// ZIP STORE entries are intentionally uncompressed; no ZIP dependency is needed for this inspection.
function readZip(bytes: Uint8Array): Map<string, Uint8Array> {
  const entries = new Map<string, Uint8Array>(); let cursor = 0;
  while (new DataView(bytes.buffer, bytes.byteOffset + cursor).getUint32(0, true) === 0x04034b50) {
    const view = new DataView(bytes.buffer, bytes.byteOffset + cursor), size = view.getUint32(18, true);
    const length = view.getUint16(26, true), extra = view.getUint16(28, true);
    const name = new TextDecoder().decode(bytes.slice(cursor + 30, cursor + 30 + length));
    const start = cursor + 30 + length + extra;
    entries.set(name, bytes.slice(start, start + size)); cursor = start + size;
  }
  return entries;
}
const exported = await buildSubmissionExport(changed, submission);
const report = new TextDecoder().decode(readZip(exported.bytes).get('bai-cham.html'));
assert.match(report, /Barem\/hướng dẫn chấm đã lưu<\/h4><div class="text">Kết luận x=1: 1 điểm/);
assert.match(report, /Nguồn hiện tại để đối chiếu/);

assert.match(report, /Câu 1[^<]*Trắc nghiệm/, 'MCQ label must use the complete saved question');
assert.match(report, /Câu 2[^<]*Tự luận/, 'Essay label must use the complete saved question');

const pendingCase = clone(submission);
pendingCase.gradingStatus = 'needs_review';
pendingCase.needsTeacherReview = true;
pendingCase.isProvisional = true;
Object.assign(pendingCase.answers[1], { pointsEarned: 0, aiScore: 0, teacherScore: undefined,
  needsTeacherReview: true, isProvisional: true, aiGradingError: true,
  stepGradingResponse: { success: false, score: 0, maxScore: 1, analysis: [],
    analysisSource: 'unavailable', needsTeacherReview: true } });
const pendingBefore = JSON.stringify(pendingCase);
const pendingExport = await buildSubmissionExport(assignment, pendingCase);
const pendingHtml = new TextDecoder().decode(readZip(pendingExport.bytes).get('bai-cham.html'));
assert.match(pendingHtml, /Điểm đang lưu \(tạm, chưa duyệt\)/);
assert.match(pendingHtml, /KHÔNG phải điểm chấm chính thức/);
assert.equal(JSON.stringify(pendingCase), pendingBefore, 'Report must never mutate ungraded answers');

const mismatchCase = clone(submission);
mismatchCase.answers[1].aiScore = .75;
mismatchCase.answers[1].stepGradingResponse = {
  score: .75, maxScore: 1, success: true, analysisSource: 'ai',
  analysis: [{ stepIndex: 1, studentText: 'x=1', status: 'correct', confidence: .99 }],
  scoreBreakdown: [{ criterion: 'Bước 1', earnedPoints: .35, maxPoints: .5, reason: 'Giả lập' },
                   { criterion: 'Bước 2', earnedPoints: .5, maxPoints: .5, reason: 'Giả lập' }]
};
const mismatchBefore = JSON.stringify(mismatchCase);
const mismatchExport = await buildSubmissionExport(assignment, mismatchCase);
const mismatchHtml = new TextDecoder().decode(readZip(mismatchExport.bytes).get('bai-cham.html'));
assert.match(mismatchHtml, /Điểm AI \(0\.75\) khác tổng các tiêu chí \(0\.85\)/);
assert.equal(JSON.stringify(mismatchCase), mismatchBefore);
console.log('PASS: type labels, provisional AI outages and rubric inconsistencies are reported read-only');

const raw = JSON.parse(new TextDecoder().decode(readZip(exported.bytes).get('du-lieu-cham.json')));
assert.deepEqual(raw.submission, submission);
const batch = await buildBatchSubmissionExport(changed, [submission]);
const manifest = JSON.parse(new TextDecoder().decode(readZip(batch.bytes).get('THONG_TIN_XUAT.json')));
assert.equal(manifest.submissions[0].needsTeacherReview, true);
assert.equal(submission.totalScore, 2); assert.equal(submission.gradingStatus, 'graded');
console.log('PASS: ZIP separates saved evidence from current source; batch manifest warns without modifying historical grades or statuses');

const original = { ai: stepGradingService.analyzeStepByStep, local: StorageService.saveSubmission, cloud: FirestoreService.saveResult };
let calls = 0;
try {
  StorageService.saveSubmission = () => {};
  FirestoreService.saveResult = async () => {};
  stepGradingService.analyzeStepByStep = async () => { calls++; return { success: true, analysisSource: 'ai', score: 1, maxScore: 1,
    analysis: [{ stepIndex: 1, studentLatex: 'x=1', status: 'correct', confidence: .99 }], isAllCorrect: true,
    firstErrorStep: null, firstErrorType: null, firstErrorExplanation: null, totalSteps: 1, correctStepsCount: 1, feedback: 'Giả lập' }; };
  const regraded = await GradingService.gradeSingleSubmissionWithAI({ assignment: changed, submission });
  assert.equal(calls, 1);
  assert.equal(regraded.submission.answers[0].correctAnswer, 'B');
  assert.equal(regraded.submission.answers[0].pointsEarned, 0);
  assert.equal(regraded.submission.answers[1].gradingReference!.rubric, changed.questions[1].rubric);
  assert.equal(getSubmissionReportSourceIssue(changed, regraded.submission), null);
  assert.match(buildSubmissionPrintHtml(changed, regraded.submission), /BAREM_MOI/);
  assert.equal(JSON.stringify({ assignment, submission }), before);
  const manual = clone(submission); manual.answers[1].teacherScore = .8; manual.answers[1].teacherReviewed = true;
  const refreshed = await GradingService.gradeSingleSubmissionWithAI({ assignment: changed, submission: manual, forceRegrade: true });
  assert.equal(refreshed.submission.answers[1].teacherScore, .8);
  assert.equal(refreshed.submission.answers[1].gradingReference!.rubric, essay.rubric);
  assert.equal(refreshed.submission.answers[1].aiGradingReference!.rubric, changed.questions[1].rubric);
  assert.ok(getSubmissionReportSourceIssue(changed, refreshed.submission));
  console.log('PASS: explicit regrading saves its actual source; a protected teacher grade retains its own evidence while new AI evidence is kept separately');
} finally {
  stepGradingService.analyzeStepByStep = original.ai; StorageService.saveSubmission = original.local; FirestoreService.saveResult = original.cloud;
}
console.log('Saved report source checks passed (synthetic records, no live AI or cloud writes).');
