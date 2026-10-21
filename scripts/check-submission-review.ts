import assert from 'node:assert/strict';
import fs from 'node:fs';
import { GradingService } from '../src/services/gradingService';
import { StorageService } from '../src/services/storageService';
import { FirestoreService } from '../src/services/firestoreService';
import { stepGradingService } from '../src/services/stepGradingService';
import { getMultipleChoiceSelectionIssue, getSubmissionSummary, confirmMultipleChoiceSelection, refreshSubmissionTotals } from '../src/utils/submissionReviewUtils';
import { getObjectiveGradingHoldReason } from '../src/utils/objectiveGradingGuard';
import type { Assignment, Submission } from '../src/types';

assert.ok(String(globalThis.fetch).includes('__examOfflineFetch'), 'Mandatory offline network guard missing');
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));
let aiCalls = 0, cloudCalls = 0;
const originals = { save: FirestoreService.saveResult, local: StorageService.saveSubmission, ai: stepGradingService.analyzeStepByStep };
FirestoreService.saveResult = async () => { cloudCalls++; };
StorageService.saveSubmission = () => {};
stepGradingService.analyzeStepByStep = async () => { aiCalls++; throw Error('Unexpected AI call'); };
const q = { id: 'mc', order: 1, question: 'Tìm x: x-2=-10.', type: 'multiple_choice', points: 1,
  options: [{ id: 'A', text: '$x=12$' }, { id: 'B', text: '$x=-8$' }], correctAnswer: 'B' } as const;
const shuffled: any = { ...q, correctAnswer: 'A', options: [
  { id: 'A', originalId: 'B', text: '$x=-8$' }, { id: 'B', originalId: 'A', text: '$x=12$' }
] };
const assignment: any = { id: 'review-fixture', title: 'Toán', grade: '6', topic: 'Đại số', totalPoints: 3,
  questions: [q, { id: 'essay', order: 2, question: 'Giải x+2=5', type: 'essay', points: 1, options: [], correctAnswer: 'x=3' },
    { id: 'blank', order: 3, question: 'Tính 2+2', type: 'essay', points: 1, options: [], correctAnswer: '4' }] };

try {
  // NEW ONLINE attempts: submission is accepted without any Gemini request,
  // but uncertain objective keys must not be marked wrong.
  const objective = { ...q, verificationStatus: 'verified', needsReview: false };
  assert.equal(getObjectiveGradingHoldReason(objective as any), null);
  assert.match(getObjectiveGradingHoldReason(q as any)!, /chưa được thẩm định/);
  assert.match(getObjectiveGradingHoldReason({ ...objective, needsReview: true } as any)!, /chưa được thẩm định/);
  assert.match(getObjectiveGradingHoldReason({ ...objective, correctAnswer: '' } as any)!, /còn trống/);
  assert.match(getObjectiveGradingHoldReason({ ...objective, correctAnswer: 'Z' } as any)!, /không khớp/);
  assert.match(getObjectiveGradingHoldReason({ ...objective,
    options: [{ id: 'A', text: '2' }, { id: 'B', text: '2' }] } as any)!, /trùng nhau/);
  const startedAt = '2026-10-21T00:00:00Z', submittedAt = '2026-10-21T00:01:00Z';
  const params = { studentName: 'Học sinh kiểm thử', classId: '6a', className: '6A',
    startedAt, submittedAt, studentAnswers: { mc: 'B' },
    requireVerifiedObjectiveKeys: true };
  const pendingExam: any = { ...assignment, questions: [q, assignment.questions[1]] };
  const pending = GradingService.gradeSubmission({ ...params, assignment: pendingExam,
    studentSolutions: { essay: 'x=3' } });
  assert.equal(pending.gradingStatus, 'needs_review');
  assert.equal(pending.answers[0].selectedAnswer, 'B');
  assert.equal(pending.answers[0].pointsEarned, 0);
  assert.equal(pending.answers[0].isCorrect, false);
  assert.equal(pending.answers[0].needsTeacherReview, true);
  assert.equal(pending.answers[1].needsTeacherReview, true);
  assert.equal(pending.ungradedCount, 2);
  assert.equal(pending.wrongCount, 0);
  assert.equal(pending.correctCount + pending.wrongCount + pending.unansweredCount + pending.ungradedCount!, 2);
  assert.equal(getSubmissionSummary(pendingExam, pending).pendingCount, 2);
  const acceptedExam: any = { ...assignment, totalPoints: 1, questions: [{ ...q, verificationStatus: 'verified' }] };
  const accepted = GradingService.gradeSubmission({ ...params, assignment: acceptedExam });
  assert.equal(accepted.gradingStatus, 'graded');
  assert.equal(accepted.totalScore, 1); // valid B answer earns 1/1, without AI.
  assert.equal(accepted.correctCount, 1);
  assert.equal(accepted.ungradedCount, 0);
  const invalidKey = GradingService.gradeSubmission({ ...params,
    assignment: { ...assignment, questions: [{ ...q, verificationStatus: 'verified', correctAnswer: 'Z' }] } });
  assert.equal(invalidKey.answers[0].needsTeacherReview, true);
  assert.equal(invalidKey.wrongCount, 0);
  const generalImage = GradingService.gradeSubmission({ ...params,
    assignment: { ...assignment, questions: [assignment.questions[1]] },
    studentAnswers: {}, generalEssayImages: ['data:image/png;base64,AA=='] });
  assert.equal(generalImage.ungradedCount, 1);
  assert.equal(generalImage.wrongCount, 0);
  assert.equal(aiCalls, 0, 'Student submit must not call AI.');
  console.log('PASS: verified objective graded; unverified/bad keys and essay photos pending without counting wrong');
  
  const initial = GradingService.gradeSubmission({ assignment: { ...assignment, questions: [shuffled] },
    studentAnswers: { mc: 'B' }, studentName: 'Học sinh thử', classId: 'c', className: '6A',
    startedAt: '2026-10-14T00:00:00Z', submittedAt: '2026-10-14T00:01:00Z', isShuffled: true });
  assert.equal(initial.answers[0].isCorrect, false); assert.equal(initial.answers[0].correctAnswer, 'A');
  assert.equal(initial.shuffledQuestions![0].correctAnswer, 'A');
  console.log('PASS: wrong student answer retains the correct shuffled key; originalId is never used before the student label');

  const submission: any = { ...initial, assignmentId: assignment.id, maxScore: 3, totalScore: 1.8,
    mcqPoints: 1, essayPoints: .8, correctCount: 1, wrongCount: 2, unansweredCount: 1, gradingStatus: 'graded',
    shuffledQuestions: [shuffled, ...assignment.questions.slice(1)], answers: [
      { questionId: 'mc', selectedAnswer: 'A', selectedOptionText: '$x=12$', originalSelectedLabel: 'A',
        correctAnswer: 'A', isCorrect: true, pointsEarned: 1, maxPoints: 1 },
      { questionId: 'essay', selectedAnswer: 'TỰ_LUẬN', studentSolutionText: 'x=3', isCorrect: false,
        pointsEarned: .8, teacherScore: .8, teacherReviewed: true, teacherFeedback: 'Đã duyệt .8', maxPoints: 1 },
      { questionId: 'blank', selectedAnswer: '', studentSolutionText: '', isCorrect: false,
        pointsEarned: 0, teacherScore: 0, teacherReviewed: true, maxPoints: 1 }
    ] };
  const before = JSON.stringify(submission);
  assert.match(getMultipleChoiceSelectionIssue(shuffled, submission.answers[0])!, /không khớp/);
  const summary = getSubmissionSummary(assignment, submission);
  assert.equal(summary.pendingCount, 1); assert.equal(summary.wrongCount, 1); assert.equal(summary.unansweredCount, 1);
  assert.equal(summary.correctCount + summary.wrongCount + summary.unansweredCount + summary.pendingCount, 3);
  assert.equal(JSON.stringify(submission), before, 'Read-only audit must not modify historical records');
  const regraded = await GradingService.gradeSingleSubmissionWithAI({ assignment, submission });
  assert.equal(regraded.submission.totalScore, 1.8); assert.equal(regraded.submission.answers[0].pointsEarned, 1);
  assert.equal(regraded.submission.gradingStatus, 'needs_review'); assert.equal(regraded.submission.ungradedCount, 1);
  assert.equal(regraded.submission.essayPoints, .8); assert.equal(regraded.submission.mcqPoints, 1);
  assert.equal(regraded.submission.answers[1].teacherScore, .8);
  assert.equal(aiCalls, 0); assert.equal(JSON.stringify(submission), before);
  console.log('PASS: ambiguous legacy choice stays provisional with old points; approved teacher grades, blank answers and component totals are retained; zero AI calls');

  const confirmed = confirmMultipleChoiceSelection(assignment, regraded.submission, 'mc', 'B');
  assert.equal(confirmed.answers[0].selectedOptionText, '$x=12$'); assert.equal(confirmed.answers[0].isCorrect, false);
  assert.equal(confirmed.answers[0].teacherReviewed, true); assert.equal(confirmed.totalScore, .8);
  assert.equal(confirmed.mcqPoints, 0); assert.equal(confirmed.essayPoints, .8); assert.equal(confirmed.ungradedCount, 0);
  const again = await GradingService.gradeSingleSubmissionWithAI({ assignment, submission: confirmed });
  assert.equal(again.submission.answers[0].teacherScore, 0); assert.equal(again.submission.totalScore, .8);
  assert.equal(again.submission.correctCount + again.submission.wrongCount + again.submission.unansweredCount + (again.submission.ungradedCount || 0), 3);
  assert.equal(aiCalls, 0);
  const changedPoints = await GradingService.gradeSingleSubmissionWithAI({ assignment: {
    ...assignment, questions: assignment.questions.map((item: any) => item.id === 'essay' ? { ...item, points: .5 } : item)
  }, submission: confirmed });
  assert.equal(changedPoints.submission.answers.find(a => a.questionId === 'essay')!.pointsEarned, .8);
  assert.equal(changedPoints.submission.answers.find(a => a.questionId === 'essay')!.teacherScore, .8);
  assert.equal(aiCalls, 0, 'Changing current source points cannot silently reduce an approved historical grade');
  assert.throws(() => confirmMultipleChoiceSelection(assignment, submission, 'mc', 'Z'));
  assert.equal(refreshSubmissionTotals(assignment, clone(confirmed)).essayPoints, .8);
  console.log('PASS: only an explicit teacher choice changes the ambiguous MC score; later regrading retains the confirmed choice and other teacher points');

  const writes = cloudCalls;
  await assert.rejects(GradingService.gradeSingleSubmissionWithAI({ assignment: { ...assignment, questions: [q] }, submission }), /không còn/);
  assert.equal(cloudCalls, writes); assert.equal(aiCalls, 0);
  await assert.rejects(GradingService.gradeSingleSubmissionWithAI({ assignment: { ...assignment,
    questions: [...assignment.questions, { ...q, id: 'new-after-student-submitted' }] }, submission }), /thay đổi/);
  await assert.rejects(GradingService.gradeSingleSubmissionWithAI({ assignment: { ...assignment,
    questions: assignment.questions.map((item: any) => item.id === 'mc' ? { ...item, question: 'Một bài toán khác' } : item) }, submission }), /thay đổi/);
  await assert.rejects(GradingService.gradeSingleSubmissionWithAI({ assignment: { ...assignment,
    questions: assignment.questions.map((item: any) => item.id === 'mc' ? { ...item, options: [{ id: 'A', text: 'x=20' }, item.options[1]] } : item) }, submission }), /thay đổi/);
  await assert.rejects(GradingService.gradeSingleSubmissionWithAI({ assignment: { ...assignment,
    questions: assignment.questions.map((item: any) => item.id === 'mc' ? { ...item, type: 'short_answer', options: [] } : item) }, submission }), /thay đổi/);
  assert.equal(cloudCalls, writes); assert.equal(aiCalls, 0);
  console.log('PASS: missing source questions stop regrading before any write or AI call');

  if (process.argv[2]) {
    const data = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
    const original = JSON.stringify(data);
    const realSummary = getSubmissionSummary(data.assignment, data.submission);
    assert.equal(realSummary.pendingCount, 4); assert.equal(realSummary.unansweredCount, 3);
    const real = await GradingService.gradeSingleSubmissionWithAI({ assignment: data.assignment, submission: data.submission });
    assert.equal(real.submission.totalScore, data.submission.totalScore);
    assert.equal(real.submission.ungradedCount, 4); assert.equal(real.submission.unansweredCount, 3);
    assert.equal(real.submission.correctCount + real.submission.wrongCount + real.submission.unansweredCount + real.submission.ungradedCount!, 14);
    assert.equal(JSON.stringify(data), original); assert.equal(aiCalls, 0);
    console.log('PASS: attached historical fixture flags all four ambiguous choices without guessing, changing original data or calling AI/cloud');
  }
} finally {
  FirestoreService.saveResult = originals.save; StorageService.saveSubmission = originals.local;
  stepGradingService.analyzeStepByStep = originals.ai;
}
console.log('Submission review checks passed (mock persistence, network blocked).');
