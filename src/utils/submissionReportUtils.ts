import type { Assignment, Question, StudentAnswer, Submission } from '../types';
import { isEssayQuestion } from './questionUtils';
import { getStudentQuestion, getSubmissionSourceIssue } from './submissionReviewUtils';

export function captureGradingReference(question: Question, snapshot?: Pick<Question, 'imageUrl'>): NonNullable<StudentAnswer['gradingReference']> {
  return { correctAnswer: question.correctAnswer || '', rubric: question.rubric || '',
    explanation: question.explanation || '', points: question.points,
    // The submitted snapshot already owns these bytes. Omission means reuse its image;
    // an explicit empty string still records that grading used no source image.
    ...(snapshot && (snapshot.imageUrl || '') === (question.imageUrl || '') ? {} : { imageUrl: question.imageUrl || '' }) };
}

export function getSavedGradingReference(submission: Submission, answer: StudentAnswer) {
  const saved = submission.shuffledQuestions?.find(q => q.id === answer.questionId);
  return answer.gradingReference ? { ...answer.gradingReference, imageUrl: answer.gradingReference.imageUrl ?? saved?.imageUrl ?? '' }
    : saved ? captureGradingReference(saved) : undefined;
}

/** Display saved evidence only. Current source answers must never leak into an old grade. */
export function getSavedReportQuestion(assignment: Assignment, submission: Submission, id: string): Question | undefined {
  const answer = submission.answers.find(a => a.questionId === id);
  const snapshot = submission.shuffledQuestions?.find(q => q.id === id);
  const base = snapshot || assignment.questions.find(q => q.id === id);
  if (!base || !answer) return undefined;
  const reference = getSavedGradingReference(submission, answer);
  return { ...base, question: snapshot?.question || 'Chưa lưu nội dung đề gốc cho câu này.',
    options: snapshot?.options || [], correctAnswer: answer.correctAnswer ?? reference?.correctAnswer ?? '',
    rubric: reference?.rubric, explanation: reference?.explanation,
    imageUrl: snapshot?.imageUrl, points: answer.maxPoints };
}

const textKey = (value?: string) => String(value || '').normalize('NFC').trim().replace(/\s+/g, ' ');

/** Read-only warning; does not invalidate, recalculate or persist historical scores. */
export function getSubmissionReportSourceIssue(assignment: Assignment, submission: Submission): string | null {
  const structuralIssue = getSubmissionSourceIssue(assignment, submission);
  if (structuralIssue) return structuralIssue;
  for (const answer of submission.answers) {
    const source = assignment.questions.find(q => q.id === answer.questionId);
    const reference = getSavedGradingReference(submission, answer);
    if (!source || !reference || !submission.shuffledQuestions?.some(q => q.id === answer.questionId)) {
      return 'Bài này chưa lưu đủ bản đề hoặc căn cứ chấm để đối chiếu. Phiếu giữ nguyên điểm và dữ liệu đã lưu; cần giáo viên kiểm tra với bản gốc.';
    }
    // Compare keys in the student's labels, so option shuffling alone is not an edit.
    const mapped = isEssayQuestion(source) || !source.options?.length ? source : getStudentQuestion(assignment, submission, answer.questionId);
    const validSourceKey = isEssayQuestion(source) || !source.options?.length || source.options.some(option =>
      textKey(option.id).toUpperCase() === textKey(source.correctAnswer).toUpperCase() || textKey(option.text) === textKey(source.correctAnswer));
    const savedKey = answer.correctAnswer ?? reference.correctAnswer;
    if (answer.gradingReference && answer.correctAnswer !== undefined
      && textKey(answer.correctAnswer) !== textKey(answer.gradingReference.correctAnswer)) {
      return 'Đáp án và căn cứ chấm đã lưu chưa khớp nhau. Phiếu giữ nguyên dữ liệu; cần giáo viên đối chiếu trước khi chốt.';
    }
    if (!validSourceKey || textKey(mapped?.correctAnswer) !== textKey(savedKey)
      || textKey(source.rubric) !== textKey(reference.rubric)
      || textKey(source.explanation) !== textKey(reference.explanation)
      || (source.imageUrl || '') !== (reference.imageUrl || '')
      || source.points !== reference.points || source.points !== answer.maxPoints) {
      return 'Đáp án, barem, lời giải, hình hoặc thang điểm nguồn đã thay đổi so với kết quả đã lưu. Phiếu dùng căn cứ đã lưu; cần giáo viên đối chiếu trước khi chốt hoặc chấm lại.';
    }
  }
  return null;
}
