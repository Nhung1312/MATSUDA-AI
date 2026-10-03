import React, { useState } from 'react';
import {
  CheckCircle2,
  XCircle,
  GitBranch,
  AlertTriangle,
  HelpCircle,
  Sparkles,
  RefreshCw,
  Send,
  Loader2,
  BookOpen,
  ArrowRight,
  Target,
  Check,
  Award,
  Info,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  Zap
} from 'lucide-react';
import {
  StepAnalysis,
  StepStatus,
  StepErrorType,
  StepGradingResponse,
  RemedialExercise,
  VerifyCorrectionResponse
} from '../types';
import { MathDisplay } from './MathDisplay';
import { stepGradingService } from '../services/stepGradingService';
import { useLearningProgressStore } from '../store/useLearningProgressStore';

interface StepGradingBreakdownProps {
  questionId: string;
  questionText: string;
  grade?: string;
  topic?: string;
  result: StepGradingResponse;
  onOpenSocraticFromError?: (errorContext: {
    questionId: string;
    questionText: string;
    firstErrorStep: number;
    errorType: StepErrorType;
    studentLatex: string;
    referenceStepLatex?: string;
    comment: string;
    studentWork?: string;
  }) => void;
  onApplyCorrectionToWork?: (correctedText: string) => void;
}

export const StepGradingBreakdown: React.FC<StepGradingBreakdownProps> = ({
  questionId,
  questionText,
  grade = 'THCS',
  topic = 'Toán',
  result,
  onOpenSocraticFromError,
  onApplyCorrectionToWork,
}) => {
  const { analysis, firstErrorStep, firstErrorType, firstErrorExplanation, isAllCorrect, score, maxScore, feedback } = result;

  // Trạng thái tự sửa bước sai
  const [correctionInput, setCorrectionInput] = useState('');
  const [isVerifyingCorrection, setIsVerifyingCorrection] = useState(false);
  const [verificationResult, setVerificationResult] = useState<VerifyCorrectionResponse | null>(null);

  // Trạng thái bài tập tương tự bổ trợ (Remedial Exercise)
  const [remedialExercise, setRemedialExercise] = useState<RemedialExercise | null>(null);
  const [isGeneratingRemedial, setIsGeneratingRemedial] = useState(false);
  const [showRemedialHint, setShowRemedialHint] = useState(false);
  const [showRemedialSolution, setShowRemedialSolution] = useState(false);
  const [studentRemedialAnswer, setStudentRemedialAnswer] = useState('');
  const [remedialFeedback, setRemedialFeedback] = useState<string | null>(null);

  // First error step object
  const firstError = firstErrorStep
    ? analysis.find(s => s.stepIndex === firstErrorStep)
    : null;

  // Số bước đúng liên tiếp từ đầu
  const correctPrefixSteps = (() => {
    let count = 0;
    for (const st of analysis) {
      if (st.status === 'correct') count++;
      else break;
    }
    return count;
  })();

  // Helper render status badge
  const renderStatusBadge = (status: StepStatus, isFirstErr?: boolean) => {
    switch (status) {
      case 'correct':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-black bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            <span>✓ Bước đúng</span>
          </span>
        );
      case 'first_error':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-black bg-rose-100 dark:bg-rose-950/80 text-rose-800 dark:text-rose-300 border border-rose-300 dark:border-rose-800 animate-pulse">
            <XCircle className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
            <span>✗ Bước sai đầu tiên</span>
          </span>
        );
      case 'cascading_error':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-black bg-purple-100 dark:bg-purple-950/80 text-purple-800 dark:text-purple-300 border border-purple-300 dark:border-purple-800">
            <GitBranch className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
            <span>↳ Lỗi kéo theo (Không trừ điểm thêm)</span>
          </span>
        );
      case 'independent_error':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-black bg-amber-100 dark:bg-amber-950/80 text-amber-900 dark:text-amber-200 border border-amber-300 dark:border-amber-800">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
            <span>! Lỗi mới độc lập</span>
          </span>
        );
      case 'uncertain':
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-black bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700">
            <HelpCircle className="w-3.5 h-3.5 text-slate-500" />
            <span>? AI chưa chắc chắn</span>
          </span>
        );
    }
  };

  const getErrorTypeLabel = (type?: StepErrorType) => {
    switch (type) {
      case 'sign': return 'Quy tắc dấu (âm/dương, chuyển vế, bỏ ngoặc)';
      case 'calculation': return 'Tính toán số học / Phân số';
      case 'formula': return 'Công thức / Hằng đẳng thức';
      case 'logical': return 'Lập luận logic / Suy diễn';
      case 'condition': return 'Điều kiện xác định / Nghiệm';
      case 'transformation': return 'Quy tắc biến đổi tương đương';
      case 'concept': return 'Khái niệm toán học';
      case 'other': return 'Lỗi phương pháp';
      default: return 'Cần củng cố';
    }
  };

  // 1. Gửi tới Socratic AI từ đúng bước sai đầu tiên
  const handleTriggerSocraticFromError = () => {
    if (!firstError) return;
    useLearningProgressStore.getState().recordSocraticStartedFromError(questionId, firstError.stepIndex);

    onOpenSocraticFromError?.({
      questionId,
      questionText,
      firstErrorStep: firstError.stepIndex,
      errorType: firstError.errorType || 'sign',
      studentLatex: firstError.studentLatex,
      referenceStepLatex: firstError.referenceStepLatex,
      comment: firstError.comment,
      studentWork: analysis.map(s => `Bước ${s.stepIndex}: ${s.studentLatex}`).join('\n')
    });
  };

  // 2. Học sinh tự sửa bước sai và gửi kiểm tra
  const handleVerifyCorrection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!correctionInput.trim() || isVerifyingCorrection) return;

    setIsVerifyingCorrection(true);
    setVerificationResult(null);

    useLearningProgressStore.getState().recordStudentSubmittedCorrection(questionId, firstErrorStep || 1);

    try {
      const response = await stepGradingService.verifyCorrection({
        questionText,
        grade,
        topic,
        firstErrorStep: firstErrorStep || 1,
        firstErrorLatex: firstError?.studentLatex,
        errorType: firstErrorType || firstError?.errorType,
        studentCorrection: correctionInput.trim(),
        originalWork: analysis.map(s => `Bước ${s.stepIndex}: ${s.studentLatex}`).join('\n')
      });

      setVerificationResult(response);
      useLearningProgressStore.getState().recordCorrectionVerified(questionId, response.isCorrect, response.isProgress);

      if (response.isCorrect && onApplyCorrectionToWork) {
        onApplyCorrectionToWork(correctionInput.trim());
      }
    } catch (err: any) {
      console.error(err);
    } finally {
      setIsVerifyingCorrection(false);
    }
  };

  // 3. Tự sinh bài toán tương tự cùng dạng (Remedial Exercise)
  const handleGenerateRemedialExercise = async () => {
    if (isGeneratingRemedial) return;
    setIsGeneratingRemedial(true);
    setRemedialFeedback(null);
    setShowRemedialHint(false);
    setShowRemedialSolution(false);

    try {
      const response = await stepGradingService.generateRemedial({
        sourceQuestionId: questionId,
        sourceQuestionText: questionText,
        grade,
        topic,
        sourceErrorType: firstErrorType || firstError?.errorType || 'sign',
        sourceFirstErrorStep: firstErrorStep || 1,
        skillTarget: getErrorTypeLabel(firstErrorType || firstError?.errorType),
        difficulty: 'standard',
        studentMistakeSummary: firstError?.comment
      });

      if (response.success && response.exercise) {
        setRemedialExercise(response.exercise);
        useLearningProgressStore.getState().recordRemedialExerciseGenerated(
          questionId,
          response.exercise.id,
          response.exercise.metadata.skillTarget
        );
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsGeneratingRemedial(false);
    }
  };

  // 4. Kiểm tra đáp số bài tập tương tự
  const handleCheckRemedialAnswer = (e: React.FormEvent) => {
    e.preventDefault();
    if (!remedialExercise || !studentRemedialAnswer.trim()) return;

    const normalizedStudent = studentRemedialAnswer.trim().replace(/\s+/g, '').toLowerCase();
    const normalizedCorrect = remedialExercise.finalAnswer.trim().replace(/\$+/g, '').replace(/\s+/g, '').toLowerCase();

    const isMatch = normalizedStudent.includes(normalizedCorrect) || normalizedCorrect.includes(normalizedStudent);
    if (isMatch) {
      setRemedialFeedback('🎉 Hoàn toàn chính xác! Em đã làm chủ dạng bài và khắc phục hoàn toàn lỗ hổng.');
      useLearningProgressStore.getState().recordRemedialExerciseCompleted(remedialExercise.id, true);
    } else {
      setRemedialFeedback('💡 Đáp số của em chưa khớp hoàn toàn. Em hãy bấm "Xem gợi ý phương pháp" hoặc "Xem lời giải chi tiết" để đối chiếu nhé!');
      useLearningProgressStore.getState().recordRemedialExerciseCompleted(remedialExercise.id, false);
    }
  };

  return (
    <div className="space-y-5 text-slate-900 dark:text-slate-100">
      
      {/* ========================================================= */}
      {/* 1. KHUNG TỔNG HỢP SƯ PHẠM (PEDAGOGICAL SUMMARY)            */}
      {/* ========================================================= */}
      <div className={`p-4 sm:p-5 rounded-2xl border-2 transition-all shadow-sm ${
        isAllCorrect
          ? 'bg-emerald-50/70 dark:bg-emerald-950/30 border-emerald-300 dark:border-emerald-800'
          : 'bg-indigo-50/70 dark:bg-indigo-950/30 border-indigo-200 dark:border-indigo-800/80'
      }`}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-indigo-100 dark:border-indigo-900/60">
          <div className="flex items-center gap-2.5">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-black ${
              isAllCorrect ? 'bg-emerald-600 text-white' : 'bg-indigo-600 text-white'
            }`}>
              {isAllCorrect ? <CheckCircle2 className="w-6 h-6" /> : <Target className="w-5 h-5" />}
            </div>
            <div>
              <h3 className="font-extrabold text-sm sm:text-base flex items-center gap-2">
                <span>{isAllCorrect ? 'Lời giải chính xác hoàn toàn' : 'Phân tích chẩn đoán từng bước'}</span>
                <span className="text-xs font-black px-2 py-0.5 rounded-full bg-indigo-600 text-white">
                  {score} / {maxScore} điểm
                </span>
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-400 font-medium">
                {result.analysisSource === 'ai' ? '🤖 Đã chẩn đoán bằng AI Sư phạm' : '⚙️ Bộ chẩn đoán toán học dự phòng'}
              </p>
            </div>
          </div>

          {/* Action button if has first error */}
          {!isAllCorrect && firstError && onOpenSocraticFromError && (
            <button
              type="button"
              onClick={handleTriggerSocraticFromError}
              className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-xs font-black bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-700 text-white shadow-md hover:shadow-lg hover:brightness-110 active:scale-95 transition-all cursor-pointer"
            >
              <Sparkles className="w-4 h-4 text-amber-300 animate-pulse" />
              <span>Gợi mở từ chỗ em sai (Bước {firstErrorStep})</span>
            </button>
          )}
        </div>

        {/* 4 Trả lời sư phạm bắt buộc (Mục VI) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-3.5 text-xs">
          
          {/* Đến bước nào em vẫn đúng? */}
          <div className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-1">
            <div className="font-bold text-slate-500 uppercase tracking-wide flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              <span>Đến bước nào em vẫn đúng?</span>
            </div>
            <p className="text-slate-800 dark:text-slate-200 font-semibold leading-relaxed">
              {correctPrefixSteps > 0 ? (
                <>Từ <strong>Bước 1</strong> đến <strong>Bước {correctPrefixSteps}</strong> em thực hiện biến đổi rất chính xác và logic.</>
              ) : isAllCorrect ? (
                <>Em thực hiện chính xác <strong>toàn bộ {analysis.length} bước</strong> của bài giải.</>
              ) : (
                <>Cần lưu ý ngay từ bước biến đổi đầu tiên.</>
              )}
            </p>
          </div>

          {/* Bước đầu tiên sai ở đâu? */}
          <div className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-1">
            <div className="font-bold text-slate-500 uppercase tracking-wide flex items-center gap-1.5">
              <XCircle className="w-3.5 h-3.5 text-rose-600" />
              <span>Bước đầu tiên sai ở đâu?</span>
            </div>
            <p className="text-slate-800 dark:text-slate-200 font-semibold leading-relaxed">
              {firstErrorStep ? (
                <>Lỗi gốc xuất hiện tại <strong>Bước {firstErrorStep}</strong>: <em>{getErrorTypeLabel(firstErrorType || firstError?.errorType)}</em>.</>
              ) : (
                <>Không phát hiện lỗi sai trong bài làm.</>
              )}
            </p>
          </div>

          {/* Vì sao bước đó sai? */}
          <div className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-1">
            <div className="font-bold text-slate-500 uppercase tracking-wide flex items-center gap-1.5">
              <Info className="w-3.5 h-3.5 text-blue-600" />
              <span>Vì sao bước đó sai?</span>
            </div>
            <div className="text-slate-800 dark:text-slate-200 font-medium leading-relaxed">
              {firstErrorExplanation ? (
                <MathDisplay content={firstErrorExplanation} />
              ) : firstError ? (
                <MathDisplay content={firstError.comment} />
              ) : (
                <span>Các phép toán và suy luận đều tuân thủ chặt chẽ định lý.</span>
              )}
            </div>
          </div>

          {/* Các bước sau sai vì lỗi trước hay lỗi mới? */}
          <div className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-1">
            <div className="font-bold text-slate-500 uppercase tracking-wide flex items-center gap-1.5">
              <GitBranch className="w-3.5 h-3.5 text-purple-600" />
              <span>Tính chất các bước phía sau:</span>
            </div>
            <p className="text-slate-800 dark:text-slate-200 font-medium leading-relaxed">
              {(() => {
                const cascadingCount = analysis.filter(s => s.status === 'cascading_error').length;
                const independentCount = analysis.filter(s => s.status === 'independent_error').length;
                if (cascadingCount === 0 && independentCount === 0) {
                  return isAllCorrect ? 'Tất cả các bước đều chuẩn xác.' : 'Chỉ có 1 vị trí sai đơn lẻ.';
                }
                return `Có ${cascadingCount} bước sai do kéo theo (không trừ điểm thêm)${independentCount > 0 ? ` và ${independentCount} lỗi độc lập mới.` : '.'}`;
              })()}
            </p>
          </div>
        </div>
      </div>

      {/* ========================================================= */}
      {/* 2. DANH SÁCH CHI TIẾT TỪNG BƯỚC (STEP-BY-STEP BREAKDOWN)   */}
      {/* ========================================================= */}
      <div className="space-y-3">
        <h4 className="font-extrabold text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-2">
          <BookOpen className="w-4 h-4 text-indigo-600" />
          <span>Chi tiết đối chiếu từng dòng biến đổi ({analysis.length} bước)</span>
        </h4>

        <div className="space-y-2.5">
          {analysis.map((step) => {
            const isFirst = step.status === 'first_error';
            const isCascading = step.status === 'cascading_error';
            const isIndependent = step.status === 'independent_error';
            const isLowConfidence = step.confidence < 0.70 || step.status === 'uncertain';

            return (
              <div
                key={step.stepIndex}
                className={`p-3.5 sm:p-4 rounded-2xl border-2 transition-all ${
                  isFirst
                    ? 'bg-rose-50/80 dark:bg-rose-950/30 border-rose-400 dark:border-rose-800 ring-2 ring-rose-400/30'
                    : isCascading
                    ? 'bg-purple-50/50 dark:bg-purple-950/20 border-purple-200 dark:border-purple-800/60'
                    : isIndependent
                    ? 'bg-amber-50/60 dark:bg-amber-950/30 border-amber-300 dark:border-amber-800'
                    : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800'
                }`}
              >
                {/* Header: Step Number & Badge */}
                <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-slate-100 dark:border-slate-800">
                  <div className="flex items-center gap-2">
                    <span className={`w-6 h-6 rounded-lg flex items-center justify-center font-black text-xs ${
                      step.status === 'correct'
                        ? 'bg-emerald-600 text-white'
                        : isFirst
                        ? 'bg-rose-600 text-white'
                        : isCascading
                        ? 'bg-purple-600 text-white'
                        : 'bg-amber-500 text-white'
                    }`}>
                      {step.stepIndex}
                    </span>
                    <span className="font-extrabold text-xs text-slate-800 dark:text-slate-200">
                      Bước {step.stepIndex}
                    </span>
                    {step.errorType && step.errorType !== 'None' && (
                      <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                        {getErrorTypeLabel(step.errorType)}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    {renderStatusBadge(step.status, isFirst)}
                    <span className="text-[10px] font-mono text-slate-400" title="Độ tin cậy của AI">
                      Độ tin cậy: {Math.round(step.confidence * 100)}%
                    </span>
                  </div>
                </div>

                {/* Body: Student Latex vs Reference Step */}
                <div className="py-2.5 space-y-2">
                  <div className="space-y-1">
                    <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                      Bài làm của học sinh:
                    </div>
                    <div className="p-2 rounded-xl bg-slate-50 dark:bg-slate-800/60 font-mono text-xs sm:text-sm text-slate-900 dark:text-slate-100 border border-slate-200/70 dark:border-slate-700/60">
                      <MathDisplay content={step.studentLatex} />
                    </div>
                  </div>

                  {step.referenceStepLatex && (
                    <div className="space-y-1">
                      <div className="text-[11px] font-bold uppercase tracking-wider text-indigo-500">
                        Biểu thức chuẩn tương ứng:
                      </div>
                      <div className="p-2 rounded-xl bg-indigo-50/50 dark:bg-indigo-950/40 font-mono text-xs sm:text-sm text-indigo-950 dark:text-indigo-200 border border-indigo-200/60 dark:border-indigo-800/60">
                        <MathDisplay content={step.referenceStepLatex} />
                      </div>
                    </div>
                  )}

                  {/* Comment & Correction */}
                  <div className="text-xs pt-1">
                    <span className="font-bold text-slate-700 dark:text-slate-300">Nhận xét: </span>
                    <span className="text-slate-600 dark:text-slate-400">
                      <MathDisplay content={step.comment} />
                    </span>
                  </div>

                  {step.correctionLatex && (
                    <div className="p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 text-xs space-y-1">
                      <div className="font-bold text-emerald-800 dark:text-emerald-300 flex items-center gap-1">
                        <Zap className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Hướng sửa đúng cho bước này:</span>
                      </div>
                      <div className="font-mono text-emerald-900 dark:text-emerald-200">
                        <MathDisplay content={step.correctionLatex} />
                      </div>
                    </div>
                  )}

                  {/* Low confidence warning (Mục XII) */}
                  {isLowConfidence && (
                    <div className="p-2 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 text-[11px] text-amber-800 dark:text-amber-300 flex items-center gap-1.5">
                      <HelpCircle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                      <span>AI chưa chắc chắn về bước này do nét chữ mờ hoặc cách diễn đạt đặc biệt. Thầy/Cô sẽ duyệt lại.</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ========================================================= */}
      {/* 3. KHU VỰC HỌC SINH TỰ SỬA BÀI (MỤC VIII)                  */}
      {/* ========================================================= */}
      {!isAllCorrect && firstError && (
        <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-slate-900 border-2 border-indigo-200 dark:border-indigo-800 shadow-sm space-y-3.5">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
            <h4 className="font-extrabold text-sm text-indigo-900 dark:text-indigo-200 flex items-center gap-2">
              <RotateCcw className="w-4 h-4 text-indigo-600" />
              <span>Em hãy thử tự sửa lại Bước {firstErrorStep}</span>
            </h4>
            <span className="text-[11px] text-slate-400 font-medium">
              Tự giác sửa sai giúp nhớ sâu gấp 3 lần
            </span>
          </div>

          <form onSubmit={handleVerifyCorrection} className="space-y-3">
            <textarea
              rows={3}
              value={correctionInput}
              onChange={(e) => setCorrectionInput(e.target.value)}
              placeholder={`Viết lại bước biến đổi đúng của em tại đây (Ví dụ: Chuyển -6 sang vế phải thành +6, ta có 2x = 6...)...`}
              className="w-full text-xs font-mono p-3 bg-slate-50 dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-900 dark:text-slate-100 placeholder:font-sans placeholder:text-slate-400 resize-none"
            />

            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] text-slate-500">
                AI sẽ kiểm tra xem em đã khắc phục được lỗi gốc chưa mà không làm lộ đáp án.
              </span>
              <button
                type="submit"
                disabled={isVerifyingCorrection || !correctionInput.trim()}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-black bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white shadow-xs hover:shadow-md cursor-pointer transition-all active:scale-95"
              >
                {isVerifyingCorrection ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Đang kiểm tra...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>✓ Kiểm tra lại bước sửa</span>
                  </>
                )}
              </button>
            </div>
          </form>

          {/* Kết quả kiểm tra bước sửa */}
          {verificationResult && (
            <div className={`p-4 rounded-xl border-2 space-y-2 animate-in fade-in duration-200 ${
              verificationResult.isCorrect
                ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-800'
                : verificationResult.isProgress
                ? 'bg-blue-50 dark:bg-blue-950/40 border-blue-300 dark:border-blue-800'
                : 'bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-800'
            }`}>
              <div className="flex items-center justify-between">
                <h5 className="font-extrabold text-xs sm:text-sm text-slate-900 dark:text-white flex items-center gap-1.5">
                  <Award className="w-4 h-4 text-emerald-600" />
                  <span>{verificationResult.evaluationTitle}</span>
                </h5>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/60 dark:bg-slate-900/60">
                  {verificationResult.isCorrect ? 'ĐÃ ĐÚNG ✓' : 'CÓ TIẾN BỘ 💡'}
                </span>
              </div>
              <div className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                <MathDisplay content={verificationResult.feedback} />
              </div>
              <div className="pt-1 text-xs font-semibold text-indigo-700 dark:text-indigo-300 border-t border-slate-200/50 dark:border-slate-800/50">
                👉 Lời khuyên: <MathDisplay content={verificationResult.nextAdvice} />
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================= */}
      {/* 4. BÀI TẬP BỔ TRỢ TƯƠNG TỰ CÙNG DẠNG (MỤC IX & X)          */}
      {/* ========================================================= */}
      <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-br from-indigo-50 via-purple-50 to-white dark:from-slate-900 dark:via-indigo-950/30 dark:to-slate-900 border-2 border-indigo-200 dark:border-indigo-800/80 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-indigo-100 dark:border-indigo-900/60">
          <div>
            <h4 className="font-extrabold text-sm sm:text-base text-indigo-950 dark:text-indigo-200 flex items-center gap-2">
              <Target className="w-4 h-4 text-indigo-600" />
              <span>Bài tập tương tự rèn luyện cùng dạng (Isomorphic Problem)</span>
            </h4>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Tạo bài toán mới cùng kỹ năng nhưng thay đổi số liệu để rèn luyện vững vàng
            </p>
          </div>

          <button
            type="button"
            onClick={handleGenerateRemedialExercise}
            disabled={isGeneratingRemedial}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-xs font-black bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white shadow-md hover:shadow-lg transition-all cursor-pointer active:scale-95"
          >
            {isGeneratingRemedial ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>AI đang tạo bài mới...</span>
              </>
            ) : (
              <>
                <RefreshCw className="w-3.5 h-3.5" />
                <span>🎯 Luyện thêm một bài tương tự</span>
              </>
            )}
          </button>
        </div>

        {/* Nội dung bài tập tương tự đã sinh */}
        {remedialExercise ? (
          <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-indigo-100 dark:border-slate-800 space-y-3.5 animate-in fade-in">
            {/* Metadata nguồn gốc (Mục X) */}
            <div className="flex flex-wrap items-center gap-2 text-[10px] font-bold text-indigo-600 dark:text-indigo-400">
              <span className="px-2.5 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950 border border-indigo-200 dark:border-indigo-800">
                Nguồn: Câu {questionId}
              </span>
              <span className="px-2.5 py-0.5 rounded-full bg-purple-50 dark:bg-purple-950 border border-purple-200 dark:border-purple-800">
                Kỹ năng: {remedialExercise.metadata.skillTarget}
              </span>
              <span className="px-2.5 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950 border border-emerald-200 dark:border-emerald-800">
                Khắc phục lỗi: {remedialExercise.metadata.sourceErrorType} (Bước {remedialExercise.metadata.sourceFirstErrorStep})
              </span>
            </div>

            <div className="font-extrabold text-sm text-slate-900 dark:text-white">
              {remedialExercise.title}
            </div>

            {/* Đề bài dạng LaTeX */}
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 font-semibold text-xs sm:text-sm text-slate-800 dark:text-slate-200 border border-slate-200/80 dark:border-slate-700/80">
              <MathDisplay content={remedialExercise.problemLatex} />
            </div>

            {/* Input thử làm bài tập tương tự */}
            <form onSubmit={handleCheckRemedialAnswer} className="flex flex-col sm:flex-row gap-2 pt-1">
              <input
                type="text"
                value={studentRemedialAnswer}
                onChange={(e) => setStudentRemedialAnswer(e.target.value)}
                placeholder="Nhập đáp số của em (VD: x = 5 hoặc 3/4)..."
                className="flex-1 text-xs font-mono p-2.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-900 dark:text-white"
              />
              <button
                type="submit"
                disabled={!studentRemedialAnswer.trim()}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold cursor-pointer transition-all active:scale-95"
              >
                Kiểm tra đáp số
              </button>
            </form>

            {remedialFeedback && (
              <div className="p-3 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 text-xs font-bold text-indigo-900 dark:text-indigo-200 animate-in fade-in">
                {remedialFeedback}
              </div>
            )}

            {/* Hint & Solution Toggles */}
            <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100 dark:border-slate-800 text-xs">
              <button
                type="button"
                onClick={() => setShowRemedialHint(!showRemedialHint)}
                className="px-3 py-1.5 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 font-bold flex items-center gap-1 cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                <span>{showRemedialHint ? 'Ẩn gợi ý' : 'Xem gợi ý phương pháp'}</span>
              </button>

              <button
                type="button"
                onClick={() => setShowRemedialSolution(!showRemedialSolution)}
                className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold flex items-center gap-1 cursor-pointer"
              >
                <BookOpen className="w-3.5 h-3.5 text-indigo-500" />
                <span>{showRemedialSolution ? 'Ẩn lời giải mẫu' : 'Xem lời giải mẫu chi tiết'}</span>
              </button>
            </div>

            {showRemedialHint && (
              <div className="p-3 rounded-xl bg-amber-50/80 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 text-xs text-amber-900 dark:text-amber-200 space-y-1">
                <span className="font-bold">Gợi ý phương pháp:</span>
                <MathDisplay content={remedialExercise.hint} />
              </div>
            )}

            {showRemedialSolution && (
              <div className="p-3.5 rounded-xl bg-indigo-50/50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800/60 text-xs text-indigo-950 dark:text-indigo-200 space-y-2">
                <span className="font-bold">Lời giải chi tiết từng bước:</span>
                <div className="font-mono leading-relaxed">
                  <MathDisplay content={remedialExercise.solutionLatex} />
                </div>
                <div className="font-bold pt-1 text-emerald-600 dark:text-emerald-400">
                  Đáp số cuối: {remedialExercise.finalAnswer}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="text-center py-4 text-xs text-slate-500 dark:text-slate-400">
            Nhấn nút <strong>"🎯 Luyện thêm một bài tương tự"</strong> để AI sinh ngay một bài tập cùng dạng rèn luyện cho câu hỏi này.
          </div>
        )}
      </div>

    </div>
  );
};
