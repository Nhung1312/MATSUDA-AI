import React from 'react';
import { 
  Printer, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  BookOpen, 
  ShieldCheck, 
  ArrowLeft,
  Check,
  X
} from 'lucide-react';
import { Submission, Assignment, Question } from '../types';
import { MathDisplay } from './MathDisplay';
import { isEssayQuestion } from '../utils/questionUtils';
import { GradingService } from '../services/gradingService';

interface ExamResultSheetViewProps {
  submission: Submission;
  assignment: Assignment;
  onBackToDetailedView?: () => void;
  onRetake?: () => void;
}

export const ExamResultSheetView: React.FC<ExamResultSheetViewProps> = ({
  submission,
  assignment,
  onBackToDetailedView,
  onRetake
}) => {
  // Lấy danh sách câu hỏi đã xáo trộn (chính xác với những gì học sinh đã làm)
  const questionPool: Question[] = submission.shuffledQuestions && submission.shuffledQuestions.length > 0
    ? submission.shuffledQuestions
    : assignment.questions;

  const score = submission.totalScore;
  let gradeRank = 'Trung bình';
  let rankBadgeColor = 'bg-amber-100 text-amber-800 border-amber-300';

  if (score >= 9.0) {
    gradeRank = 'Xuất sắc ⭐⭐⭐';
    rankBadgeColor = 'bg-emerald-100 text-emerald-800 border-emerald-300';
  } else if (score >= 8.0) {
    gradeRank = 'Giỏi ⭐⭐';
    rankBadgeColor = 'bg-blue-100 text-blue-800 border-blue-300';
  } else if (score >= 6.5) {
    gradeRank = 'Khá ⭐';
    rankBadgeColor = 'bg-indigo-100 text-indigo-800 border-indigo-300';
  } else if (score >= 5.0) {
    gradeRank = 'Trung bình';
    rankBadgeColor = 'bg-amber-100 text-amber-800 border-amber-300';
  } else {
    gradeRank = 'Cần cố gắng thêm';
    rankBadgeColor = 'bg-rose-100 text-rose-800 border-rose-300';
  }

  const handlePrint = () => {
    window.print();
  };

  const formatDate = (isoString?: string) => {
    if (!isoString) return '--/--/----';
    try {
      const d = new Date(isoString);
      return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')} ngày ${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()}`;
    } catch {
      return isoString;
    }
  };

  return (
    <div className="space-y-6">
      {/* CSS In ấn khổ A4 chuẩn cho Phiếu Báo Điểm */}
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
        `}
      </style>

      {/* Top Action Bar (Hidden when printing) */}
      <div className="print:hidden flex flex-wrap items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex items-center space-x-2">
          {onBackToDetailedView && (
            <button
              onClick={onBackToDetailedView}
              className="px-3.5 py-2 rounded-xl text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Xem chi tiết câu hỏi</span>
            </button>
          )}
          <span className="text-xs font-bold text-slate-500">
            Chế độ: <strong className="text-indigo-600">Phiếu kết quả thi chính thức</strong>
          </span>
        </div>

        <div className="flex items-center space-x-2">
          {onRetake && (
            <button
              onClick={onRetake}
              className="px-4 py-2 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
            >
              Làm lại đề này
            </button>
          )}

          <button
            onClick={handlePrint}
            className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-xs rounded-xl shadow-md flex items-center gap-2 transition-all active:scale-95 cursor-pointer"
          >
            <Printer className="w-4 h-4" />
            <span>In Phiếu kết quả (A4)</span>
          </button>
        </div>
      </div>

      {/* OFFICIAL RESULT SHEET DOCUMENT (PRINT-FRIENDLY A4 CARD) */}
      <div id="result-sheet-print" className="bg-white rounded-3xl p-6 sm:p-10 shadow-lg border border-slate-200 print:border-none print:shadow-none print:p-0 print:m-0 text-slate-900">
        
        {/* FORMAL HEADER */}
        <div className="border-b-2 border-indigo-900/20 pb-6 mb-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <span className="text-[11px] font-black uppercase tracking-widest text-indigo-700 block">
                HỆ THỐNG TOÁN THCS • KHẢO THÍ & ĐÁNH GIÁ NĂNG LỰC
              </span>
              <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight mt-1">
                PHIẾU BÁO ĐIỂM & KẾT QUẢ BÀI THI
              </h1>
              <p className="text-xs text-slate-500 mt-0.5">
                Mã bài nộp: <code className="font-mono text-indigo-700">{submission.id}</code>
              </p>
            </div>

            <div className="text-right sm:text-right shrink-0">
              <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                <span>Đã ghi nhận & chứng thực</span>
              </div>
              <div className="text-[11px] text-slate-400 mt-1">
                Thời điểm nộp: {formatDate(submission.submittedAt)}
              </div>
            </div>
          </div>

          {/* STUDENT & EXAM INFO GRID */}
          <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50/80 rounded-2xl p-4 border border-slate-200/80 text-xs">
            <div>
              <span className="text-slate-400 font-medium block">Họ và tên thí sinh:</span>
              <strong className="text-sm font-black text-slate-900">{submission.studentName}</strong>
            </div>
            <div>
              <span className="text-slate-400 font-medium block">Lớp / Khối:</span>
              <strong className="text-sm font-black text-indigo-700">{submission.className}</strong>
            </div>
            <div>
              <span className="text-slate-400 font-medium block">Bài thi / Chủ đề:</span>
              <strong className="text-sm font-black text-slate-900 truncate block" title={submission.assignmentTitle}>
                {submission.assignmentTitle}
              </strong>
            </div>
            <div>
              <span className="text-slate-400 font-medium block">Thời gian làm bài:</span>
              <strong className="text-sm font-black text-slate-900">
                {GradingService.formatDuration(submission.timeSpentSeconds)}
              </strong>
            </div>
          </div>
        </div>

        {/* SCORE HIGHLIGHT BANNER */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <div className="bg-gradient-to-br from-indigo-50 to-purple-50 p-5 rounded-2xl border-2 border-indigo-200 text-center flex flex-col justify-center items-center">
            <span className="text-xs font-bold text-indigo-700 uppercase tracking-wider mb-1">
              Điểm Tổng Kết
            </span>
            <div className="flex items-baseline space-x-1.5">
              <span className="text-4xl sm:text-5xl font-black text-indigo-700">
                {score.toFixed(1)}
              </span>
              <span className="text-lg font-bold text-slate-400">/ 10.0</span>
            </div>
            <span className={`inline-block text-xs font-extrabold px-3 py-1 rounded-full border mt-2 ${rankBadgeColor}`}>
              {gradeRank}
            </span>
          </div>

          <div className="sm:col-span-2 grid grid-cols-3 gap-2 bg-slate-50 p-4 rounded-2xl border border-slate-200/80 text-center">
            <div className="bg-white p-3 rounded-xl border border-slate-200 flex flex-col justify-center">
              <div className="flex items-center justify-center space-x-1 text-emerald-600 text-xs font-bold mb-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Số câu đúng</span>
              </div>
              <span className="text-2xl font-black text-emerald-700">
                {submission.correctCount}
              </span>
              <span className="text-[10px] text-slate-400">
                /{submission.totalQuestions} câu
              </span>
            </div>

            <div className="bg-white p-3 rounded-xl border border-slate-200 flex flex-col justify-center">
              <div className="flex items-center justify-center space-x-1 text-rose-600 text-xs font-bold mb-1">
                <XCircle className="w-3.5 h-3.5" />
                <span>Số câu sai</span>
              </div>
              <span className="text-2xl font-black text-rose-700">
                {submission.wrongCount}
              </span>
              <span className="text-[10px] text-slate-400">
                /{submission.totalQuestions} câu
              </span>
            </div>

            <div className="bg-white p-3 rounded-xl border border-slate-200 flex flex-col justify-center">
              <div className="flex items-center justify-center space-x-1 text-slate-500 text-xs font-bold mb-1">
                <Clock className="w-3.5 h-3.5" />
                <span>Chưa làm</span>
              </div>
              <span className="text-2xl font-black text-slate-700">
                {submission.unansweredCount}
              </span>
              <span className="text-[10px] text-slate-400">
                /{submission.totalQuestions} câu
              </span>
            </div>
          </div>
        </div>

        {/* DETAILED ANSWER MATRIX TABLE */}
        <div className="mb-6">
          <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider mb-3 flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-indigo-600" />
            <span>Bảng đối chiếu câu hỏi & đáp án chi tiết</span>
          </h3>

          <div className="overflow-x-auto rounded-2xl border border-slate-200">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-100 text-slate-700 font-black border-b border-slate-200">
                  <th className="py-2.5 px-3 w-12 text-center">Câu</th>
                  <th className="py-2.5 px-3 min-w-[200px]">Nội dung câu hỏi tóm tắt</th>
                  <th className="py-2.5 px-3 w-40 text-center">Bạn chọn</th>
                  <th className="py-2.5 px-3 w-40 text-center">Đáp án đúng</th>
                  <th className="py-2.5 px-3 w-24 text-center">Điểm đạt</th>
                  <th className="py-2.5 px-3 w-24 text-center">Kết quả</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {submission.answers.map((ans, idx) => {
                  const question = questionPool.find(q => q.id === ans.questionId) || assignment.questions.find(q => q.id === ans.questionId);
                  const isEssay = question ? isEssayQuestion(question) : false;
                  const isCorrect = ans.isCorrect;
                  const isUnanswered = !ans.selectedAnswer && !ans.studentSolutionText && (!ans.essayImages || ans.essayImages.length === 0);

                  // Extract student chosen option text (giải quyết triệt để lỗi đảo đáp án)
                  let studentText = ans.selectedOptionText;
                  if (!studentText && question?.options) {
                    const matchedOpt = question.options.find(o => o.id === ans.selectedAnswer);
                    if (matchedOpt) studentText = matchedOpt.text;
                  }

                  // Extract correct option text
                  let correctText = '';
                  if (question?.options) {
                    const matchedCorrect = question.options.find(o => o.id === question.correctAnswer);
                    if (matchedCorrect) correctText = matchedCorrect.text;
                  }

                  return (
                    <tr 
                      key={ans.questionId || idx}
                      className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}
                    >
                      {/* Câu */}
                      <td className="py-2.5 px-3 text-center font-black text-slate-800">
                        {question?.order || (idx + 1)}
                      </td>

                      {/* Nội dung câu hỏi */}
                      <td className="py-2.5 px-3 text-slate-700 max-w-sm print:max-w-none">
                        <div className="leading-relaxed break-words text-xs">
                          {question ? <MathDisplay text={question.question} /> : `Câu ${idx + 1}`}
                        </div>
                      </td>

                      {/* Bạn chọn */}
                      <td className="py-2.5 px-3 text-center">
                        {isEssay ? (
                          <span className="inline-block px-2 py-0.5 rounded-md text-[10px] font-bold bg-purple-100 text-purple-800">
                            {ans.studentSolutionText || (ans.essayImages && ans.essayImages.length > 0) ? 'Đã làm TL' : 'Chưa làm'}
                          </span>
                        ) : isUnanswered ? (
                          <span className="text-slate-400 italic">(Bỏ trống)</span>
                        ) : (
                          <div className="inline-flex flex-col items-center">
                            <span className={`inline-flex items-center justify-center w-7 h-7 rounded-lg font-black text-xs ${
                              isCorrect ? 'bg-emerald-600 text-white shadow-xs' : 'bg-rose-600 text-white shadow-xs'
                            }`}>
                              {ans.selectedAnswer}
                            </span>
                            {studentText && (
                              <div className="text-[11px] text-slate-700 max-w-[150px] print:max-w-none mt-1 font-semibold break-words">
                                <MathDisplay text={studentText} inline={true} />
                              </div>
                            )}
                          </div>
                        )}
                      </td>

                      {/* Đáp án đúng */}
                      <td className="py-2.5 px-3 text-center">
                        {isEssay ? (
                          <span className="text-slate-500 text-[11px] font-bold">Theo biểu điểm</span>
                        ) : (
                          <div className="inline-flex flex-col items-center">
                            <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg font-black text-xs bg-emerald-100 text-emerald-800 border border-emerald-300">
                              {question?.correctAnswer || '--'}
                            </span>
                            {correctText && (
                              <div className="text-[11px] text-emerald-800 max-w-[150px] print:max-w-none mt-1 font-semibold break-words">
                                <MathDisplay text={correctText} inline={true} />
                              </div>
                            )}
                          </div>
                        )}
                      </td>

                      {/* Điểm đạt */}
                      <td className="py-2.5 px-3 text-center font-bold text-slate-800">
                        +{ans.pointsEarned} / {ans.maxPoints} đ
                      </td>

                      {/* Kết quả */}
                      <td className="py-2.5 px-3 text-center">
                        {isCorrect ? (
                          <span className="inline-flex items-center gap-0.5 text-emerald-700 font-bold text-[11px]">
                            <Check className="w-3.5 h-3.5 stroke-[3]" /> Đúng
                          </span>
                        ) : isUnanswered ? (
                          <span className="text-slate-400 text-[11px]">Chưa làm</span>
                        ) : (
                          <span className="inline-flex items-center gap-0.5 text-rose-600 font-bold text-[11px]">
                            <X className="w-3.5 h-3.5 stroke-[3]" /> Sai
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* TEACHER EVALUATION & PARENT SIGNATURE BOX */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-t-2 border-slate-200 pt-6 mt-6 text-xs">
          <div className="border border-slate-200 rounded-2xl p-4 bg-slate-50/50">
            <span className="font-black text-slate-700 uppercase tracking-wider block mb-1">
              Nhận xét của Giáo viên / Hệ thống:
            </span>
            <p className="text-slate-600 italic leading-relaxed">
              {score >= 8.0 
                ? 'Em nắm rất vững kiến thức trọng tâm, tính toán chính xác và phân tích đề bài tốt. Tiếp tục phát huy!'
                : score >= 5.0
                  ? 'Em đã có cố gắng và nắm được kiến thức cơ bản. Cần chú ý đọc kỹ các bẫy trắc nghiệm và ôn lại các câu đã làm sai.'
                  : 'Em cần ôn tập lại lý thuyết chuyên đề và làm lại các câu bị sai trong Sổ tay câu sai để củng cố kỹ năng.'}
            </p>
          </div>

          <div className="border border-slate-200 rounded-2xl p-4 flex flex-col justify-between text-center bg-slate-50/50">
            <span className="font-black text-slate-700 uppercase tracking-wider">
              Xác nhận của Phụ huynh học sinh
            </span>
            <span className="text-[11px] text-slate-400 italic">
              (Ký và ghi rõ họ tên)
            </span>
            <div className="h-12 border-b border-dashed border-slate-300 mx-8 my-2"></div>
            <span className="text-[10px] text-slate-400">
              Ngày ..... tháng ..... năm 2026
            </span>
          </div>
        </div>

      </div>
    </div>
  );
};
