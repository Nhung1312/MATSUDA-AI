import type { Assignment, Question, StudentAnswer, Submission } from '../types';
import { isEssayQuestion } from './questionUtils';

const textKey = (text?: string) => String(text || '').normalize('NFC').trim().replace(/\s+/g, ' ');
const labelKey = (text?: string) => textKey(text).replace(/^[.(\s]+|[.)\s]+$/g, '').toUpperCase();

export const hasTeacherGrade = (answer: StudentAnswer) => Number.isFinite(answer.teacherScore)
  && (answer.teacherReviewed === true || !/^\[(?:Gemini|Matsuda) AI\]/i.test(answer.teacherFeedback || ''));

export function getSubmissionSourceIssue(assignment: Assignment, submission: Submission): string | null {
  const snapshot = submission.shuffledQuestions;
  if (!snapshot?.length) return null;
  if (assignment.questions.length !== snapshot.length || assignment.questions.some(q => !snapshot.some(saved => saved.id === q.id))) {
    return 'Danh sách câu trong đề nguồn đã thay đổi so với bản học sinh nhận. Cần đối chiếu đề trước khi chấm lại; điểm cũ được giữ.';
  }
  if (snapshot.some(saved => {
    const source = assignment.questions.find(q => q.id === saved.id);
    return source && textKey(source.question) !== textKey(saved.question);
  })) return 'Nội dung đề nguồn đã thay đổi so với bản học sinh nhận. Cần đối chiếu đề trước khi chấm lại; điểm cũ được giữ.';
  if (snapshot.some(saved => {
    const source = assignment.questions.find(q => q.id === saved.id)!;
    const essay = isEssayQuestion(source), savedEssay = isEssayQuestion(saved);
    if (essay !== savedEssay) return true;
    if (essay) return false;
    const kind = (q: Question) => String(q.type).replace(/[_\s-]/g, '').toLowerCase();
    if (kind(source) !== kind(saved)) return true;
    return JSON.stringify((source.options || []).map(o => textKey(o.text)).sort())
      !== JSON.stringify((saved.options || []).map(o => textKey(o.text)).sort());
  })) return 'Loại câu hoặc nội dung phương án trong đề nguồn đã thay đổi. Cần đối chiếu bản học sinh nhận trước khi chấm lại; điểm cũ được giữ.';
  return null;
}

export function getStudentQuestion(assignment: Assignment, submission: Submission, id: string): Question | undefined {
  const source = assignment.questions.find(q => q.id === id);
  const saved = submission.shuffledQuestions?.find(q => q.id === id);
  if (!saved) return source;
  if (!source || isEssayQuestion(source) || !source.options?.length) return saved;
  const correct = source.options.find(o => labelKey(o.id) === labelKey(source.correctAnswer))
    || source.options.find(o => textKey(o.text) === textKey(source.correctAnswer));
  const mapped = correct && (saved.options?.find(o => (o as any).originalId === correct.id && textKey(o.text) === textKey(correct.text))
    || saved.options?.find(o => textKey(o.text) === textKey(correct.text)));
  return mapped ? { ...saved, correctAnswer: mapped.id } : saved;
}

export function getCorrectOptionLabel(question: Question): string {
  const options = question.options || [];
  // A shuffled question already uses the labels on the student's exam. Never
  // interpret that label as originalId first or derive the key from isCorrect.
  const match = options.find(o => labelKey(o.id) === labelKey(question.correctAnswer))
    || options.find(o => textKey(o.text) === textKey(question.correctAnswer));
  return match?.id || question.correctAnswer || '';
}

export function getMultipleChoiceSelectionIssue(question: Question | undefined, answer: StudentAnswer): string | null {
  if (!question || isEssayQuestion(question) || question.type === 'short_answer' || !question.options?.length) return null;
  if (!textKey(answer.selectedAnswer) && !textKey(answer.selectedOptionText)) return null;
  const selected = question.options.find(o => labelKey(o.id) === labelKey(answer.selectedAnswer))
    || question.options.find(o => textKey(o.text) === textKey(answer.selectedAnswer));
  if (!selected) return 'Nhãn lựa chọn đã lưu không khớp phương án trên đề học sinh. Cần giáo viên đối chiếu.';
  if (textKey(answer.selectedOptionText) && textKey(answer.selectedOptionText) !== textKey(selected.text)) {
    return 'Nhãn lựa chọn và nội dung phương án đã lưu không khớp sau đảo đề. Chưa đủ căn cứ để tự chọn lại hoặc đổi điểm.';
  }
  const original = (selected as any).originalId || selected.id;
  if (textKey(answer.originalSelectedLabel) && labelKey(answer.originalSelectedLabel) !== labelKey(original)) {
    return 'Nhãn lựa chọn gốc và phương án trên đề học sinh không khớp. Cần giáo viên đối chiếu.';
  }
  return null;
}

export function isSubmissionAnswerBlank(submission: Submission, answer: StudentAnswer, question?: Question): boolean {
  if (!question || !isEssayQuestion(question)) return !textKey(answer.selectedAnswer) && !textKey(answer.selectedOptionText);
  const typed = textKey(answer.studentSolutionText)
    || (!/^(?:TỰ_LUẬN|TU_LUAN|ESSAY)$/i.test(textKey(answer.selectedAnswer)) ? textKey(answer.selectedAnswer) : '');
  return !typed && !answer.essayImages?.length && !submission.essayImages?.length;
}

export function isSubmissionAnswerPending(assignment: Assignment, submission: Submission, answer: StudentAnswer): boolean {
  if (hasTeacherGrade(answer)) return false;
  const question = getStudentQuestion(assignment, submission, answer.questionId);
  if (!question) return true;
  if (getMultipleChoiceSelectionIssue(question, answer) || answer.selectionReviewIssue) return true;
  if (answer.needsTeacherReview || answer.isProvisional || answer.aiGradingError) return true;
  return submission.gradingStatus === 'pending_teacher_grading' && !!question && isEssayQuestion(question)
    && !isSubmissionAnswerBlank(submission, answer, question);
}

export function getSubmissionSummary(assignment: Assignment, submission: Submission) {
  let correctCount = 0, wrongCount = 0, unansweredCount = 0, pendingCount = 0;
  let mcqPoints = 0, maxMcqPoints = 0, essayPoints = 0, maxEssayPoints = 0;
  for (const answer of submission.answers) {
    const question = getStudentQuestion(assignment, submission, answer.questionId);
    const max = Number.isFinite(answer.maxPoints) ? answer.maxPoints : question?.points || 0;
    const earned = hasTeacherGrade(answer) ? answer.teacherScore! : answer.pointsEarned || 0;
    if (question && isEssayQuestion(question)) { essayPoints += earned; maxEssayPoints += max; }
    else { mcqPoints += earned; maxMcqPoints += max; }
    if (isSubmissionAnswerPending(assignment, submission, answer)) pendingCount++;
    else if (isSubmissionAnswerBlank(submission, answer, question)) unansweredCount++;
    else if (answer.isCorrect) correctCount++;
    else wrongCount++;
  }
  const round = (n: number) => Math.round(n * 10000) / 10000;
  const scale = submission.maxScore > 0 ? submission.maxScore : 10;
  const max = maxMcqPoints + maxEssayPoints;
  return { correctCount, wrongCount, unansweredCount, pendingCount, totalQuestions: submission.answers.length,
    mcqPoints: round(mcqPoints), maxMcqPoints: round(maxMcqPoints), essayPoints: round(essayPoints), maxEssayPoints: round(maxEssayPoints),
    mcqScore: assignment.totalPoints ? round(mcqPoints) : maxMcqPoints ? round(mcqPoints / maxMcqPoints * 10) : 0,
    totalScore: max ? round((mcqPoints + essayPoints) / max * scale) : 0 };
}

// Call only after an explicit grading/review action. Display/export code uses the
// read-only summary above; it must never silently rewrite historical grades.
export function refreshSubmissionTotals(assignment: Assignment, submission: Submission): Submission {
  const answers = submission.answers.map(answer => {
    const issue = !hasTeacherGrade(answer) && getMultipleChoiceSelectionIssue(getStudentQuestion(assignment, submission, answer.questionId), answer);
    return issue ? { ...answer, needsTeacherReview: true, isProvisional: true, selectionReviewIssue: issue } : answer;
  });
  const candidate = { ...submission, answers };
  const { pendingCount, ...summary } = getSubmissionSummary(assignment, candidate);
  return { ...candidate, ...summary, ungradedCount: pendingCount,
    needsTeacherReview: pendingCount > 0,
    isProvisional: pendingCount > 0 || Boolean(submission.isProvisional),
    gradingStatus: pendingCount > 0
      ? (submission.gradingStatus === 'pending_teacher_grading' ? 'pending_teacher_grading' : 'needs_review')
      : submission.gradingStatus };
}

export function confirmMultipleChoiceSelection(assignment: Assignment, submission: Submission, id: string, label: string): Submission {
  const sourceIssue = getSubmissionSourceIssue(assignment, submission);
  if (sourceIssue) throw Error(sourceIssue);
  const question = getStudentQuestion(assignment, submission, id);
  const source = assignment.questions.find(q => q.id === id);
  if (!question || !source || isEssayQuestion(question) || question.type === 'short_answer') throw Error('Chưa tìm thấy câu trắc nghiệm để đối chiếu.');
  const option = question.options?.find(o => o.id === label);
  const key = getCorrectOptionLabel(question);
  if (!option || !question.options?.some(o => o.id === key)) throw Error('Cần kiểm tra đáp án nguồn trước khi xác nhận lựa chọn.');
  const isCorrect = option.id === key;
  const updated = { ...submission, answers: submission.answers.map(answer => answer.questionId !== id ? answer : {
    ...answer, selectedAnswer: option.id, selectedOptionText: option.text, originalSelectedLabel: (option as any).originalId || option.id,
    correctAnswer: key, isCorrect, pointsEarned: isCorrect ? answer.maxPoints : 0, teacherScore: isCorrect ? answer.maxPoints : 0,
    gradingReference: { correctAnswer: key, points: answer.maxPoints, rubric: source.rubric || '',
      explanation: source.explanation || '', ...(submission.shuffledQuestions?.some(q => q.id === id)
        && (source.imageUrl || '') === (question.imageUrl || '') ? {} : { imageUrl: source.imageUrl || '' }) },
    teacherReviewed: true, teacherFeedback: answer.teacherFeedback || 'Giáo viên đã đối chiếu lựa chọn trên đề học sinh.',
    selectionReviewIssue: undefined, needsTeacherReview: false, isProvisional: false, aiGradingError: false
  }) };
  return refreshSubmissionTotals(assignment, updated);
}
