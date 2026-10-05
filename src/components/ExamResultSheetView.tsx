import React from 'react';
import {
  Printer,
  CheckCircle2,
  XCircle,
  Clock,
  ArrowLeft,
  Check,
  X,
  AlertTriangle,
  FileCheck2,
  BookOpen
} from 'lucide-react';
import { Submission, Assignment, Question, StudentAnswer } from '../types';
import { MathDisplay } from './MathDisplay';
import { isEssayQuestion } from '../utils/questionUtils';
import { GradingService } from '../services/gradingService';

interface ExamResultSheetViewProps {
  submission: Submission;
  assignment: Assignment;
  onBackToDetailedView?: () => void;
  onRetake?: () => void;
  reviewMode?: 'score_only' | 'wrong_only' | 'full';
}

export const ExamResultSheetView: React.FC<ExamResultSheetViewProps> = ({
  submission,
  assignment,
  onBackToDetailedView,
  onRetake,
  reviewMode = 'full'
}) => {
  const questionPool: Question[] =
    submission.shuffledQuestions && submission.shuffledQuestions.length > 0
      ? submission.shuffledQuestions
      : assignment.questions;

  const isAnswerPending = (ans: StudentAnswer) =>
    ans.teacherScore === undefined &&
    Boolean(ans.needsTeacherReview || ans.isProvisional || ans.aiGradingError);

  const pendingAnswers = submission.answers.filter(isAnswerPending);
  const pendingCount = pendingAnswers.length;
  const visibleAnswers =
    reviewMode === 'score_only'
      ? []
      : reviewMode === 'wrong_only'
      ? submission.answers.filter(ans => !ans.isCorrect && !isAnswerPending(ans))
      : submission.answers;
  const hasPendingReview =
    Boolean(
      submission.isProvisional ||
      submission.needsTeacherReview ||
      submission.gradingStatus === 'pending_teacher_grading' ||
      submission.gradingStatus === 'needs_review' ||
      submission.gradingStatus === 'grading' ||
      submission.gradingStatus === 'failed'
    ) || pendingCount > 0;

  const reviewedAnswers = submission.answers.filter(ans => !isAnswerPending(ans));
  const reviewedCorrectCount = reviewedAnswers.filter(ans => ans.isCorrect).length;
  const reviewedWrongCount = reviewedAnswers.filter(ans => !ans.isCorrect).length;

  const scoreToDisplay =
    hasPendingReview && submission.mcqScore !== undefined
      ? submission.mcqScore
      : submission.totalScore;

  const statusTitle = hasPendingReview ? 'KẾT QUẢ TẠM TÍNH' : 'KẾT QUẢ CHÍNH THỨC';
  const statusNote = hasPendingReview
    ? 'Còn câu chờ giáo viên duyệt. Điểm và trạng thái có thể thay đổi sau khi duyệt.'
    : 'Kết quả đã hoàn tất chấm và không còn câu chờ giáo viên duyệt.';

  const handlePrint = () => window.print();

  const formatDate = (isoString?: string) => {
    if (!isoString) return '--/--/----';
    try {
      const d = new Date(isoString);
      return `${d.getHours().toString().padStart(2, '0')}:${d
        .getMinutes()
        .toString()
        .padStart(2, '0')} • ${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1)
        .toString()
        .padStart(2, '0')}/${d.getFullYear()}`;
    } catch {
      return isoString;
    }
  };

  const getQuestion = (ans: StudentAnswer, index: number) =>
    questionPool.find(q => q.id === ans.questionId) ||
    assignment.questions.find(q => q.id === ans.questionId) ||
    questionPool[index];

  const getStudentAnswerLabel = (ans: StudentAnswer, question?: Question) => {
    if (!question) return ans.selectedAnswer || '—';
    if (isEssayQuestion(question)) {
      const imageCount = ans.essayImages?.length || 0;
      if (ans.studentSolutionText && imageCount > 0) return `Tự luận • ${imageCount} ảnh`;
      if (ans.studentSolutionText) return 'Tự luận • đã nhập lời giải';
      if (imageCount > 0) return `Tự luận • ${imageCount} ảnh`;
      return 'Chưa làm';
    }
    if (!ans.selectedAnswer) return 'Chưa làm';
    return ans.selectedAnswer;
  };

  const getCorrectAnswerLabel = (question?: Question) => {
    if (!question) return '—';
    if (isEssayQuestion(question)) return 'Theo biểu điểm';
    return question.correctAnswer || '—';
  };

  const improvementItems = submission.answers
    .map((ans, idx) => {
      if (isAnswerPending(ans)) return null;
      const question = getQuestion(ans, idx);
      if (ans.firstErrorStep) {
        const extra = ans.firstErrorExplanation ? ` — ${ans.firstErrorExplanation}` : '';
        return `Câu ${question?.order || idx + 1}: lỗi gốc ở bước ${ans.firstErrorStep}${extra}`;
      }
      if (!ans.isCorrect) {
        return `Câu ${question?.order || idx + 1}: cần xem lại đáp án hoặc cách làm.`;
      }
      return null;
    })
    .filter((item): item is string => Boolean(item))
    .slice(0, 4);

  const answerTeacherFeedback = submission.answers
    .map(ans => ans.teacherFeedback?.trim())
    .filter((item): item is string => Boolean(item));
  const teacherFeedback = submission.teacherFeedback?.trim() || answerTeacherFeedback[0] || '';

  return (
    <div className="space-y-4">
      <style type="text/css" media="print">
        {`
          @page { size: A4 portrait; margin: 10mm 12mm; }
          .katex-mathml { display: none !important; }
          #result-sheet-print {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            border: none !important;
            box-shadow: none !important;
          }
          #result-sheet-print table { page-break-inside: auto; }
          #result-sheet-print tr { page-break-inside: avoid; page-break-after: auto; }
          #result-sheet-print .avoid-break { page-break-inside: avoid; }
        `}
      </style>

      <div className="print:hidden flex flex-wrap items-center justify-between gap-2 bg-white p-3 rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex items-center gap-2">
          {onBackToDetailedView && (
            <button
              onClick={onBackToDetailedView}
              className="px-3 py-2 rounded-xl text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors flex items-center gap-1.5"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Chi tiết</span>
            </button>
          )}
          <span className="text-xs font-bold text-slate-500">Phiếu kết quả A4</span>
        </div>

        <div className="flex items-center gap-2">
          {onRetake && (
            <button
              onClick={onRetake}
              className="px-3 py-2 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl"
            >
              Làm lại
            </button>
          )}
          <button
            onClick={handlePrint}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl flex items-center gap-2"
          >
            <Printer className="w-4 h-4" />
            <span>In / Lưu PDF</span>
          </button>
        </div>
      </div>

      <div
        id="result-sheet-print"
        className="bg-white rounded-2xl p-5 sm:p-8 shadow-lg border border-slate-200 print:border-none print:shadow-none print:p-0 print:m-0 text-slate-900"
      >
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 border-b border-slate-200 pb-4 mb-4 avoid-break">
          <div>
            <div className="text-[11px] font-black tracking-wider text-indigo-700">MATSUDA AI • TOÁN THCS</div>
            <h1 className="text-xl sm:text-2xl font-black mt-1">PHIẾU KẾT QUẢ BÀI LÀM</h1>
            <p className="text-xs text-slate-500 mt-1">
              {submission.assignmentTitle} • Mã bài: {assignment.assignmentCode || assignment.id}
            </p>
          </div>

          <div
            className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-black ${
              hasPendingReview
                ? 'bg-amber-50 border-amber-300 text-amber-800'
                : 'bg-emerald-50 border-emerald-300 text-emerald-800'
            }`}
          >
            {hasPendingReview ? <AlertTriangle className="w-4 h-4" /> : <FileCheck2 className="w-4 h-4" />}
            <span>{statusTitle}</span>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-slate-50 rounded-xl p-3 border border-slate-200 text-xs mb-4 avoid-break">
          <div>
            <span className="text-slate-400 block">Học sinh</span>
            <strong className="text-sm text-slate-900">{submission.studentName}</strong>
          </div>
          <div>
            <span className="text-slate-400 block">Lớp</span>
            <strong className="text-sm text-slate-900">{submission.className || '—'}</strong>
          </div>
          <div>
            <span className="text-slate-400 block">Thời gian làm</span>
            <strong className="text-sm text-slate-900">{GradingService.formatDuration(submission.timeSpentSeconds)}</strong>
          </div>
          <div>
            <span className="text-slate-400 block">Nộp lúc</span>
            <strong className="text-sm text-slate-900">{formatDate(submission.submittedAt)}</strong>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4 avoid-break">
          <div
            className={`rounded-2xl border p-4 text-center ${
              hasPendingReview
                ? 'bg-amber-50 border-amber-200'
                : 'bg-indigo-50 border-indigo-200'
            }`}
          >
            <div className={`text-[11px] font-black uppercase ${hasPendingReview ? 'text-amber-700' : 'text-indigo-700'}`}>
              {hasPendingReview ? 'Điểm tạm tính' : 'Điểm'}
            </div>
            <div className={`text-4xl font-black mt-1 ${hasPendingReview ? 'text-amber-700' : 'text-indigo-700'}`}>
              {scoreToDisplay.toFixed(1)}
              <span className="text-base text-slate-400"> / 10</span>
            </div>
          </div>

          <div className="sm:col-span-2 grid grid-cols-4 gap-2">
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-center">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 mx-auto mb-1" />
              <div className="text-xl font-black text-emerald-800">{reviewedCorrectCount}</div>
              <div className="text-[10px] text-emerald-700 font-bold">Đúng</div>
            </div>
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-center">
              <XCircle className="w-4 h-4 text-rose-600 mx-auto mb-1" />
              <div className="text-xl font-black text-rose-800">{reviewedWrongCount}</div>
              <div className="text-[10px] text-rose-700 font-bold">Cần xem lại</div>
            </div>
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-center">
              <Clock className="w-4 h-4 text-amber-600 mx-auto mb-1" />
              <div className="text-xl font-black text-amber-800">{pendingCount}</div>
              <div className="text-[10px] text-amber-700 font-bold">Chờ duyệt</div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-center">
              <BookOpen className="w-4 h-4 text-slate-500 mx-auto mb-1" />
              <div className="text-xl font-black text-slate-800">{submission.totalQuestions}</div>
              <div className="text-[10px] text-slate-600 font-bold">Tổng câu</div>
            </div>
          </div>
        </div>

        <div
          className={`mb-4 rounded-xl border px-3 py-2 text-[11px] avoid-break ${
            hasPendingReview
              ? 'bg-amber-50 border-amber-200 text-amber-800'
              : 'bg-slate-50 border-slate-200 text-slate-600'
          }`}
        >
          {statusNote}
        </div>

        {reviewMode !== 'score_only' && (
        <div className="mb-4">
          <h2 className="text-sm font-black mb-2">
            {reviewMode === 'wrong_only' ? 'Các câu cần xem lại' : 'Kết quả từng câu'}
          </h2>
          <div className="overflow-hidden rounded-xl border border-slate-200">
            <table className="w-full text-xs border-collapse table-fixed">
              <thead>
                <tr className="bg-slate-100 text-slate-700 font-black border-b border-slate-200">
                  <th className="py-2 px-2 w-[10%] text-center">Câu</th>
                  <th className="py-2 px-2 w-[24%] text-center">Bài làm HS</th>
                  <th className="py-2 px-2 w-[22%] text-center">Đáp án / chuẩn</th>
                  <th className="py-2 px-2 w-[18%] text-center">Điểm</th>
                  <th className="py-2 px-2 w-[26%] text-center">Trạng thái</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visibleAnswers.map((ans, idx) => {
                  const question = getQuestion(ans, idx);
                  const pending = isAnswerPending(ans);
                  const unanswered =
                    !ans.selectedAnswer &&
                    !ans.studentSolutionText &&
                    (!ans.essayImages || ans.essayImages.length === 0);

                  let status: React.ReactNode;
                  if (pending) {
                    status = (
                      <span className="inline-flex items-center gap-1 text-amber-700 font-bold">
                        <Clock className="w-3.5 h-3.5" /> Chờ GV duyệt
                      </span>
                    );
                  } else if (unanswered) {
                    status = <span className="text-slate-400">Chưa làm</span>;
                  } else if (ans.isCorrect) {
                    status = (
                      <span className="inline-flex items-center gap-1 text-emerald-700 font-bold">
                        <Check className="w-3.5 h-3.5" /> Đúng
                      </span>
                    );
                  } else {
                    status = (
                      <span className="inline-flex items-center gap-1 text-rose-700 font-bold">
                        <X className="w-3.5 h-3.5" /> Cần xem lại
                      </span>
                    );
                  }

                  return (
                    <tr key={ans.questionId || idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}>
                      <td className="py-2 px-2 text-center font-black">{question?.order || idx + 1}</td>
                      <td className="py-2 px-2 text-center font-bold text-slate-700">
                        {getStudentAnswerLabel(ans, question)}
                      </td>
                      <td className="py-2 px-2 text-center text-slate-600">
                        {pending ? 'Chờ duyệt' : getCorrectAnswerLabel(question)}
                      </td>
                      <td className="py-2 px-2 text-center font-bold">
                        {pending
                          ? `— / ${ans.maxPoints}đ`
                          : `${(ans.teacherScore ?? ans.pointsEarned).toFixed(1)} / ${ans.maxPoints}đ`}
                      </td>
                      <td className="py-2 px-2 text-center">{status}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {reviewMode === 'wrong_only' && visibleAnswers.length === 0 && (
            <div className="mt-2 text-center text-[11px] text-emerald-700 font-bold">
              Không có câu sai để xem lại.
            </div>
          )}
        </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 border-t border-slate-200 pt-4 avoid-break">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <h3 className="text-xs font-black text-slate-800 mb-2">{reviewMode === 'score_only' ? 'Trạng thái' : 'Điểm cần củng cố'}</h3>
            {reviewMode === 'score_only' ? (
              <p className="text-[11px] text-slate-600">Giáo viên chọn chế độ chỉ xem điểm cho bài này.</p>
            ) : improvementItems.length > 0 ? (
              <ul className="space-y-1 text-[11px] text-slate-600">
                {improvementItems.map((item, idx) => (
                  <li key={idx}>• {item}</li>
                ))}
              </ul>
            ) : hasPendingReview ? (
              <p className="text-[11px] text-amber-700">Chờ giáo viên duyệt các câu chưa có kết quả chính thức.</p>
            ) : (
              <p className="text-[11px] text-emerald-700">Không có lỗi nổi bật cần ưu tiên củng cố.</p>
            )}
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <h3 className="text-xs font-black text-slate-800 mb-2">Nhận xét giáo viên</h3>
            <p className="text-[11px] text-slate-600 whitespace-pre-line">
              {teacherFeedback || (hasPendingReview ? 'Chưa có nhận xét chính thức.' : '—')}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
