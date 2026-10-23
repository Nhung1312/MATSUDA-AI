import React from 'react';
import type { Assignment, Submission } from '../types';

/** Rendered only after the submission write has been acknowledged by Firebase. */
export function StudentSubmissionReceipt({ submission, assignment }: { submission: Submission; assignment: Assignment }) {
  const pending = submission.hasEssayQuestions && (submission.isProvisional || submission.gradingStatus !== 'graded');
  return <div role="status" className="rounded-2xl border border-emerald-300 bg-emerald-50 p-5 text-emerald-950">
    <h2 className="font-black text-xl">NỘP BÀI THÀNH CÔNG</h2>
    <p>Firebase đã xác nhận nhận bài. Bạn có thể đóng trang.</p>
    {assignment.allowViewResult !== false && (submission.maxMcqPoints ?? submission.maxScore) > 0 && <p>Điểm trắc nghiệm{pending ? ' tạm thời' : ''}: {submission.mcqPoints ?? submission.mcqScore ?? submission.totalScore}/{submission.maxMcqPoints ?? submission.maxScore} điểm.</p>}
    {pending && <><p>Tự luận: Chờ chấm AI / giáo viên duyệt.</p><p>Điểm tổng kết: Chưa chốt.</p></>}
  </div>;
}
