import type { StudentAnswer, Submission } from '../types';

/** Empty question images use the submission's shared pages, in their original order. */
export function getSubmissionAnswerImages(submission: Submission, answer: StudentAnswer): string[] {
  return answer.essayImages?.length ? answer.essayImages : submission.essayImages || [];
}

/** Remove only exact, ordered copies of the complete shared photo set. No image bytes change. */
export function compactSubmissionImages(submission: Submission): Submission {
  const shared = submission.essayImages;
  if (!shared?.length) return submission;
  let changed = false;
  const answers = submission.answers.map(answer => {
    const images = answer.essayImages;
    if (!images?.length || images.length !== shared.length
      || !images.every((image, index) => image === shared[index])) return answer;
    changed = true;
    return { ...answer, essayImages: [] };
  });
  return changed ? { ...submission, answers } : submission;
}
